// Request-host resolution for the runtime gates.
//
// The Next.js standalone server does not build request.url from the Host
// header (observed on the self-host box: request.url carries the bind
// address no matter what Host says), so gates cannot rely on url.hostname
// alone. Effective host = X-Forwarded-Host ?? Host ?? URL host.
//
// Trust note: the app container publishes no ports — only Caddy and
// container-local callers can reach it. Caddy sets X-Forwarded-Host from the
// inbound Host, so behind the proxy these headers describe the public
// request. The hostname gate is routing-shape validation only; actual media
// authorization stays in requireSelfhostMediaAuth (Origin/Referer or bearer
// token).

export function hostWithoutPort(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return null;
  const bracketed = trimmed.match(/^\[([^\]]+)\](?::\d+)?$/);
  if (bracketed) return bracketed[1];
  const lastColon = trimmed.lastIndexOf(':');
  // A single colon separates host:port; more colons mean a bare IPv6 literal.
  if (lastColon !== -1 && trimmed.indexOf(':') === lastColon) {
    return trimmed.slice(0, lastColon) || null;
  }
  return trimmed;
}

export function effectiveRequestHost(request: Request): string {
  return (
    hostWithoutPort(request.headers.get('x-forwarded-host')?.split(',')[0]) ??
    hostWithoutPort(request.headers.get('host')) ??
    hostWithoutPort(safeUrlHostname(request.url)) ??
    ''
  );
}

export function isLoopbackHost(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname === '[::1]'
  );
}

function safeUrlHostname(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}
