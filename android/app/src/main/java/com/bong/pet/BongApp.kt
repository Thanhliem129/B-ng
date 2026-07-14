package com.bong.pet

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager

class BongApp : Application() {

    override fun onCreate() {
        super.onCreate()
        createChannels()
    }

    private fun createChannels() {
        val nm = getSystemService(NotificationManager::class.java)
        val chat = NotificationChannel(
            CHANNEL_CHAT,
            "Tin nhắn của pet",
            NotificationManager.IMPORTANCE_HIGH,
        ).apply {
            description = "Pet nhắn tin cho bạn"
            enableVibration(true)
        }
        nm.createNotificationChannel(chat)
    }

    companion object {
        const val CHANNEL_CHAT = "pet_chat"
    }
}
