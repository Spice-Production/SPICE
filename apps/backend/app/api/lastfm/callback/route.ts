import type { NextRequest } from 'next/server';

import { verifyLastFmLinkState } from '@/lib/auth';
import { isAllowedCorsOrigin } from '@/lib/cors';
import { createLastFmSession } from '@/lib/lastfm';
import { effectiveRequestOrigin } from '@/lib/request-host';
import { saveLastFmConnection } from '@/lib/profile-connections';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token')?.trim() || '';
  const spiceState = request.nextUrl.searchParams.get('spice_state')?.trim() || '';
  const returnOrigin = request.nextUrl.searchParams.get('return_origin')?.trim() || '';
  const popupTargetOrigin = returnOrigin && isAllowedCorsOrigin(returnOrigin)
    ? returnOrigin
    : effectiveRequestOrigin(request);
  const result = token
    ? await completeLastFmLink(token, spiceState, popupTargetOrigin)
    : { html: callbackInfoHtml(effectiveRequestOrigin(request)), status: 200 };

  return new Response(result.html, {
    status: result.status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
    },
  });
}

async function completeLastFmLink(token: string, spiceState: string, origin: string) {
  try {
    const session = await createLastFmSession({ token });
    const linkedUser = session.name?.trim() || 'Last.fm account';
    const accountLinked = await persistLastFmAccountLink({
      spiceState,
      linkedUser,
      sessionKey: session.sessionKey,
    });

    return {
      html: linkedHtml({
        sessionKey: session.sessionKey,
        linkedUser,
        accountLinked,
        origin,
      }),
      status: 200,
    };
  } catch (error) {
    return {
      html: errorHtml(error instanceof Error ? error.message : 'Last.fm session exchange failed.'),
      status: 502,
    };
  }
}

async function persistLastFmAccountLink({
  spiceState,
  linkedUser,
  sessionKey,
}: {
  spiceState: string;
  linkedUser: string;
  sessionKey: string;
}) {
  if (!spiceState || !process.env.DATABASE_URL) return false;

  const spiceSession = await verifyLastFmLinkState(spiceState);
  await saveLastFmConnection({
    userId: spiceSession.userId,
    linkedUser,
    sessionKey,
  });

  return true;
}

function callbackInfoHtml(origin: string) {
  return pageHtml(`
    <h1>Last.fm Callback Ready</h1>
    <p>SPICE uses this callback URL to finish Last.fm account setup after the popup sign-in:</p>
    <code>${escapeHtml(`${origin}/api/cloud/lastfm/callback`)}</code>
    <p>Return to Settings and click <strong>Set up Last.fm</strong> to open the Last.fm sign-in popup.</p>
    <a href="/">Return to SPICE</a>
  `);
}

function linkedHtml({
  sessionKey,
  linkedUser,
  accountLinked,
  origin,
}: {
  sessionKey: string;
  linkedUser: string;
  accountLinked: boolean;
  origin: string;
}) {
  const safeSessionKey = JSON.stringify(sessionKey);
  const safeLinkedUser = JSON.stringify(linkedUser);
  const safeAccountLinked = JSON.stringify(accountLinked);
  const safeOrigin = JSON.stringify(origin);
  return pageHtml(`
    <h1>Last.fm Linked</h1>
    <p>Signed in as <strong>${escapeHtml(linkedUser)}</strong>. SPICE saved the session ${accountLinked ? 'to your account and locally' : 'locally'} and enabled profile sync.</p>
    <script>
      const sessionKey = ${safeSessionKey};
      const linkedUser = ${safeLinkedUser};
      const accountLinked = ${safeAccountLinked};
      localStorage.setItem('spice_lastfm_session_key', sessionKey);
      localStorage.setItem('spice_lastfm_linked_user', linkedUser);
      localStorage.setItem('spice_lastfm_account_linked', String(accountLinked));
      localStorage.setItem('spice_profile_sync_enabled', 'true');
      localStorage.removeItem('spice_lastfm_link_token');
      if (window.opener && !window.opener.closed) {
        window.opener.postMessage({
          type: 'spice:lastfm-linked',
          sessionKey,
          name: linkedUser,
          accountLinked,
        }, ${safeOrigin});
      }
      setTimeout(() => {
        window.close();
      }, 900);
    </script>
    <p>If this popup does not close automatically, you can close it and return to SPICE.</p>
    <a href="/">Return to SPICE</a>
  `);
}

function errorHtml(message: string) {
  return pageHtml(`
    <h1>Last.fm Link Failed</h1>
    <p>${escapeHtml(message)}</p>
    <p>Close this popup, confirm the backend Last.fm env credentials are set, then try again from Settings.</p>
    <a href="/">Return to SPICE</a>
  `);
}

function pageHtml(body: string) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>SPICE Last.fm Callback</title>
    <style>
      :root { color-scheme: dark; }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background: #050505;
        color: #f8fafc;
        font-family: Inter, ui-sans-serif, system-ui, sans-serif;
      }
      main {
        width: min(560px, calc(100vw - 32px));
        border: 1px solid rgba(255,255,255,0.12);
        border-radius: 18px;
        background: #101010;
        padding: 28px;
        box-shadow: 0 24px 80px rgba(0,0,0,0.45);
      }
      h1 { margin: 0 0 12px; font-size: 1.4rem; }
      p { color: #b6b6c2; line-height: 1.55; }
      code {
        display: block;
        padding: 12px;
        border-radius: 10px;
        background: #050505;
        color: #c4b5fd;
        overflow-wrap: anywhere;
      }
      a { color: #c084fc; font-weight: 700; }
    </style>
  </head>
  <body>
    <main>${body}</main>
  </body>
</html>`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
