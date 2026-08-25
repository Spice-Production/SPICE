import { jsonResponse, optionsResponse } from '@/lib/cors';
import { verifySession } from '@/lib/auth';
import { getAccountSnapshotForSession } from '@/lib/accounts';
import { accountModerationErrorPayload } from '@/lib/moderation';

export const runtime = 'nodejs';

export function OPTIONS() {
  return optionsResponse();
}

export async function GET(request: Request) {
  const auth = request.headers.get('authorization');
  if (!auth?.startsWith('Bearer ')) {
    return jsonResponse(
      {
        error: 'unauthorized',
        message: 'A bearer token is required to load the account.',
      },
      { status: 401 },
    );
  }

  if (!process.env.DATABASE_URL) {
    return jsonResponse(
      {
        error: 'database_not_configured',
        message: 'Backend DATABASE_URL environment variable is not configured. Please configure it in your Vercel settings.',
      },
      { status: 500 },
    );
  }

  try {
    const session = await verifySession(auth.substring(7));
    const account = await getAccountSnapshotForSession(session);

    if (!account) {
      return jsonResponse(
        {
          error: 'account_not_found',
          message: 'The authenticated account no longer exists.',
        },
        { status: 401 },
      );
    }

    return jsonResponse({
      account,
      user: account,
    });
  } catch (error) {
    const moderationPayload = accountModerationErrorPayload(error);
    if (moderationPayload) {
      return jsonResponse(moderationPayload, { status: 403 });
    }

    return jsonResponse(
      {
        error: 'invalid_session',
        message: error instanceof Error ? error.message : 'The session token is invalid.',
      },
      { status: 401 },
    );
  }
}
