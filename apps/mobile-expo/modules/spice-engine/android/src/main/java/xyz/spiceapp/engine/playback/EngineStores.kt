package xyz.spiceapp.engine.playback

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import xyz.spiceapp.engine.Track

private const val ENGINE_PREFERENCES = "spice_engine_library"
private const val KEY_TRACK_PRIORITIES = "track_priorities_v1"
private const val KEY_BACKGROUND_HISTORY = "background_history_v1"
private const val MAX_BACKGROUND_HISTORY = 50

/**
 * Adaptive shuffle priorities. The engine owns the payload so the playback
 * service can weight background shuffle draws while the JS app is gone; the
 * JS app reads and records through the module's synchronous functions.
 */
class TrackPriorityStore(context: Context) {
    private val preferences = context.applicationContext.getSharedPreferences(ENGINE_PREFERENCES, Context.MODE_PRIVATE)

    fun trackPriority(trackKey: String): Int = synchronized(LOCK) {
        refreshLocked()
        cachedPriorities[trackKey] ?: 0
    }

    internal fun recordTrackFeedback(trackKey: String, feedback: MobileTrackFeedback): Int {
        if (trackKey.isBlank()) return 0
        return synchronized(LOCK) {
            val latest = preferences.getString(KEY_TRACK_PRIORITIES, "[]").orEmpty()
            val update = updateMobileTrackPriorityPayload(latest, trackKey, feedback)
            preferences.edit().putString(KEY_TRACK_PRIORITIES, update.payload).apply()
            cachedPayload = update.payload
            cachedPriorities = parseMobileTrackPriorities(update.payload)
            update.updatedScore
        }
    }

    fun payload(): String = synchronized(LOCK) {
        refreshLocked()
        cachedPayload
    }

    fun replace(payload: String) {
        val parsed = parseMobileTrackPriorities(payload)
        synchronized(LOCK) {
            cachedPayload = encodeMobileTrackPriorities(parsed)
            cachedPriorities = parsed
            preferences.edit().putString(KEY_TRACK_PRIORITIES, cachedPayload).apply()
        }
    }

    private fun refreshLocked() {
        val latest = preferences.getString(KEY_TRACK_PRIORITIES, "[]").orEmpty()
        if (latest == cachedPayload) return
        cachedPayload = latest
        cachedPriorities = parseMobileTrackPriorities(latest)
    }

    private companion object {
        val LOCK = Any()
        var cachedPayload: String = "\u0000"
        var cachedPriorities: Map<String, Int> = emptyMap()
    }
}

/**
 * Tracks the playback service finished while it owned the queue in the
 * background. The JS library database is unavailable then, so the service
 * records them here and the app drains them into history on its next launch.
 */
class BackgroundHistoryStore(context: Context) {
    private val preferences = context.applicationContext.getSharedPreferences(ENGINE_PREFERENCES, Context.MODE_PRIVATE)

    fun append(track: Track) = synchronized(LOCK) {
        val entries = read().toMutableList()
        entries += JSONObject()
            .put("id", track.id)
            .put("title", track.title)
            .put("artist", track.artist)
            .put("album", track.album)
            .put("durationMs", track.durationMs)
            .put("artworkUrl", track.artworkUrl)
            .put("sourceId", track.sourceId)
            .put("playedAt", System.currentTimeMillis())
        val bounded = entries.takeLast(MAX_BACKGROUND_HISTORY)
        preferences.edit().putString(KEY_BACKGROUND_HISTORY, JSONArray(bounded).toString()).apply()
    }

    fun drain(): List<Map<String, Any?>> = synchronized(LOCK) {
        val entries = read()
        preferences.edit().remove(KEY_BACKGROUND_HISTORY).commit()
        entries.map { item ->
            mapOf(
                "id" to item.optString("id"),
                "title" to item.optString("title"),
                "artist" to item.optString("artist"),
                "album" to item.optString("album"),
                "durationMs" to item.optLong("durationMs").toDouble(),
                "artworkUrl" to item.optString("artworkUrl"),
                "sourceId" to item.optString("sourceId").ifBlank { "youtube_music" },
                "playedAt" to item.optLong("playedAt").toDouble(),
            )
        }
    }

    private fun read(): List<JSONObject> = runCatching {
        val array = JSONArray(preferences.getString(KEY_BACKGROUND_HISTORY, "[]"))
        buildList {
            for (index in 0 until array.length()) {
                array.optJSONObject(index)?.takeIf { it.optString("id").isNotBlank() }?.let(::add)
            }
        }
    }.getOrDefault(emptyList())

    private companion object {
        val LOCK = Any()
    }
}
