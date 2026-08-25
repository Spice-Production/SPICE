import {
  Innertube,
  Platform,
  UniversalCache,
  YTNodes,
  type Misc,
  type Types,
} from 'youtubei.js';

const YOUTUBE_MUSIC_SOURCE_ID = 'youtube_music';
const YOUTUBE_VIDEO_SOURCE_ID = 'youtube_video';
const cache = new UniversalCache(false);

// Stream URL resolution executes the transformation script extracted from
// YouTube's player, as required by YouTube.js v17.
Platform.shim.eval = async (data: Types.BuildScriptResult) =>
  new Function(data.output)() as Types.EvalResult;

let innertubePromise: Promise<Innertube> | undefined;

export interface SpiceArtist {
  id: string;
  name: string;
  artworkUrl?: string;
}

export interface SpiceAlbum {
  id: string;
  title: string;
  artists: SpiceArtist[];
  artworkUrl?: string;
  year?: number;
}

export interface SpiceTrack {
  sourceId: string;
  id: string;
  title: string;
  artists: SpiceArtist[];
  album?: SpiceAlbum;
  durationMs?: number;
  artworkUrl?: string;
}

export interface SpiceStreamVariant {
  url: string;
  codec: string;
  bitrate: number;
  container: string;
  itag: number;
  expiresAt?: string;
}

export interface SpiceTrackDetails {
  track: SpiceTrack;
  streams: SpiceStreamVariant[];
}

export async function getYouTube() {
  innertubePromise ??= Innertube.create({
    cache,
    lang: 'en',
    location: 'US',
    retrieve_player: true,
  });
  return innertubePromise;
}

export async function searchTracks(query: string, limit: number, kind: string) {
  const yt = await getYouTube();
  const searchType = toMusicSearchType(kind);
  const search = await yt.music.search(query, { type: searchType });
  const shelves = [search.songs, search.videos].filter(Boolean);

  const tracks: SpiceTrack[] = [];
  const seen = new Set<string>();
  for (const shelf of shelves) {
    if (!shelf) continue;
    for (const item of shelf.contents) {
      const track = musicItemToTrack(item);
      if (!track || seen.has(track.id)) continue;
      seen.add(track.id);
      tracks.push(track);
      if (tracks.length >= limit) return tracks;
    }
  }
  return tracks;
}

// General youtube.com search (not the YouTube Music catalog). Returns regular
// upload videos so hybrid search can surface content that has no Music entry.
export async function searchWebVideos(query: string, limit: number) {
  const yt = await getYouTube();
  const search = await yt.search(query);

  const tracks: SpiceTrack[] = [];
  const seen = new Set<string>();
  for (const item of search.results ?? []) {
    if (!item.is(YTNodes.Video)) continue;
    const video = item as InstanceType<typeof YTNodes.Video>;
    if (video.is_live || video.is_upcoming) continue;
    const id = video.video_id;
    const title = video.title?.toString();
    if (!id || !title) continue;
    const seconds = Number(video.duration?.seconds);
    if (!Number.isFinite(seconds) || seconds <= 0) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    tracks.push({
      sourceId: YOUTUBE_VIDEO_SOURCE_ID,
      id,
      title,
      artists: video.author?.name
        ? [{ id: video.author.id ?? video.author.name, name: video.author.name }]
        : [],
      durationMs: seconds * 1000,
      artworkUrl: bestThumbnailUrl(video.thumbnails),
    });
    if (tracks.length >= limit) return tracks;
  }
  return tracks;
}

export async function getRelatedTracks(id: string, limit = 30) {
  const yt = await getYouTube();
  const upNext = await yt.music.getUpNext(id, true);
  const tracks: SpiceTrack[] = [];
  const seen = new Set<string>([id]);

  for (const item of upNext.contents) {
    const videos = 'video_id' in item
      ? [item]
      : 'primary' in item
        ? [item.primary, ...(item.counterpart ?? [])]
        : [];

    for (const video of videos) {
      if (!video || seen.has(video.video_id) || video.selected) continue;
      const track = playlistPanelVideoToTrack(video);
      if (!track) continue;
      seen.add(track.id);
      tracks.push(track);
      if (tracks.length >= limit) return tracks;
    }
  }

  return tracks;
}

function playlistPanelVideoToTrack(video: YTNodes.PlaylistPanelVideo): SpiceTrack | null {
  const title = video.title?.toString();
  if (!video.video_id || !title) return null;

  const artists = video.artists?.map((artist) => ({
    id: artist.channel_id ?? artist.name,
    name: artist.name,
  })) ?? artistNameToList(video.author);

  return {
    sourceId: YOUTUBE_MUSIC_SOURCE_ID,
    id: video.video_id,
    title,
    artists,
    album: video.album
      ? {
          id: video.album.id ?? video.album.name,
          title: video.album.name,
          artists,
          year: video.album.year ? Number(video.album.year) || undefined : undefined,
        }
      : undefined,
    durationMs: Number.isFinite(video.duration?.seconds)
      ? video.duration.seconds * 1000
      : undefined,
    artworkUrl: bestThumbnailUrl(video.thumbnail),
  };
}

// ---------------------------------------------------------------------------
// Stream resolution — uses mobile / alternative InnerTube clients that serve
// pre-decoded URLs without requiring PO (Proof of Origin) tokens.
//
// Order matters:
//   1. ANDROID_VR    — pre-decoded URLs, supports unrestricted seeking and direct playback
//   2. IOS           — pre-decoded URLs, historically reliable but CDN enforces chunk limits
//   3. ANDROID       — broad compatibility fallback
//
// The WEB / WEB_REMIX clients require PO tokens and are NOT used for streams.
// ---------------------------------------------------------------------------
const STREAM_CLIENTS: Types.InnerTubeClient[] = [
  'ANDROID_VR',
  'IOS',
  'ANDROID',
  'MWEB',
  'WEB_EMBEDDED',
  'YTMUSIC',
  'TV_EMBEDDED',
];

export async function getTrackDetails(id: string): Promise<SpiceTrackDetails> {
  const yt = await getYouTube();

  // Try each mobile client until we get usable audio streams.
  let lastError: Error | undefined;
  for (const client of STREAM_CLIENTS) {
    try {
      const details = await resolveWithClient(yt, id, client);
      if (details.streams.length > 0) return details;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      // Continue to next client.
    }
  }

  // Every client failed — the cached InnerTube session may be wedged (expired
  // player, throttled session). Drop it so the next request starts fresh.
  innertubePromise = undefined;

  throw lastError ?? new Error('No audio streams found for this track.');
}

async function resolveWithClient(
  yt: Innertube,
  id: string,
  client: Types.InnerTubeClient,
): Promise<SpiceTrackDetails> {
  // Use the top-level getInfo (not music.getInfo) so we can specify client.
  const info = await yt.getInfo(id, { client });
  const formats = info.streaming_data?.adaptive_formats ?? [];
  const streams = (
    await Promise.all(
      formats
        .filter((format) => format.has_audio && !format.has_video)
        .map((format) => formatToStream(format, yt.session.player)),
    )
  )
    .filter((stream): stream is SpiceStreamVariant => stream !== null)
    .sort((a, b) => {
      // Prefer AAC/m4a for broadest browser/device compatibility.
      const aIsAac = a.codec.includes('mp4a') || a.container === 'mp4';
      const bIsAac = b.codec.includes('mp4a') || b.container === 'mp4';
      if (aIsAac !== bIsAac) return aIsAac ? -1 : 1;
      return b.bitrate - a.bitrate;
    });

  return {
    track: {
      sourceId: YOUTUBE_MUSIC_SOURCE_ID,
      id,
      title: info.basic_info.title ?? 'Unknown track',
      artists: artistNameToList(info.basic_info.author),
      durationMs:
        info.basic_info.duration === undefined
          ? undefined
          : info.basic_info.duration * 1000,
      artworkUrl: bestThumbnailUrl(info.basic_info.thumbnail),
    },
    streams,
  };
}

function toMusicSearchType(kind: string): Types.MusicSearchType {
  return kind === 'videos' ? 'video' : 'song';
}

type MusicItemEndpointData = YTNodes.MusicResponsiveListItem & {
  overlay?: {
    content?: {
      endpoint?: {
        payload?: {
          videoId?: unknown;
        };
      };
    };
  };
  menu?: {
    items?: Array<{
      endpoint?: {
        payload?: {
          videoId?: unknown;
        };
      };
    }>;
  };
  thumbnail?: {
    contents?: { url: string; width?: number; height?: number }[];
  };
};

function musicItemToTrack(item: YTNodes.MusicResponsiveListItem): SpiceTrack | null {
  if (item.item_type !== 'song' && item.item_type !== 'video') return null;
  const id = musicItemVideoId(item);
  if (!id || !item.title) return null;

  const artists =
    item.artists?.map((artist) => ({
      id: artist.channel_id ?? artist.name,
      name: artist.name,
    })) ??
    item.authors?.map((author) => ({
      id: author.channel_id ?? author.name,
      name: author.name,
    })) ??
    [];

  return {
    sourceId: item.item_type === 'video' ? YOUTUBE_VIDEO_SOURCE_ID : YOUTUBE_MUSIC_SOURCE_ID,
    id,
    title: item.title,
    artists,
    album: item.album
      ? {
          id: item.album.id ?? item.album.name,
          title: item.album.name,
          artists,
        }
      : undefined,
    durationMs:
      item.duration?.seconds === undefined
        ? undefined
        : item.duration.seconds * 1000,
    artworkUrl: bestThumbnailUrl(item.thumbnails ?? (item as MusicItemEndpointData).thumbnail?.contents),
  };
}

function musicItemVideoId(item: YTNodes.MusicResponsiveListItem) {
  const directId = item.id;
  if (typeof directId === 'string' && directId) return directId;

  const endpointData = item as MusicItemEndpointData;
  const endpointId = endpointData.overlay?.content?.endpoint?.payload?.videoId;
  if (typeof endpointId === 'string' && endpointId) return endpointId;

  const menuItems = endpointData.menu?.items ?? [];
  for (const menuItem of menuItems) {
    const menuId = menuItem?.endpoint?.payload?.videoId;
    if (typeof menuId === 'string' && menuId) return menuId;
  }

  return null;
}

async function formatToStream(
  format: Misc.Format,
  player: Parameters<Misc.Format['decipher']>[0],
): Promise<SpiceStreamVariant | null> {
  const url = await format.decipher(player);
  if (!url) return null;

  const parsed = parseMimeType(format.mime_type);
  return {
    url,
    codec: parsed.codec,
    bitrate: format.average_bitrate ?? format.bitrate,
    container: parsed.container,
    itag: format.itag,
  };
}

function parseMimeType(mimeType: string) {
  const media = mimeType.match(/^[^/]+\/([^;]+)/);
  const codec = mimeType.match(/codecs="([^"]+)"/);
  return {
    container: media?.[1] ?? 'unknown',
    codec: codec?.[1] ?? 'unknown',
  };
}

function bestThumbnailUrl(
  thumbnails: { url: string; width?: number; height?: number }[] | undefined,
) {
  return thumbnails
    ?.slice()
    .sort((a, b) => (b.width ?? 0) * (b.height ?? 0) - (a.width ?? 0) * (a.height ?? 0))
    .at(0)?.url;
}

function artistNameToList(name: string | undefined): SpiceArtist[] {
  if (!name) return [];
  return [{ id: name, name }];
}

export async function getPlaylistTracks(playlistId: string) {
  const yt = await getYouTube();

  let playlist: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  let isMusicPlaylist = true;
  try {
    playlist = await yt.music.getPlaylist(playlistId);
    if (!playlist.items || playlist.items.length === 0) {
      throw new Error('Empty music playlist, might be standard video playlist');
    }
  } catch (e) {
    console.warn('yt.music.getPlaylist failed or empty, falling back to yt.getPlaylist:', e);
    playlist = await yt.getPlaylist(playlistId);
    isMusicPlaylist = false;
  }

  const tracks: SpiceTrack[] = [];
  const videos = [...(isMusicPlaylist ? (playlist.items ?? []) : (playlist.videos ?? [])) ] as any[]; // eslint-disable-line @typescript-eslint/no-explicit-any

  let continuations = 0;
  while (playlist.has_continuation && continuations < 50) {
    try {
      playlist = await playlist.getContinuation();
      const newItems = isMusicPlaylist ? playlist.items : playlist.videos;
      if (newItems) {
        videos.push(...newItems);
      }
      continuations++;
    } catch (e) {
      console.warn('[YOUTUBE API] Playlist continuation interrupted (soft failure):', e);
      break;
    }
  }

  for (const video of videos) {
    let id = video.id;
    const title = video.title?.toString() || video.flex_columns?.[0]?.title?.text;

    // Extract ID from thumbnail URL as a fallback for music playlist items
    if (!id && isMusicPlaylist) {
      const tUrl = video.thumbnail?.contents?.[0]?.url;
      if (tUrl) {
        const match = tUrl.match(/\/vi\/([^\/]+)\//);
        if (match) {
          id = match[1];
        }
      }
    }

    if (!id || !title) continue;

    let durationMs: number | undefined;
    if (video.duration?.seconds) {
      durationMs = video.duration.seconds * 1000;
    } else if (isMusicPlaylist && video.fixed_columns?.[0]?.title?.text) {
      const maybeDur = video.fixed_columns[0].title.text;
      if (/^\d+:\d+$/.test(maybeDur)) {
        const parts = maybeDur.split(':');
        durationMs = (parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10)) * 1000;
      }
    }

    let artists: SpiceArtist[] = [];
    if (video.author) {
      artists = [{ id: video.author.id ?? video.author.name, name: video.author.name }];
    } else if (video.artists && video.artists.length > 0) {
      artists = video.artists.map((a: any) => /* eslint-disable-line @typescript-eslint/no-explicit-any */ ({ id: a.channel_id ?? a.name, name: a.name }));
    } else if (video.authors && video.authors.length > 0) {
      artists = video.authors.map((a: any) => /* eslint-disable-line @typescript-eslint/no-explicit-any */ ({ id: a.channel_id ?? a.name, name: a.name }));
    } else if (isMusicPlaylist && video.flex_columns?.[1]?.title?.runs) {
      // Very simple artist parsing from runs
      const texts = video.flex_columns[1].title.runs
        .map((r: any) => r.text) // eslint-disable-line @typescript-eslint/no-explicit-any
        .filter((t: string) => t !== ' • ' && t !== ' & ' && t !== ',');
      if (texts.length > 0) {
        artists = [{ id: texts.join(' '), name: texts.join(' ') }];
      }
    }

    tracks.push({
      sourceId: isMusicPlaylist ? YOUTUBE_MUSIC_SOURCE_ID : YOUTUBE_VIDEO_SOURCE_ID,
      id,
      title,
      artists,
      artworkUrl: video.thumbnails?.[0]?.url || video.thumbnail?.contents?.[0]?.url,
      durationMs
    });
  }

  return {
    title: playlist.header?.title?.toString() || playlist.info?.title?.toString() || playlist.title?.toString() || 'Imported Playlist',
    description: playlist.header?.description?.toString() || playlist.info?.description?.toString() || playlist.description?.toString() || 'YouTube playlist import',
    tracks
  };
}

export async function getAlbumTracks(albumId: string) {
  const yt = await getYouTube();
  const album = await yt.music.getAlbum(albumId);
  const tracks: SpiceTrack[] = [];
  const seen = new Set<string>();

  for (const item of album.contents ?? []) {
    const track = musicItemToTrack(item);
    if (!track || seen.has(track.id)) continue;
    seen.add(track.id);
    tracks.push(track);
  }

  if (tracks.length === 0) {
    throw new Error('This YouTube Music album does not expose any playable tracks.');
  }

  const header = album.header;
  const description = 'description' in (header ?? {})
    ? String((header as { description?: unknown }).description ?? '').trim()
    : '';
  return {
    title: header?.title?.toString().trim() || 'YouTube Music album',
    description: description || 'YouTube Music album import',
    tracks,
  };
}
