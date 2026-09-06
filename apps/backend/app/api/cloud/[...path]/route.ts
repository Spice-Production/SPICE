import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { proxyToLegacyApi, namespaceOptionsResponse } from '@/lib/api-namespace-proxy';
import { jsonResponse, withCors } from '@/lib/cors';
import { effectiveRequestOrigin } from '@/lib/request-host';
import { isCloudRuntime } from '@/lib/runtime-target';

export const runtime = 'nodejs';

const CLOUD_API_ROOTS = new Set([
  'account',
  'admin',
  'auth',
  'changelog',
  'downloads',
  'feedback',
  'lastfm',
  'listen-together',
  'notifications',
  'playlists',
  'profile',
  'remote',
  'sync',
  'updates',
  'users',
  'version',
]);

interface RouteParams {
  params: Promise<{ path?: string[] }>;
}

export function OPTIONS(request: NextRequest) {
  return namespaceOptionsResponse(request);
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  return proxyCloudRequest(request, (await params).path ?? []);
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  return proxyCloudRequest(request, (await params).path ?? []);
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  return proxyCloudRequest(request, (await params).path ?? []);
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  return proxyCloudRequest(request, (await params).path ?? []);
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  return proxyCloudRequest(request, (await params).path ?? []);
}

function proxyCloudRequest(request: NextRequest, path: string[]) {
  if (isCloudRuntime()) {
    return redirectCloudNamespaceRequest(request, path);
  }

  return proxyToLegacyApi(
    request,
    path,
    CLOUD_API_ROOTS,
    'cloud',
    cloudApiOrigin(),
  );
}

function redirectCloudNamespaceRequest(request: NextRequest, path: string[]) {
  const root = path[0] ?? '';
  if (!CLOUD_API_ROOTS.has(root)) {
    return jsonResponse(
      {
        error: 'route_not_available',
        message: 'The /api/cloud namespace does not expose this route.',
      },
      { status: 404 },
      request,
    );
  }

  const incomingUrl = new URL(request.url);
  // Redirect at the client-facing origin, never request.url's bind-address
  // origin: behind Caddy the latter is https://0.0.0.0:3000, which browsers
  // block outright (this broke every /api/cloud/* call, incl. login).
  const targetUrl = new URL(`/api/${path.map(encodeURIComponent).join('/')}`, effectiveRequestOrigin(request));
  targetUrl.search = incomingUrl.search;

  return withCors(NextResponse.redirect(targetUrl, 307), request);
}

function cloudApiOrigin() {
  return (
    process.env.SPICE_CLOUD_API_ORIGIN ||
    process.env.NEXT_PUBLIC_SPICE_CLOUD_API_ORIGIN ||
    'https://music.spice-app.xyz'
  );
}
