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

/**
 * Public origin of this request: scheme from X-Forwarded-Proto (Caddy
 * terminates TLS, so the internal URL is always http) over the effective
 * host. Used anywhere the server hands a URL back to the client — signed
 * stream URLs, OAuth callbacks, share links — which must point at the
 * address the client actually used, not the container bind address.
 */
export function effectiveRequestOrigin(request: Request): string {
  const protoHeader = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim().toLowerCase();
  const scheme = protoHeader === 'http' || protoHeader === 'https' ? protoHeader : null;
  const forwardedHost = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim();
  const hostHeader = request.headers.get('host')?.trim();
  try {
    const url = new URL(request.url);
    return `${scheme ?? url.protocol.replace(/:$/, '')}://${forwardedHost || hostHeader || url.host}`;
  } catch {
    return `${scheme ?? 'http'}://${forwardedHost || hostHeader || 'localhost'}`;
  }
}

/**
 * Loopback origin of the server handling this request: 127.0.0.1 on the
 * port the request arrived on (the listen port — request.url carries it
 * even when its hostname is the bind address). Namespace proxies self-fetch
 * through this instead of the incoming origin so proxied media calls never
 * hairpin out to the public address and back (which fails TLS/handshake
 * from inside the container network).
 */
export function loopbackOriginFor(requestUrl: string): string {
  try {
    const port = new URL(requestUrl).port || process.env.PORT || '3000';
    return `http://127.0.0.1:${port}`;
  } catch {
    return `http://127.0.0.1:${process.env.PORT || '3000'}`;
  }
}

function safeUrlHostname(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}
