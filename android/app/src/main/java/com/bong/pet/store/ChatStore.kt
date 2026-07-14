package com.bong.pet.store

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

data class ChatMessage(val fromPet: Boolean, val text: String, val timestamp: Long)

/**
 * Lịch sử hội thoại để dựng lại MessagingStyle mỗi lần notify.
 * SharedPreferences + JSON, giữ tối đa MAX_MESSAGES tin gần nhất.
 */
object ChatStore {
    private const val MAX_MESSAGES = 40
    private const val PREF = "bong_chat"
    private const val KEY = "history"

    @Synchronized
    fun append(context: Context, fromPet: Boolean, text: String, timestamp: Long = System.currentTimeMillis()) {
        val list = load(context).toMutableList()
        list.add(ChatMessage(fromPet, text, timestamp))
        while (list.size > MAX_MESSAGES) list.removeAt(0)
        save(context, list)
    }

    @Synchronized
    fun load(context: Context): List<ChatMessage> {
        val raw = context.getSharedPreferences(PREF, Context.MODE_PRIVATE).getString(KEY, "[]")!!
        val arr = JSONArray(raw)
        return (0 until arr.length()).map { i ->
            val o = arr.getJSONObject(i)
            ChatMessage(o.getBoolean("pet"), o.getString("text"), o.getLong("ts"))
        }
    }

    /** Tin hiển thị trong notification hiện tại (từ tin chưa-đọc gần nhất trở đi thì phức tạp — Phase 0 lấy N tin cuối). */
    fun recent(context: Context, n: Int = 8): List<ChatMessage> = load(context).takeLast(n)

    private fun save(context: Context, list: List<ChatMessage>) {
        val arr = JSONArray()
        list.forEach {
            arr.put(JSONObject().put("pet", it.fromPet).put("text", it.text).put("ts", it.timestamp))
        }
        context.getSharedPreferences(PREF, Context.MODE_PRIVATE)
            .edit().putString(KEY, arr.toString()).apply()
    }
}
