import type { NextRequest } from 'next/server';

import { audioContentDisposition, audioDownloadExtension } from '@/lib/audio-download';
import { createMp3DownloadResponse } from '@/lib/audio-transcode';
import { corsHeadersForRequest, jsonResponse, optionsResponse } from '@/lib/cors';
import { requireLocalMediaNamespace } from '@/lib/runtime-target';
import { verifySignedStream } from '@/lib/stream-signing';

export const runtime = 'nodejs';

const SOUNDCLOUD_AUDIO_USER_AGENT = 'SPICE-Music-Player/1.0';

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
  if (!verifySignedStream({ id, itag, upstreamUrl, expiresAt: expires }, sig)) {
    return jsonResponse(
      { error: 'stream_expired', message: 'SoundCloud stream URL has expired or its signature is invalid.' },
      { status: 403 },
      request,
    );
  }

  const headers: Record<string, string> = {
    'User-Agent': SOUNDCLOUD_AUDIO_USER_AGENT,
  };
  let rangeHeader = request.headers.get('range');

  const isDownload = request.nextUrl.searchParams.get('download') === 'true';
  const isMp3Download = isDownload && request.nextUrl.searchParams.get('format') === 'mp3';

  if (isMp3Download) {
    try {
      return await createMp3DownloadResponse({
        sourceUrl: upstreamUrl,
        title: request.nextUrl.searchParams.get('title'),
        userAgent: SOUNDCLOUD_AUDIO_USER_AGENT,
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
    // Optimize Vercel Fluid Compute: chunking
    const CHUNK_SIZE = 2 * 1024 * 1024; // 2MB
    if (!rangeHeader) {
        rangeHeader = `bytes=0-${CHUNK_SIZE - 1}`;
    } else {
        const parts = rangeHeader.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : start + CHUNK_SIZE - 1;
        rangeHeader = `bytes=${start}-${Math.min(end, start + CHUNK_SIZE - 1)}`;
    }
    headers['Range'] = rangeHeader;
  }

  try {
    const upstream = await fetch(upstreamUrl, { headers });
    if (!upstream.ok && upstream.status !== 206 && upstream.status !== 416) {
      return Response.redirect(upstreamUrl, 307);
    }

    if (upstream.status === 416) {
        // Range Not Satisfiable
        return new Response(null, {
            status: 416,
            headers: { ...corsHeadersForRequest(request), 'Content-Range': upstream.headers.get('content-range') || 'bytes */*' }
        });
    }

    const responseHeaders: Record<string, string> = {
      ...corsHeadersForRequest(request),
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-store',
    };
    let contentType: string | null = null;
    for (const name of ['content-type', 'content-length', 'content-range']) {
      const value = upstream.headers.get(name);
      if (name === 'content-type') contentType = value;
      if (value) responseHeaders[name] = value;
    }

    if (request.nextUrl.searchParams.get('download') === 'true') {
      const title = request.nextUrl.searchParams.get('title') || 'audio';
      const extension = audioDownloadExtension(contentType, request.nextUrl.searchParams.get('container'));
      responseHeaders['Content-Disposition'] = audioContentDisposition(title, extension);
    }

    return new Response(upstream.body, {
      status: upstream.status,
      headers: responseHeaders,
    });
  } catch {
    return Response.redirect(upstreamUrl, 307);
  }
}
