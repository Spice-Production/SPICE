package xyz.spiceapp.engine.migration

import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.util.Base64
import org.json.JSONObject
import java.io.File
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

private const val LEGACY_DATABASE = "spice_mobile.db"
private const val LEGACY_LIBRARY_PREFERENCES = "spice_native_library"
private const val LEGACY_CONNECT_PREFERENCES = "spice_connect"
private const val LEGACY_SESSION_PREFERENCES = "spice_native_session"
private const val LEGACY_SESSION_KEY = "session"
private const val LEGACY_SESSION_ALIAS = "spice_native_session_key"
private const val LEGACY_PAIRING_PREFERENCES = "spice_paired_device_credential"
private const val LEGACY_PAIRING_KEY = "paired_device_credential"
private const val LEGACY_PAIRING_ALIAS = "spice_paired_device_credential_key"

/**
 * Carries the Kotlin app's data into this app when it installs over it: the
 * Room library (same schema as the JS library), preferences, the signed-in
 * session, and the Spice Connect pairing. The old data is left in place.
 */
class LegacyMigration(private val context: Context) {
    /** Null when the Kotlin app never ran in this install. */
    fun collect(): Map<String, Any?>? {
        val legacyDatabase = context.getDatabasePath(LEGACY_DATABASE)
        val hasPreferences = preferencesFile(LEGACY_LIBRARY_PREFERENCES).exists()
        if (!legacyDatabase.exists() && !hasPreferences) return null
        return mapOf(
            "databaseCopied" to copyDatabase(legacyDatabase),
            "preferences" to stringPreferences(LEGACY_LIBRARY_PREFERENCES),
            "connectPreferences" to stringPreferences(LEGACY_CONNECT_PREFERENCES),
            "session" to decrypt(LEGACY_SESSION_PREFERENCES, LEGACY_SESSION_KEY, LEGACY_SESSION_ALIAS),
            "pairedCredential" to decrypt(LEGACY_PAIRING_PREFERENCES, LEGACY_PAIRING_KEY, LEGACY_PAIRING_ALIAS),
        )
    }

    private fun preferencesFile(name: String) = File(context.applicationInfo.dataDir, "shared_prefs/$name.xml")

    /** Copies the Room database to where the JS library opens it, unless one is already there. */
    private fun copyDatabase(source: File): Boolean {
        if (!source.exists()) return false
        val destination = File(context.filesDir, "SQLite/$LEGACY_DATABASE")
        if (destination.exists()) return false
        return runCatching {
            // Fold the write-ahead log into the main file so one copy is complete.
            SQLiteDatabase.openDatabase(source.path, null, SQLiteDatabase.OPEN_READWRITE).use { database ->
                database.rawQuery("PRAGMA wal_checkpoint(TRUNCATE)", null).use { it.moveToFirst() }
            }
            destination.parentFile?.mkdirs()
            source.copyTo(destination, overwrite = false)
            true
        }.getOrElse {
            destination.delete()
            false
        }
    }

    private fun stringPreferences(name: String): Map<String, String> {
        if (!preferencesFile(name).exists()) return emptyMap()
        return context.getSharedPreferences(name, Context.MODE_PRIVATE).all
            .mapNotNull { (key, value) ->
                when (value) {
                    is String -> key to value
                    is Boolean, is Int, is Long, is Float -> key to value.toString()
                    else -> null
                }
            }
            .toMap()
    }

    private fun decrypt(preferencesName: String, key: String, alias: String): String? = runCatching {
        if (!preferencesFile(preferencesName).exists()) return null
        val encrypted = context.getSharedPreferences(preferencesName, Context.MODE_PRIVATE).getString(key, null)
            ?: return null
        val payload = JSONObject(encrypted)
        val keyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        val secretKey = keyStore.getKey(alias, null) as? SecretKey ?: return null
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(
            Cipher.DECRYPT_MODE,
            secretKey,
            GCMParameterSpec(128, Base64.decode(payload.getString("iv"), Base64.NO_WRAP)),
        )
        String(cipher.doFinal(Base64.decode(payload.getString("ciphertext"), Base64.NO_WRAP)), Charsets.UTF_8)
    }.getOrNull()
}
