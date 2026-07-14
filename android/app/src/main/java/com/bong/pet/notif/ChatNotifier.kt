package com.bong.pet.notif

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.drawable.BitmapDrawable
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.app.Person
import androidx.core.app.RemoteInput
import androidx.core.content.ContextCompat
import androidx.core.content.pm.ShortcutInfoCompat
import androidx.core.content.pm.ShortcutManagerCompat
import androidx.core.graphics.drawable.IconCompat
import androidx.core.graphics.drawable.toBitmap
import com.bong.pet.BongApp
import com.bong.pet.Prefs
import com.bong.pet.R
import com.bong.pet.store.ChatStore
import com.bong.pet.ui.MainActivity

/**
 * Dựng notification kiểu tin nhắn (MessagingStyle) — vũ khí bí mật của concept:
 * avatar tròn + tên pet + lịch sử hội thoại, trông y hệt Messenger/Zalo.
 */
object ChatNotifier {
    const val NOTIFICATION_ID = 1001
    const val KEY_REMOTE_REPLY = "key_reply"
    private const val SHORTCUT_ID = "bong_conversation"

    fun avatarRes(mood: String): Int = when (mood) {
        "hungry" -> R.drawable.avatar_hungry
        "sulky" -> R.drawable.avatar_sulky
        "sleepy" -> R.drawable.avatar_sleepy
        else -> R.drawable.avatar_happy
    }

    /** Render lại notification từ ChatStore. Gọi sau mỗi lần có tin mới (pet hoặc user). */
    fun show(context: Context, mood: String, actions: List<String>, latestMsgId: String) {
        val prefs = Prefs(context)
        val avatar = drawableToIcon(context, avatarRes(mood))

        val pet = Person.Builder()
            .setName(prefs.petName)
            .setIcon(avatar)
            .setKey("pet")
            .build()
        val me = Person.Builder().setName("Tui").setKey("me").build()

        // Conversation shortcut: Android 11+ xếp pet vào mục "Conversations"
        publishShortcut(context, pet, avatar)

        val style = NotificationCompat.MessagingStyle(me)
        for (m in ChatStore.recent(context)) {
            style.addMessage(m.text.ifEmpty { " " }, m.timestamp, if (m.fromPet) pet else me)
        }

        val replyIntent = Intent(context, ReplyReceiver::class.java)
            .putExtra("msg_id", latestMsgId)
        val replyPending = PendingIntent.getBroadcast(
            context, 1, replyIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE,
        )
        val replyAction = NotificationCompat.Action.Builder(
            R.drawable.avatar_happy, "Rep nó",
            replyPending,
        )
            .addRemoteInput(RemoteInput.Builder(KEY_REMOTE_REPLY).setLabel("Nhắn cho ${prefs.petName}...").build())
            .setAllowGeneratedReplies(false)
            .build()

        val dismissIntent = eventIntent(context, latestMsgId, "dismissed", null)
        val contentIntent = PendingIntent.getActivity(
            context, 3,
            Intent(context, MainActivity::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        val builder = NotificationCompat.Builder(context, BongApp.CHANNEL_CHAT)
            .setSmallIcon(R.drawable.avatar_happy)
            .setStyle(style)
            .setShortcutId(SHORTCUT_ID)
            .addAction(replyAction)
            .setDeleteIntent(dismissIntent)
            .setContentIntent(contentIntent)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(false)

        if ("feed" in actions) {
            builder.addAction(
                NotificationCompat.Action.Builder(
                    R.drawable.avatar_hungry, "Cho ăn 🍙",
                    eventIntent(context, latestMsgId, "action", "feed"),
                ).build(),
            )
        }

        try {
            NotificationManagerCompat.from(context).notify(NOTIFICATION_ID, builder.build())
        } catch (_: SecurityException) {
            // user chưa cấp quyền notification — onboarding sẽ xin lại
        }
    }

    private fun eventIntent(context: Context, msgId: String, event: String, action: String?): PendingIntent {
        val intent = Intent(context, NotificationEventReceiver::class.java)
            .putExtra("msg_id", msgId)
            .putExtra("event", event)
            .putExtra("action", action)
        // requestCode phân biệt theo event để các PendingIntent không đè nhau
        val code = if (event == "dismissed") 10 else 11
        return PendingIntent.getBroadcast(
            context, code, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }

    private fun publishShortcut(context: Context, pet: Person, avatar: IconCompat) {
        val shortcut = ShortcutInfoCompat.Builder(context, SHORTCUT_ID)
            .setShortLabel(pet.name ?: "Bông")
            .setIcon(avatar)
            .setPerson(pet)
            .setLongLived(true)
            .setIntent(Intent(context, MainActivity::class.java).setAction(Intent.ACTION_VIEW))
            .build()
        ShortcutManagerCompat.pushDynamicShortcut(context, shortcut)
    }

    private fun drawableToIcon(context: Context, resId: Int): IconCompat {
        val drawable = ContextCompat.getDrawable(context, resId)!!
        if (drawable is BitmapDrawable) return IconCompat.createWithBitmap(drawable.bitmap)
        return IconCompat.createWithBitmap(drawable.toBitmap(108, 108))
    }
}
