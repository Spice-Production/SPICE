import { jsonResponse, optionsResponse } from '@/lib/cors';
import { verifySession } from '@/lib/auth';
import { db } from '@/db';
import { profiles } from '@/db/schema';
import { and, eq, inArray, isNotNull } from 'drizzle-orm';
import { accountModerationErrorPayload } from '@/lib/moderation';
import {
  profileWriteMatches,
  profileWriteValues,
  type ProfileSyncInput,
} from '@/lib/profile-sync';

export const runtime = 'nodejs';

export function OPTIONS() {
  return optionsResponse();
}

export async function GET(request: Request) {
  try {
    const auth = request.headers.get('Authorization');
    if (!auth || !auth.startsWith('Bearer ')) {
      return jsonResponse({ error: 'unauthorized', message: 'Missing auth header.' }, { status: 401 });
    }

    const token = auth.substring(7);
    const session = await verifySession(token);

    if (!process.env.DATABASE_URL) {
      return jsonResponse({ error: 'database_not_configured', message: 'Backend DATABASE_URL environment variable is not configured.' }, { status: 500 });
    }

    const userProfiles = await db.query.profiles.findMany({
      where: and(
        eq(profiles.userId, session.userId),
        isNotNull(profiles.username),
      ),
    });

    return jsonResponse({
      profiles: userProfiles,
    });
  } catch (error) {
    const moderationPayload = accountModerationErrorPayload(error);
    if (moderationPayload) {
      return jsonResponse(moderationPayload, { status: 403 });
    }
    return jsonResponse(
      {
        error: 'sync_get_profiles_failed',
        message: error instanceof Error ? error.message : 'Failed to retrieve cloud profiles.',
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const auth = request.headers.get('Authorization');
    if (!auth || !auth.startsWith('Bearer ')) {
      return jsonResponse({ error: 'unauthorized', message: 'Missing auth header.' }, { status: 401 });
    }

    const token = auth.substring(7);
    const session = await verifySession(token);
    const { profiles: profilesPayload } = await request.json();

    if (!Array.isArray(profilesPayload)) {
      return jsonResponse({ error: 'invalid_payload', message: 'Payload must be an array of profiles.' }, { status: 400 });
    }

    if (!process.env.DATABASE_URL) {
      return jsonResponse({ error: 'database_not_configured', message: 'Backend DATABASE_URL environment variable is not configured.' }, { status: 500 });
    }

    const inputs = profilesPayload as ProfileSyncInput[];
    const storedProfiles = await db.select({
      id: profiles.id,
      displayName: profiles.displayName,
      username: profiles.username,
      bio: profiles.bio,
      gradient: profiles.gradient,
      songsPlayed: profiles.songsPlayed,
      joinedAt: profiles.joinedAt,
      passcode: profiles.passcode,
      avatarUrl: profiles.avatarUrl,
      isPrivate: profiles.isPrivate,
    }).from(profiles).where(eq(profiles.userId, session.userId));
    const storedById = new Map(storedProfiles.map((profile) => [profile.id, profile]));
    const incomingIds = new Set(inputs.map((profile) => profile.id));
    const batch = [];

    // A full replacement preserves username swaps under the global unique constraint.
    // Ordinary playback/profile updates take the differential path below.
    const usernameLayoutChanged = inputs.some((input) => (
      (storedById.get(input.id)?.username || null) !== profileWriteValues(input).username
    ));
    if (usernameLayoutChanged) {
      batch.push(db.delete(profiles).where(eq(profiles.userId, session.userId)));
      if (inputs.length > 0) {
        batch.push(db.insert(profiles).values(inputs.map((input) => ({
          id: input.id,
          userId: session.userId,
          ...profileWriteValues(input),
        }))));
      }
    }

    if (!usernameLayoutChanged && storedProfiles.some((profile) => !incomingIds.has(profile.id))) {
      const removedIds = storedProfiles
        .filter((profile) => !incomingIds.has(profile.id))
        .map((profile) => profile.id);
      batch.push(db.delete(profiles).where(and(
        eq(profiles.userId, session.userId),
        inArray(profiles.id, removedIds),
      )));
    }

    for (const input of usernameLayoutChanged ? [] : inputs) {
      const stored = storedById.get(input.id);
      const values = profileWriteValues(input);
      if (!stored) {
        batch.push(db.insert(profiles).values({
          id: input.id,
          userId: session.userId,
          ...values,
        }));
      } else if (!profileWriteMatches(stored, input)) {
        batch.push(db.update(profiles).set(values).where(and(
          eq(profiles.userId, session.userId),
          eq(profiles.id, input.id),
        )));
      }
    }

    if (batch.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await db.batch(batch as any);
    }

    return jsonResponse({ success: true, count: profilesPayload.length });
  } catch (error) {
    return jsonResponse(
      {
        error: 'sync_post_profiles_failed',
        message: error instanceof Error ? error.message : 'Failed to synchronize profiles.',
      },
      { status: 500 }
    );
  }
}
