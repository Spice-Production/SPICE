import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getProxySystemSettings } from '@/lib/proxy-system-settings';
import { effectiveRequestHost, shouldServeHub } from '@/lib/request-host';

export async function proxy(request: NextRequest) {
  const url = request.nextUrl.clone();

  // Apex hub: the bare apex domain serves the hub landing page while the
  // music subdomain serves the player directly. Rewrite (not redirect) so
  // the address bar keeps showing the apex domain.
  if (shouldServeHub(effectiveRequestHost(request), url.pathname, process.env.SPICE_APEX_DOMAIN)) {
    return NextResponse.rewrite(new URL('/hub', request.url));
  }

  // Keep admin bootstrap and management APIs reachable so operators can
  // verify their session and disable an emergency stop from the dashboard.
  if (!url.pathname.startsWith('/api') || isAdminEmergencyBypassPath(url.pathname)) {
    return NextResponse.next();
  }

  // Pre-flight OPTIONS should always pass through
  if (request.method === 'OPTIONS') {
    return NextResponse.next();
  }

  try {
    const settings = await getProxySystemSettings();
    if (!settings) return NextResponse.next();

    if (settings.emergencyStop) {
      return new NextResponse(
        JSON.stringify({ error: 'service_unavailable', message: 'System is temporarily halted for maintenance.' }),
        { status: 503, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Keep austerity throttling off hot polling APIs. Emergency stop remains global
    // for non-admin API routes, while austerity only gates sync writes.
    if (!url.pathname.startsWith('/api/sync')) {
      return NextResponse.next();
    }

    if (settings.emergencyAusterity) {
      if (settings.disableSync) {
        return new NextResponse(
          JSON.stringify({ error: 'service_unavailable', message: 'Sync services are temporarily disabled.' }),
          { status: 503, headers: { 'Content-Type': 'application/json' } }
        );
      }

      // Randomly throttle based on rate (0-100)
      // If throttle rate is 80, 80% of requests should be dropped
      const randomValue = Math.random() * 100;
      if (randomValue < settings.austerityThrottleRate) {
        return new NextResponse(
          JSON.stringify({ error: 'too_many_requests', message: 'System is under heavy load. Please try again later.' }),
          { status: 429, headers: { 'Content-Type': 'application/json', 'Retry-After': '60' } }
        );
      }
    }

    return NextResponse.next();
  } catch (error) {
    console.error('Middleware system settings check failed:', error);
    // Fail open if the database is unreachable to avoid breaking the whole app
    return NextResponse.next();
  }
}

export const config = {
  // Deployment metadata and update/download routes stay available during an
  // emergency stop and bypass Proxy entirely so CDN hits do not wake Neon.
  matcher: '/api/((?!version/?$|runtime/?$|notifications/release/?$|updates/local-(?:windows|linux|macos)/?$|downloads/local-(?:windows|linux|macos)/?$).*)',
};

function isAdminEmergencyBypassPath(pathname: string) {
  return (
    isPathOrChild(pathname, '/api/admin') ||
    pathname === '/api/account/me' ||
    isPathOrChild(pathname, '/api/cloud/admin') ||
    pathname === '/api/cloud/account/me'
  );
}

function isPathOrChild(pathname: string, parentPath: string) {
  return pathname === parentPath || pathname.startsWith(`${parentPath}/`);
}
