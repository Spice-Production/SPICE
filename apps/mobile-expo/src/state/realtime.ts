import { RealtimeEventParser, type RealtimeEvent } from '../core/connect';
import { SpiceApiError } from '../core/parsers';

/**
 * Opens the Spice Connect SSE stream and resolves with the first command or
 * state wakeup (or null when the server closes the stream). React Native's
 * XMLHttpRequest delivers incremental text, which fetch cannot stream here.
 */
export function awaitRemoteEvent(
  url: string,
  token: string,
  userAgent: string,
  onReady: () => void,
  signal: AbortSignal,
): Promise<RealtimeEvent | null> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const parser = new RealtimeEventParser();
    let consumed = 0;
    let buffer = '';
    let settled = false;
    const finish = (result: RealtimeEvent | null, error?: unknown) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener('abort', abort);
      clearTimeout(idleTimer);
      try {
        xhr.abort();
      } catch {
        // Already closed.
      }
      if (error !== undefined) reject(error);
      else resolve(result);
    };
    const abort = () => finish(null);
    // The server heartbeats well inside this window; silence means a dead socket.
    let idleTimer = setTimeout(() => finish(null), 65_000);
    const consume = () => {
      const text = xhr.responseText ?? '';
      if (text.length <= consumed) return;
      buffer += text.slice(consumed);
      consumed = text.length;
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => finish(null), 65_000);
      let newline = buffer.indexOf('\n');
      while (newline >= 0 && !settled) {
        const line = buffer.slice(0, newline).replace(/\r$/, '');
        buffer = buffer.slice(newline + 1);
        const event = parser.consumeLine(line);
        if (event === 'Ready') onReady();
        else if (event === 'Command' || event === 'State') finish(event);
        newline = buffer.indexOf('\n');
      }
    };
    signal.addEventListener('abort', abort);
    xhr.open('GET', url);
    xhr.setRequestHeader('Accept', 'text/event-stream');
    xhr.setRequestHeader('Cache-Control', 'no-cache');
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.setRequestHeader('User-Agent', userAgent);
    xhr.onprogress = consume;
    xhr.onreadystatechange = () => {
      if (xhr.readyState === XMLHttpRequest.HEADERS_RECEIVED && (xhr.status < 200 || xhr.status > 299) && xhr.status !== 0) {
        // Error bodies arrive on DONE; wait for them.
        return;
      }
      if (xhr.readyState === XMLHttpRequest.DONE) {
        if (xhr.status >= 200 && xhr.status <= 299) {
          consume();
          finish(null);
          return;
        }
        let message = `Spice Connect realtime stream returned HTTP ${xhr.status}.`;
        try {
          const body = JSON.parse(xhr.responseText || '{}') as { message?: string; error?: string };
          message = body.message || body.error || message;
        } catch {
          // Keep the generic message.
        }
        finish(null, new SpiceApiError(message, { statusCode: xhr.status || null }));
      }
    };
    xhr.onerror = () => finish(null, new SpiceApiError('Spice Connect realtime stream failed.'));
    xhr.send();
  });
}
