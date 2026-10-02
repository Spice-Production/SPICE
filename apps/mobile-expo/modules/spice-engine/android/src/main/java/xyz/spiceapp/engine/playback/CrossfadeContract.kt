package xyz.spiceapp.engine.playback

import androidx.media3.session.SessionCommand

internal const val ACTION_PREPARE_CROSSFADE = "xyz.spiceapp.engine.PREPARE_CROSSFADE"
internal const val ACTION_START_CROSSFADE = "xyz.spiceapp.engine.START_CROSSFADE"
internal const val ACTION_CANCEL_CROSSFADE = "xyz.spiceapp.engine.CANCEL_CROSSFADE"
internal const val ACTION_SYNC_PLAYBACK_CONTEXT = "xyz.spiceapp.engine.SYNC_PLAYBACK_CONTEXT"
internal const val ACTION_CROSSFADE_COMPLETED = "xyz.spiceapp.engine.CROSSFADE_COMPLETED"
internal const val ACTION_CROSSFADE_FAILED = "xyz.spiceapp.engine.CROSSFADE_FAILED"

// Media notification buttons. The service handles a press itself while it owns
// the queue in the background; otherwise it forwards it to the app.
internal const val ACTION_TOGGLE_SHUFFLE = "xyz.spiceapp.engine.TOGGLE_SHUFFLE"
internal const val ACTION_CYCLE_REPEAT = "xyz.spiceapp.engine.CYCLE_REPEAT"
internal const val ACTION_TOGGLE_LIKE = "xyz.spiceapp.engine.TOGGLE_LIKE"
internal const val ACTION_SET_LIKED = "xyz.spiceapp.engine.SET_LIKED"
internal const val ACTION_NOTIFICATION_BUTTON = "xyz.spiceapp.engine.NOTIFICATION_BUTTON"

internal const val ARG_BUTTON = "button"
internal const val ARG_LIKED = "liked"
internal const val BUTTON_SHUFFLE = "shuffle"
internal const val BUTTON_REPEAT = "repeat"
internal const val BUTTON_LIKE = "like"

internal const val ARG_TRACK_KEY = "track_key"
internal const val ARG_MEDIA_ID = "media_id"
internal const val ARG_STREAM_URL = "stream_url"
internal const val ARG_TITLE = "title"
internal const val ARG_ARTIST = "artist"
internal const val ARG_ALBUM = "album"
internal const val ARG_ARTWORK_URL = "artwork_url"
internal const val ARG_DURATION_MS = "duration_ms"
internal const val ARG_TRACK_DURATION_MS = "track_duration_ms"
internal const val ARG_QUEUE_INDEX = "queue_index"
internal const val ARG_STARTS_NEW_SHUFFLE_ROUND = "starts_new_shuffle_round"
internal const val ARG_COUNTS_AS_SHUFFLE_DRAW = "counts_as_shuffle_draw"
internal const val ARG_HISTORY_CURSOR_TARGET = "history_cursor_target"
internal const val ARG_PROMOTE_IMMEDIATELY = "promote_immediately"
internal const val ARG_SERVICE_OWNED_NAVIGATION = "service_owned_navigation"

internal val PREPARE_CROSSFADE_COMMAND = SessionCommand(ACTION_PREPARE_CROSSFADE, android.os.Bundle.EMPTY)
internal val START_CROSSFADE_COMMAND = SessionCommand(ACTION_START_CROSSFADE, android.os.Bundle.EMPTY)
internal val CANCEL_CROSSFADE_COMMAND = SessionCommand(ACTION_CANCEL_CROSSFADE, android.os.Bundle.EMPTY)
internal val SYNC_PLAYBACK_CONTEXT_COMMAND = SessionCommand(ACTION_SYNC_PLAYBACK_CONTEXT, android.os.Bundle.EMPTY)
internal val CROSSFADE_COMPLETED_COMMAND = SessionCommand(ACTION_CROSSFADE_COMPLETED, android.os.Bundle.EMPTY)
internal val CROSSFADE_FAILED_COMMAND = SessionCommand(ACTION_CROSSFADE_FAILED, android.os.Bundle.EMPTY)
internal val TOGGLE_SHUFFLE_COMMAND = SessionCommand(ACTION_TOGGLE_SHUFFLE, android.os.Bundle.EMPTY)
internal val CYCLE_REPEAT_COMMAND = SessionCommand(ACTION_CYCLE_REPEAT, android.os.Bundle.EMPTY)
internal val TOGGLE_LIKE_COMMAND = SessionCommand(ACTION_TOGGLE_LIKE, android.os.Bundle.EMPTY)
internal val SET_LIKED_COMMAND = SessionCommand(ACTION_SET_LIKED, android.os.Bundle.EMPTY)
internal val NOTIFICATION_BUTTON_COMMAND = SessionCommand(ACTION_NOTIFICATION_BUTTON, android.os.Bundle.EMPTY)
