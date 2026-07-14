package com.bong.pet.push

import com.bong.pet.Prefs
import com.bong.pet.api.ApiClient
import com.bong.pet.notif.ChatNotifier
import com.bong.pet.store.ChatStore
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

/**
 * Client chỉ là "renderer": server quyết định nhắn gì khi nào,
 * mỗi FCM data message = 1 bong bóng chat.
 */
class PetMessagingService : FirebaseMessagingService() {

    override fun onMessageReceived(message: RemoteMessage) {
        val data = message.data
        if (data["kind"] != "pet_message") return

        val prefs = Prefs(this)
        val text = data["text"] ?: ""
        val msgId = data["msg_id"] ?: ""
        val mood = data["mood"] ?: "happy"
        val actions = (data["actions"] ?: "").split(',').filter { it.isNotBlank() }

        // Trạng thái đi vắng cho màn hình phòng
        prefs.isAway = data["away"] == "1"
        prefs.awayNote = data["room_note"]?.ifBlank { null }

        // ARC_STATUS = chỉ cập nhật trạng thái phòng, không có bong bóng
        if (data["mtype"] == "ARC_STATUS" || (text.isEmpty() && data["mtype"] != "SULK")) return

        ChatStore.append(this, fromPet = true, text = text)
        ChatNotifier.show(this, mood, actions, msgId)
    }

    override fun onNewToken(token: String) {
        // Token xoay vòng — đăng ký lại với server (nếu đã onboard)
        if (Prefs(this).onboarded) {
            ApiClient.register(this, token)
        }
    }
}
