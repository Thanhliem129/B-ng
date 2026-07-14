package com.bong.pet.api

import android.content.Context
import android.util.Log
import com.bong.pet.Prefs
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors

/**
 * HTTP client tối giản, không dependency. Mọi call chạy trên single-thread
 * executor — Phase 0 lưu lượng rất thấp, không cần gì phức tạp hơn.
 * Không có offline queue (Phase 1: Room + WorkManager retry).
 */
object ApiClient {
    private val executor = Executors.newSingleThreadExecutor()
    private const val TAG = "BongApi"

    fun register(context: Context, fcmToken: String?, onDone: ((Boolean) -> Unit)? = null) {
        val prefs = Prefs(context)
        val body = JSONObject()
            .put("device_id", prefs.deviceId)
            .put("pet_name", prefs.petName)
            .put("pronoun", prefs.pronoun)
        if (fcmToken != null) body.put("fcm_token", fcmToken)
        post(prefs.serverUrl, "/api/register", body, onDone)
    }

    fun reply(context: Context, text: String, clientMsgId: String) {
        val prefs = Prefs(context)
        val body = JSONObject()
            .put("device_id", prefs.deviceId)
            .put("text", text)
            .put("client_msg_id", clientMsgId)
        post(prefs.serverUrl, "/api/reply", body, null)
    }

    fun event(context: Context, msgId: String, event: String, action: String? = null) {
        val prefs = Prefs(context)
        val body = JSONObject()
            .put("device_id", prefs.deviceId)
            .put("msg_id", msgId)
            .put("event", event)
        if (action != null) body.put("action", action)
        post(prefs.serverUrl, "/api/event", body, null)
    }

    private fun post(base: String, path: String, body: JSONObject, onDone: ((Boolean) -> Unit)?) {
        executor.execute {
            var ok = false
            try {
                val conn = URL(base + path).openConnection() as HttpURLConnection
                conn.requestMethod = "POST"
                conn.setRequestProperty("Content-Type", "application/json; charset=utf-8")
                conn.doOutput = true
                conn.connectTimeout = 10_000
                conn.readTimeout = 10_000
                conn.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
                ok = conn.responseCode in 200..299
                if (!ok) Log.w(TAG, "$path -> ${conn.responseCode}")
                conn.disconnect()
            } catch (e: Exception) {
                Log.w(TAG, "$path lỗi mạng: ${e.message}")
            }
            onDone?.invoke(ok)
        }
    }
}
