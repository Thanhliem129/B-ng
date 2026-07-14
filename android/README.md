# Bông Android — Phase 0

Client chỉ là "renderer": nhận FCM data message → render notification kiểu tin nhắn
(`MessagingStyle` — avatar tròn, lịch sử hội thoại, y hệt Messenger/Zalo), gửi
reply/sự kiện về server. App UI chỉ có onboarding + phòng placeholder.

## Build

1. Mở thư mục `android/` bằng **Android Studio** (Ladybug trở lên). Lần đầu AS sẽ tự
   tạo Gradle wrapper — chấp nhận.
2. **Firebase:** tạo app Android trong Firebase project (package `com.bong.pet`),
   tải `google-services.json` bỏ vào `android/app/` (đã gitignore).
3. **Server URL:** sửa `SERVER_URL` trong `app/build.gradle.kts`:
   - Emulator: `http://10.0.2.2:8787` (mặc định)
   - Máy thật cùng WiFi: `http://<IP-máy-dev>:8787`
   - Máy thật ngoài mạng: tunnel (Cloudflare Tunnel / ngrok) trỏ vào cổng 8787
4. Run → onboarding: đặt tên, chọn xưng hô, cấp quyền notification, miễn battery
   optimization → chờ tin đầu tiên sau 15–30 phút (hoặc bắn ngay bằng
   `POST /api/debug/send`).

## Cấu trúc

```
com.bong.pet/
├── BongApp.kt                     # notification channel
├── Prefs.kt                       # device_id, tên pet, xưng hô, away state
├── api/ApiClient.kt               # POST register/reply/event (không dependency)
├── push/PetMessagingService.kt    # FCM → ChatStore → notification
├── notif/ChatNotifier.kt          # MessagingStyle + RemoteInput + feed + deleteIntent
├── notif/ReplyReceiver.kt         # RemoteInput → hiện ngay + gửi server
├── notif/NotificationEventReceiver.kt  # dismiss ("bị seen") + nút Cho ăn
├── store/ChatStore.kt             # lịch sử hội thoại (SharedPreferences)
└── ui/                            # OnboardingActivity, MainActivity (phòng)
```

## Lưu ý test trên máy Xiaomi/Oppo/Vivo

Đây là rủi ro chí mạng R2 (docs/01): các hãng này giết background rất hung hãn.
Ngoài battery whitelist trong onboarding, khi test cần:
- Xiaomi: Settings → Apps → Manage apps → Bông → Autostart ON + Battery saver "No restrictions"
- Oppo/Realme: cho phép Auto-launch + khóa app trong recent apps
- Vivo: cho phép High background power consumption

Phase 1 sẽ làm màn hướng dẫn tự detect OEM.
