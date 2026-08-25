import { jsonResponse, optionsResponse } from '@/lib/cors';
import { verifySession } from '@/lib/auth';
import { db } from '@/db';
import { history, likes } from '@/db/schema';
import { and, desc, eq, inArray, ne } from 'drizzle-orm';
import {
  aggregateListenerFavorites,
  MAX_NEIGHBOR_SCAN_ROWS,
  selectTasteNeighbors,
} from '@/lib/listeners-like-you';

export const runtime = 'nodejs';

export function OPTIONS() {
  return optionsResponse();
}

const MAX_KNOWN_TRACKS = 120;

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

    const likedRows = await db.query.likes.findMany({
      where: eq(likes.userId, session.userId),
      columns: { trackId: true, sourceId: true },
      limit: MAX_KNOWN_TRACKS,
    });
    const historyRows = await db.query.history.findMany({
      where: eq(history.userId, session.userId),
      columns: { trackId: true, sourceId: true },
      orderBy: [desc(history.playedAt)],
      limit: MAX_KNOWN_TRACKS,
    });

    const knownTrackIds = Array.from(new Set([
      ...likedRows.map((row) => row.trackId),
      ...historyRows.map((row) => row.trackId),
    ])).filter((trackId) => trackId && trackId !== 'placeholder').slice(0, MAX_KNOWN_TRACKS);

    if (knownTrackIds.length < 3) {
      return jsonResponse({ tracks: [], neighborCount: 0, reason: 'Listen and like a few more songs to unlock listeners-like-you.' });
    }

    const overlapRows = await db.query.likes.findMany({
      where: and(
        inArray(likes.trackId, knownTrackIds),
        ne(likes.userId, session.userId),
      ),
      columns: { userId: true, trackId: true },
      limit: MAX_NEIGHBOR_SCAN_ROWS,
    });

    const { neighborUserIds } = selectTasteNeighbors(overlapRows, {
      requesterUserId: session.userId,
    });
    if (neighborUserIds.length === 0) {
      return jsonResponse({ tracks: [], neighborCount: 0 });
    }

    const [neighborLikes, neighborHistory] = await Promise.all([
      db.query.likes.findMany({
        where: inArray(likes.userId, neighborUserIds),
        columns: {
          userId: true,
          trackId: true,
          sourceId: true,
          title: true,
          artistsJson: true,
          artworkUrl: true,
          durationMs: true,
        },
        limit: 3_000,
      }),
      db.query.history.findMany({
        where: inArray(history.userId, neighborUserIds),
        columns: {
          userId: true,
          trackId: true,
          sourceId: true,
          title: true,
          artistsJson: true,
          artworkUrl: true,
          durationMs: true,
        },
        orderBy: [desc(history.playedAt)],
        limit: 1_500,
      }),
    ]);

    const excludeTrackKeys = new Set<string>();
    for (const row of [...likedRows, ...historyRows]) {
      excludeTrackKeys.add(`${row.sourceId || 'youtube_music'}:${row.trackId}`.toLocaleLowerCase());
    }

    const favorites = aggregateListenerFavorites([...neighborLikes, ...neighborHistory], {
      excludeTrackKeys,
    });

    return jsonResponse({
      tracks: favorites,
      neighborCount: neighborUserIds.length,
    });
  } catch (error) {
    return jsonResponse(
      {
        error: 'listeners_like_you_failed',
        message: error instanceof Error ? error.message : 'Failed to aggregate listener favorites.',
      },
      { status: 500 },
    );
  }
}
