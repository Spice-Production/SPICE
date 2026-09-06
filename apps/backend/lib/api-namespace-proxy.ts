import { corsHeadersForRequest, jsonResponse, withCors, withoutDecodedBodyHeaders } from '@/lib/cors';
import { loopbackOriginFor } from '@/lib/request-host';

const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'content-length',
  'host',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);

export async function proxyToLegacyApi(
  request: Request,
  path: string[],
  allowedRoots: Set<string>,
  namespace: 'local' | 'cloud',
  targetOrigin?: string,
) {
  const root = path[0] ?? '';
  if (!allowedRoots.has(root)) {
    return jsonResponse(
      {
        error: 'route_not_available',
        message: `The /api/${namespace} namespace does not expose this route.`,
      },
      { status: 404 },
      request,
    );
  }

  const incomingUrl = new URL(request.url);
  // Self-fetch through loopback, never the incoming origin: behind Caddy the
  // incoming origin is the public https address, which hairpins out of the
  // container network and back (TLS/handshake failure → 500). Explicit
  // cross-origin targets still opt in via targetOrigin (cloud namespace).
  const origin = targetOrigin || loopbackOriginFor(request.url);
  const targetUrl = new URL(`/api/${path.map(encodeURIComponent).join('/')}`, origin);
  targetUrl.search = incomingUrl.search;

  const headers = new Headers(request.headers);
  for (const name of HOP_BY_HOP_HEADERS) {
    headers.delete(name);
  }
  headers.set('x-spice-api-namespace', namespace);

  const method = request.method.toUpperCase();
  const init: RequestInit = {
    method,
    headers,
    redirect: 'manual',
  };

  if (method !== 'GET' && method !== 'HEAD') {
    init.body = await request.arrayBuffer();
  }

  const response = await fetch(targetUrl, init);
  const proxyResponse = namespace === 'cloud' ? withoutDecodedBodyHeaders(response) : response;
  return withCors(proxyResponse, request);
}

export function namespaceOptionsResponse(request: Request) {
  return new Response(null, { status: 204, headers: corsHeadersForRequest(request) });
}
