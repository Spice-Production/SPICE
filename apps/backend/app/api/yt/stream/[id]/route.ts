import type { NextRequest } from 'next/server';

import { audioContentDisposition, audioDownloadExtension } from '@/lib/audio-download';
import { createMp3DownloadResponse } from '@/lib/audio-transcode';
import { corsHeadersForRequest, jsonResponse, optionsResponse } from '@/lib/cors';
import { requireLocalMediaNamespace } from '@/lib/runtime-target';
import { parseRangeHeader } from '@/lib/stream-range';
import { verifySignedStream } from '@/lib/stream-signing';

/**
 * Audio stream proxy.
 *
 * Receives signed URLs from `/api/local/yt/track/[id]`, verifies the signature,
 * then proxies the upstream YouTube audio with Range-request support so
 * the browser's `<audio>` element can seek freely.
 */
export const runtime = 'nodejs';

const YOUTUBE_AUDIO_USER_AGENT = 'com.google.ios.youtube/19.29.1 (iPhone16,2; U; CPU iOS 17_5_1 like Mac OS X;)';
const BROWSER_USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36(KHTML, like Gecko)';

/**
 * PO-token-bearing URLs resolved via web-family clients (YTMUSIC) reject
 * iOS-app user agents outright (HTTP 403) — the CDN checks them against the
 * client family baked into the URL. Such URLs must be fetched with a plain
 * browser identity; anything else keeps the historical app identity.
 */
function upstreamUserAgent(upstreamUrl: string): string {
  return /([?&])pot=/.test(upstreamUrl) ? BROWSER_USER_AGENT : YOUTUBE_AUDIO_USER_AGENT;
}

export function OPTIONS(request: NextRequest) {
  return optionsResponse(request);
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const blocked = await requireLocalMediaNamespace(request);
  if (blocked) return blocked;

  const { id } = await params;
  const sp = request.nextUrl.searchParams;
  const itag = Number(sp.get('itag'));
  const expires = Number(sp.get('expires'));
  const encodedUrl = sp.get('u');
  const sig = sp.get('sig');

  if (!encodedUrl || !sig || !Number.isFinite(itag) || !Number.isFinite(expires)) {
    return jsonResponse(
      { error: 'invalid_params', message: 'Missing or malformed stream parameters.' },
      { status: 400 },
      request,
    );
  }

  const upstreamUrl = Buffer.from(encodedUrl, 'base64url').toString();

  const valid = verifySignedStream(
    { id, itag, upstreamUrl, expiresAt: expires },
    sig,
  );

  if (!valid) {
    return jsonResponse(
      { error: 'stream_expired', message: 'Stream URL has expired or signature is invalid. Fetch a new one from /api/local/yt/track/[id].' },
      { status: 403 },
      request,
    );
  }

  // Forward Range header from the browser so seeking works.
  const headers: Record<string, string> = {
    'User-Agent': upstreamUserAgent(upstreamUrl),
  };
  let rangeHeader = request.headers.get('range');

  const isDownload = request.nextUrl.searchParams.get('download') === 'true';
  const isMp3Download = isDownload && request.nextUrl.searchParams.get('format') === 'mp3';

  if (isMp3Download) {
    try {
      return await createMp3DownloadResponse({
        sourceUrl: upstreamUrl,
        title: request.nextUrl.searchParams.get('title'),
        userAgent: upstreamUserAgent(upstreamUrl),
        headers: corsHeadersForRequest(request),
        signal: request.signal,
      });
    } catch (error) {
      return jsonResponse(
        {
          error: 'mp3_conversion_failed',
          message: error instanceof Error ? error.message : 'The audio could not be converted to MP3.',
        },
        { status: 502 },
        request,
      );
    }
  }

  if (isDownload) {
    if (rangeHeader) {
      headers['Range'] = rangeHeader;
    }
  } else {
    // Optimize Vercel Fluid Compute: chunking (robust parse — suffix and
    // multi-range headers used to become `bytes=NaN-NaN` upstreams).
    rangeHeader = parseRangeHeader(rangeHeader);
    headers['Range'] = rangeHeader;
  }

  try {
    let upstream;
    try {
      console.log(`[stream-proxy] Fetching upstream: ${upstreamUrl.substring(0, 100)}...`);
      upstream = await fetch(upstreamUrl, {
        headers: { 'User-Agent': upstreamUserAgent(upstreamUrl), ...(rangeHeader ? { Range: rangeHeader } : {}) },
        // Client disconnects must not leave hung upstream connections, and
        // googlevideo must not hang the proxy forever.
        signal: AbortSignal.any([request.signal, AbortSignal.timeout(30_000)]),
      });
      console.log(`[stream-proxy] Upstream response status: ${upstream.status}`);
    } catch (fetchErr) {
      // No unsigned-URL fallback: redirecting to the raw googlevideo URL
      // bypasses the 10-min HMAC expiry and leaks the pot token into browser
      // history/logs, for a URL the browser would likely 403 on anyway.
      console.warn(`[stream-proxy] Proxy fetch failed:`, fetchErr);
      return jsonResponse(
        {
          error: 'upstream_unreachable',
          message: 'The audio source could not be reached. Retry the track.',
        },
        { status: 502 },
        request,
      );
    }

    if (!upstream.ok && upstream.status !== 206 && upstream.status !== 416) {
      // Same rationale: a known-bad upstream status (403 cap, 5xx) will not
      // heal by bouncing the browser to the same URL unsigned.
      console.warn(`[stream-proxy] Upstream failed with status ${upstream.status}.`);
      return jsonResponse(
        {
          error: 'upstream_error',
          message: `The audio source answered ${upstream.status}. Retry the track.`,
        },
        { status: 502 },
        request,
      );
    }

    if (upstream.status === 416) {
        // Range Not Satisfiable
        return new Response(null, {
            status: 416,
            headers: { ...corsHeadersForRequest(request), 'Content-Range': upstream.headers.get('content-range') || 'bytes */*' }
        });
    }

    // Build response headers for the browser.
    // NOTE: The `<audio>` element may load this endpoint cross-origin
    // (e.g. the shell runs on 127.0.0.1 while signed URLs resolve to
    // localhost). Without Access-Control-Allow-Origin Chromium aborts the
    // media fetch and surfaces MEDIA_ELEMENT_ERROR / code 4. Responses here
    // are authorized by the stream signature, so the wildcard is safe.
    const responseHeaders: Record<string, string> = {
      ...corsHeadersForRequest(request),
      'Access-Control-Allow-Origin': '*',
    };

    const contentType = upstream.headers.get('content-type');
    if (contentType) responseHeaders['Content-Type'] = contentType;

    const contentLength = upstream.headers.get('content-length');
    if (contentLength) responseHeaders['Content-Length'] = contentLength;

    const contentRange = upstream.headers.get('content-range');
    if (contentRange) responseHeaders['Content-Range'] = contentRange;

    responseHeaders['Accept-Ranges'] = 'bytes';
    // Prevent the browser from caching stale signed URLs.
    responseHeaders['Cache-Control'] = 'no-store';

    if (request.nextUrl.searchParams.get('download') === 'true') {
      const title = request.nextUrl.searchParams.get('title') || 'audio';
      const extension = audioDownloadExtension(contentType, request.nextUrl.searchParams.get('container'));
      responseHeaders['Content-Disposition'] = audioContentDisposition(title, extension);
    }

    return new Response(upstream.body, {
      status: upstream.status,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error(`[stream-proxy] Error fetching upstream:`, error);
    return jsonResponse(
      {
        error: 'proxy_error',
        message: error instanceof Error ? error.message : 'Failed to proxy audio stream.',
      },
      { status: 502 },
      request,
    );
  }
}
