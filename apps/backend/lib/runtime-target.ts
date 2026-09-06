import { jsonResponse } from '@/lib/cors';
import { currentLocalRuntimeVersion, localUpdateManifestUrl } from '@/lib/local-updates';
import { isVerifiedRemoteMediaDeviceRequest } from './remote-media-devices.ts';
import { effectiveRequestHost, isLoopbackHost } from './request-host.ts';

export type SpiceRuntimeTarget = 'local' | 'vercel' | 'selfhost';

export function getRuntimeTarget(): SpiceRuntimeTarget {
  const configured = process.env.SPICE_RUNTIME_TARGET?.trim().toLowerCase();
  if (configured === 'local' || configured === 'vercel' || configured === 'selfhost') {
    return configured;
  }
  return process.env.VERCEL ? 'vercel' : 'local';
}

export function isLocalRuntime() {
  const target = getRuntimeTarget();
  return target === 'local' || target === 'selfhost';
}

export function isCloudRuntime() {
  const target = getRuntimeTarget();
  return target === 'vercel' || target === 'selfhost';
}

export function requireLocalRuntime(request: Request) {
  if (!isLocalRuntime()) {
    return jsonResponse(
      {
        error: 'local_runtime_required',
        message: 'This media service route only runs in the SPICE local PC runtime.',
      },
      { status: 404 },
      request,
    );
  }

  // request.url carries the bind address under the standalone server, not
  // the Host header (see lib/request-host.ts) — resolve the effective host
  // from the forwarded chain so the public origin matches behind Caddy.
  const hostname = effectiveRequestHost(request);
  if (isLoopbackHost(hostname)) return null;

  // Self-hosted boxes sit behind a reverse proxy under a public hostname, so
  // loopback alone would lock out the very deployment. The public host is
  // admitted here; media-call authorization itself lives in
  // requireLocalMediaNamespace below.
  if (getRuntimeTarget() === 'selfhost' && isSelfhostPublicHost(hostname)) {
    return null;
  }

  return jsonResponse(
    {
      error: 'loopback_required',
      message: 'Local media service routes only accept localhost or 127.0.0.1 requests.',
    },
    { status: 403 },
    request,
  );
}

export function requireCloudRuntime(request: Request) {
  if (!isCloudRuntime()) {
    return jsonResponse(
      {
        error: 'cloud_runtime_required',
        message: 'This account and sync route is served by the SPICE Vercel runtime.',
      },
      { status: 404 },
      request,
    );
  }

  return null;
}

export function requireLocalMediaNamespace(request: Request) {
  const namespace = request.headers.get('x-spice-api-namespace');
  if (namespace !== 'local') {
    return jsonResponse(
      {
        error: 'legacy_media_api_frozen',
        message: 'Media scraping and stream extraction moved to /api/local/* on the SPICE local PC runtime.',
      },
      { status: 410 },
      request,
    );
  }

  const runtimeBlock = requireLocalRuntime(request);
  if (runtimeBlock) return runtimeBlock;
  return requireSelfhostMediaAuth(request);
}

/**
 * Public-host media authorization for self-hosted boxes. Loopback callers
 * (local processes, direct desktop/CLI access) always pass. Browsers on the
 * site pass via same-origin Origin/Referer. Anything else needs the bearer
 * media token; when no token is configured, token-less non-browser callers
 * (curl, health probes) still pass while foreign browsers stay blocked.
 */
export function requireSelfhostMediaAuth(request: Request) {
  if (getRuntimeTarget() !== 'selfhost') return null;

  if (isLoopbackHost(effectiveRequestHost(request))) return null;

  const publicHost = selfhostPublicHost();
  const originHost = hostOfHeader(request.headers.get('origin'));
  const refererHost = hostOfHeader(request.headers.get('referer'));
  if (publicHost && (originHost === publicHost || refererHost === publicHost)) return null;

  const token = process.env.SPICE_SELFHOST_MEDIA_TOKEN?.trim();
  if (token && request.headers.get('authorization')?.trim() === `Bearer ${token}`) return null;
  if (isVerifiedRemoteMediaDeviceRequest(request)) return null;
  if (!token && !originHost && !refererHost) return null;

  return jsonResponse(
    {
      error: 'media_auth_required',
      message:
        'This self-hosted box requires same-origin requests or a media token for media routes.',
    },
    { status: 401 },
    request,
  );
}

/** Public hostname of a self-hosted box, from SPICE_PUBLIC_ORIGIN. */
export function selfhostPublicHost(): string | null {
  const configured = process.env.SPICE_PUBLIC_ORIGIN?.trim();
  if (!configured) return null;
  try {
    return new URL(configured).hostname.toLowerCase() || null;
  } catch {
    return null;
  }
}

export function isSelfhostPublicHost(hostname: string): boolean {
  const publicHost = selfhostPublicHost();
  return Boolean(publicHost) && hostname.toLowerCase() === publicHost;
}

function hostOfHeader(value: string | null): string | null {
  if (!value) return null;
  try {
    return new URL(value).hostname.toLowerCase() || null;
  } catch {
    return null;
  }
}

export function runtimeConfigPayload() {
  const cloudApiOrigin =
    process.env.SPICE_CLOUD_API_ORIGIN ||
    process.env.NEXT_PUBLIC_SPICE_CLOUD_API_ORIGIN ||
    'https://music.spice-app.xyz';

  return {
    runtimeTarget: getRuntimeTarget(),
    cloudApiOrigin,
    localApiOrigin:
      process.env.SPICE_LOCAL_API_ORIGIN ||
      process.env.NEXT_PUBLIC_SPICE_LOCAL_API_ORIGIN ||
      'http://127.0.0.1:3939',
    localRuntimeVersion: currentLocalRuntimeVersion(),
    updateManifestUrl: localUpdateManifestUrl(cloudApiOrigin),
  };
}
