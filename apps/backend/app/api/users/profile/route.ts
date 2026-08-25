import { jsonResponse, optionsResponse } from '@/lib/cors';
import { verifySession } from '@/lib/auth';
import { db } from '@/db';
import { users, profiles, playlists, likes, profileLikes } from '@/db/schema';
import { eq, and, isNull } from 'drizzle-orm';
import { getPlaylistSnapshot } from '@/lib/shared-playlists';
import { accountModerationErrorPayload } from '@/lib/moderation';

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

    const { searchParams } = new URL(request.url);
    const targetUserId = searchParams.get('userId');

    if (!targetUserId) {
      return jsonResponse({ error: 'missing_user_id', message: 'Missing target userId parameter.' }, { status: 400 });
    }

    const targetUser = await db.query.users.findFirst({
      where: eq(users.id, targetUserId)
    });

    if (!targetUser) {
      return jsonResponse({ error: 'user_not_found', message: 'User not found.' }, { status: 404 });
    }

    const targetProfileId = searchParams.get('profileId') || 'default';

    const targetProfile = await db.query.profiles.findFirst({
      where: and(eq(profiles.userId, targetUserId), eq(profiles.id, targetProfileId))
    });

    const profileLikesRows = await db
      .select()
      .from(profileLikes)
      .where(eq(profileLikes.targetUserId, targetUserId));

    const likesCount = profileLikesRows.length;
    const isLikedByMe = profileLikesRows.some(row => row.likerUserId === session.userId);

    const isSelf = session.userId === targetUserId;
    const isPrivate = targetProfile?.isPrivate === true;

    if (isPrivate && !isSelf) {
      return jsonResponse({
        profile: {
          id: targetProfileId,
          displayName: targetProfile?.displayName || targetProfile?.username || targetUser.username || 'Spice Listener',
          username: targetProfile?.username || targetUser.username || 'unknown',
          avatarUrl: targetProfile?.avatarUrl || null,
          joinedAt: targetProfile?.joinedAt || 'June 2026',
          isPrivate: true,
        },
        likesCount,
        isLikedByMe,
        playlists: [],
        stats: null,
      });
    }

    const likedSongsResult = await db
      .select()
      .from(likes)
      .where(eq(likes.userId, targetUserId));
    const likedCount = likedSongsResult.length;

    const dbPlaylists = await db.query.playlists.findMany({
      where: and(
        eq(playlists.userId, targetUserId),
        eq(playlists.profileId, targetProfileId),
        isNull(playlists.deletedAt)
      ),
      orderBy: playlists.sortIndex,
    });

    const visiblePlaylists = isSelf
      ? dbPlaylists
      : dbPlaylists.filter(pl => pl.isPublic);

    const playlistsSnapshots = [];
    for (const pl of visiblePlaylists) {
      const snapshot = await getPlaylistSnapshot(pl.id, {
        shared: false,
        includeMembers: false,
      });
      if (snapshot) {
        playlistsSnapshots.push(snapshot);
      }
    }

    return jsonResponse({
      profile: {
        id: targetProfileId,
        displayName: targetProfile?.displayName || targetProfile?.username || targetUser.username || 'Spice Listener',
        username: targetProfile?.username || targetUser.username || 'unknown',
        avatarUrl: targetProfile?.avatarUrl || null,
        bio: targetProfile?.bio || 'A fresh Spice listener.',
        gradient: targetProfile?.gradient || 'linear-gradient(135deg, #a855f7, #ec4899)',
        joinedAt: targetProfile?.joinedAt || 'June 2026',
        isPrivate: false,
      },
      likesCount,
      isLikedByMe,
      playlists: playlistsSnapshots,
      stats: {
        songsPlayed: targetProfile?.songsPlayed ?? 0,
        likedCount,
        playlistsCount: playlistsSnapshots.length,
      }
    });
  } catch (error) {
    const moderationPayload = accountModerationErrorPayload(error);
    if (moderationPayload) {
      return jsonResponse(moderationPayload, { status: 403 });
    }
    return jsonResponse(
      {
        error: 'user_profile_fetch_failed',
        message: error instanceof Error ? error.message : 'Failed to fetch user profile.',
      },
      { status: 500 }
    );
  }
}
