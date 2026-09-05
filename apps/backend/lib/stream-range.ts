export const STREAM_CHUNK_SIZE = 2 * 1024 * 1024; // 2MB

/**
 * Clamp a browser Range header to one proxied chunk.
 *
 * Suffix ranges (`bytes=-N`), multi-ranges, and malformed values fall back
 * to the first chunk — the old split/parseInt parser turned those into
 * `bytes=NaN-NaN` upstreams instead. Well-formed starts beyond EOF pass
 * through untouched so the upstream 416 path still answers correctly.
 */
export function parseRangeHeader(rangeHeader: string | null, chunkSize = STREAM_CHUNK_SIZE): string {
  const fresh = `bytes=0-${chunkSize - 1}`;
  if (!rangeHeader) return fresh;
  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
  if (!match) return fresh;
  const [, startRaw, endRaw] = match;
  if (startRaw === '') return fresh;
  const start = Number(startRaw);
  if (!Number.isSafeInteger(start) || start < 0) return fresh;
  const end = endRaw === '' ? start + chunkSize - 1 : Number(endRaw);
  if (!Number.isSafeInteger(end) || end < start) return fresh;
  return `bytes=${start}-${Math.min(end, start + chunkSize - 1)}`;
}
