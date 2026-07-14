package com.bong.pet

import android.content.Context
import android.content.SharedPreferences
import java.util.UUID

/** Cấu hình & danh tính device — SharedPreferences là đủ cho Phase 0. */
class Prefs(context: Context) {
    private val sp: SharedPreferences =
        context.getSharedPreferences("bong_prefs", Context.MODE_PRIVATE)

    val deviceId: String
        get() = sp.getString(KEY_DEVICE_ID, null) ?: UUID.randomUUID().toString().also {
            sp.edit().putString(KEY_DEVICE_ID, it).apply()
        }

    var petName: String
        get() = sp.getString(KEY_PET_NAME, "Bông")!!
        set(v) = sp.edit().putString(KEY_PET_NAME, v).apply()

    var pronoun: String
        get() = sp.getString(KEY_PRONOUN, "bà")!!
        set(v) = sp.edit().putString(KEY_PRONOUN, v).apply()

    var serverUrl: String
        get() = sp.getString(KEY_SERVER_URL, BuildConfig.SERVER_URL)!!
        set(v) = sp.edit().putString(KEY_SERVER_URL, v.trimEnd('/')).apply()

    var onboarded: Boolean
        get() = sp.getBoolean(KEY_ONBOARDED, false)
        set(v) = sp.edit().putBoolean(KEY_ONBOARDED, v).apply()

    /** Pet đang "đi vắng" (arc) — app hiện phòng trống + note. */
    var awayNote: String?
        get() = sp.getString(KEY_AWAY_NOTE, null)
        set(v) = sp.edit().putString(KEY_AWAY_NOTE, v).apply()

    var isAway: Boolean
        get() = sp.getBoolean(KEY_IS_AWAY, false)
        set(v) = sp.edit().putBoolean(KEY_IS_AWAY, v).apply()

    private companion object {
        const val KEY_DEVICE_ID = "device_id"
        const val KEY_PET_NAME = "pet_name"
        const val KEY_PRONOUN = "pronoun"
        const val KEY_SERVER_URL = "server_url"
        const val KEY_ONBOARDED = "onboarded"
        const val KEY_AWAY_NOTE = "away_note"
        const val KEY_IS_AWAY = "is_away"
    }
}
