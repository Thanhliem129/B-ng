package com.bong.pet.notif

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.core.app.RemoteInput
import com.bong.pet.api.ApiClient
import com.bong.pet.store.ChatStore
import java.util.UUID

/** Nhận text từ RemoteInput trên notification → hiện ngay trong hội thoại → gửi server. */
class ReplyReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        val text = RemoteInput.getResultsFromIntent(intent)
            ?.getCharSequence(ChatNotifier.KEY_REMOTE_REPLY)?.toString()?.trim()
        if (text.isNullOrEmpty()) return

        val msgId = intent.getStringExtra("msg_id") ?: ""

        // Cập nhật notification ngay — user thấy tin mình vừa gửi (đã gửi ✓)
        ChatStore.append(context, fromPet = false, text = text)
        ChatNotifier.show(context, "happy", emptyList(), msgId)

        // client_msg_id chống trùng khi hệ thống retry broadcast
        ApiClient.reply(context, text, UUID.randomUUID().toString())
    }
}
