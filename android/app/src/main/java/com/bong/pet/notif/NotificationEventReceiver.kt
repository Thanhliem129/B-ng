package com.bong.pet.notif

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.bong.pet.api.ApiClient
import com.bong.pet.store.ChatStore

/**
 * Sự kiện notification không phải reply:
 *  - dismissed: user swipe notification → pet "bị seen" (server sẽ tính dỗi)
 *  - action feed: nút "Cho ăn 🍙"
 */
class NotificationEventReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        val msgId = intent.getStringExtra("msg_id") ?: return
        val event = intent.getStringExtra("event") ?: return
        val action = intent.getStringExtra("action")

        if (event == "action" && action == "feed") {
            // hiện hành động của user trong hội thoại cho tự nhiên
            ChatStore.append(context, fromPet = false, text = "🍙 (cho ăn)")
            ChatNotifier.show(context, "happy", emptyList(), msgId)
        }
        ApiClient.event(context, msgId, event, action)
    }
}
