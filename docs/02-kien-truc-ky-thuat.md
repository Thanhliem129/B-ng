# 02 — Kiến trúc kỹ thuật

## 2.1 Quyết định kiến trúc nền tảng: SERVER-PUSH, không phải local scheduling

**Vấn đề:** máy Android VN (Xiaomi/Oppo/Vivo/Realme ~60% thị phần) giết background app cực kỳ hung hãn. WorkManager/AlarmManager local sẽ bị trễ hoặc chết hẳn → pet "câm" → concept sập.

**Giải pháp:** não của pet nằm HOÀN TOÀN trên server. Server quyết định khi nào nhắn gì, đẩy xuống qua **FCM data message (priority: high)** — FCM là kênh duy nhất OEM không dám giết (vì Facebook/Zalo dùng). Client chỉ là "renderer" của notification.

```
┌─────────────────────────────── SERVER ───────────────────────────────┐
│                                                                       │
│  ┌────────────┐   ┌──────────────┐   ┌─────────────┐   ┌──────────┐  │
│  │ Scheduler   │──►│ Pet Brain    │──►│ Message      │──►│ FCM       │  │
│  │ (tick 5 min │   │ (state machine│  │ Composer     │   │ Sender    │  │
│  │ + event     │   │ + đời sống    │  │ (template    │   │ (high     │  │
│  │ queue)      │   │ mô phỏng)     │  │ engine / LLM)│   │ priority) │  │
│  └────────────┘   └──────┬───────┘   └──────┬──────┘   └────┬─────┘  │
│                          │                   │                │        │
│  ┌────────────┐   ┌──────▼───────┐   ┌──────▼──────┐        │        │
│  │ Reply API   │──►│ PostgreSQL   │   │ Claude API   │        │        │
│  │ (nhận rep   │   │ (pet state,  │   │ (Haiku 4.5,  │        │        │
│  │ từ client)  │   │ memory, bond)│   │ prompt cache)│        │        │
│  └────────────┘   └──────────────┘   └─────────────┘        │        │
└───────────────────────────────────────────────────────────────┼────────┘
                                                                ▼
┌─────────────────────────────── CLIENT (Android) ─────────────────────┐
│  FCMService ──► NotificationRenderer (MessagingStyle, avatar, ảnh,    │
│                 voice, RemoteInput reply, action buttons)             │
│  Reply/Action ──► gọi Reply API (kèm offline queue nếu mất mạng)      │
│  App UI (Compose): phòng pet, shop, album, nhật ký, settings          │
└───────────────────────────────────────────────────────────────────────┘
```

**Bonus của server-push:** đổi tính cách, thêm event, sửa lỗi content — không cần update app.

## 2.2 Client Android — chi tiết

### Notification: dùng `MessagingStyle` — đây là vũ khí bí mật

`NotificationCompat.MessagingStyle` làm notification trông **y hệt tin nhắn Messenger/Zalo**: avatar tròn, tên người gửi, lịch sử hội thoại nhiều dòng, hỗ trợ ảnh inline (`setData` với image URI). Đúng cảm giác "có đứa nhắn cho mình".

```kotlin
val pet = Person.Builder()
    .setName(petName)                    // "Bông"
    .setIcon(IconCompat.createWithBitmap(petAvatar))  // avatar theo mood
    .build()

val style = NotificationCompat.MessagingStyle(mePerson)
    .addMessage("dậy chưaaa", timestamp, pet)
    .addMessage("tui đói từ 6h01", timestamp + 1, pet)

val replyAction = NotificationCompat.Action.Builder(icon, "Rep nó", replyPendingIntent)
    .addRemoteInput(RemoteInput.Builder("key_reply").setLabel("Nhắn cho ${petName}...").build())
    .build()

val feedAction = NotificationCompat.Action.Builder(icon, "Cho ăn 🍙", feedPendingIntent).build()
```

Chi tiết quan trọng:
- **Conversation notification + shortcut** (`setShortcutId`): Android 11+ đưa pet vào mục "Conversations" ưu tiên — pet ngang hàng người thật theo đúng nghĩa đen của OS.
- **Avatar đổi theo mood** (vui/đói/dỗi) — user nhìn icon đoán được tâm trạng.
- **Deleted intent** (`setDeleteIntent`): biết user swipe-dismiss → báo server → pet "bị seen".
- Ảnh selfie: `MessagingStyle.Message.setData("image/png", uri)` — ảnh hiện inline trong notification.
- Voice: notification kèm action phát audio, hoặc mở deep-link vào app phát ngay.
- Channel riêng cho từng loại (chat / event) để user tinh chỉnh mà không tắt hết.

### Reply flow

```
User gõ reply trên notification
  → BroadcastReceiver nhận RemoteInput
  → POST /reply (kèm client_msg_id chống duplicate)
  → cập nhật notification ngay thành "Đã gửi ✓" (thêm message của user vào MessagingStyle)
  → server trả lời qua FCM sau delay tự nhiên 5s–15phút (pet KHÔNG rep ngay tắp lự — người thật không rep trong 0.5 giây)
  → nếu offline: queue vào Room, WorkManager retry
```

### App UI (phần "phụ" nhưng phải đẹp)

- **Phòng của pet**: 1 màn hình Compose, pet animation idle (Lottie/Rive), đồ nội thất đã mua hiển thị trong phòng. Pet đang "đi chơi" thì phòng trống + note giấy "tui ra ngoài xíu".
- **Album**: mọi selfie pet từng gửi (đây là bảo tàng screenshot).
- **Shop, Bạn bè (playdate), Settings** (giờ yên tĩnh, độ nói nhiều, xưng hô).

## 2.3 Server — chi tiết

### Stack đề xuất

- **Node.js + TypeScript** (hoặc FastAPI nếu quen Python hơn — cả hai đều ổn, chọn cái mình code nhanh nhất)
- **PostgreSQL**: toàn bộ state. **Redis**: job queue (BullMQ) + rate limit + cache.
- **firebase-admin** SDK gửi FCM.
- Deploy: 1 VPS/Fly.io/Railway là đủ cho <50k user. Không microservice sớm.

### Pet Brain — máy trạng thái mô phỏng "đời sống"

Tick 5 phút/lần (cron quét user theo batch). Với mỗi pet:

```
1. Cập nhật chỉ số theo thời gian (hunger giảm dần, ...)
2. Kiểm tra lịch trình đời sống hôm nay (sinh lúc 0h mỗi ngày, seed ngẫu nhiên:
   hôm nay Bông "đi đâu", "làm gì" — dùng làm chất liệu cho STORY/SELFIE)
3. Duyệt rule engine, ví dụ:
   - now ∈ khung giờ dậy của user && chưa gửi MORNING → gửi MORNING
   - hunger < 30 && chưa đòi ăn 4h qua → gửi HUNGRY
   - user dismiss 2 tin liên tiếp && mood < 40 → lên lịch SULK
   - đến giờ playdate đã hẹn → chạy playdate, sinh 2 bản kể chuyện
4. Ràng buộc: đếm tin đã gửi hôm nay < cap; ngoài quiet hours; cách tin trước ≥ 45 phút
5. Chọn 1 tin (ưu tiên theo trọng số), composer sinh nội dung, đẩy FCM
```

**Học khung giờ:** log timestamp mọi lần user rep → sau 1 tuần có histogram giờ hoạt động → nhắn vào giờ user hay rep nhất. Đơn giản, không cần ML.

### Data model (rút gọn)

```sql
users(id, fcm_token, tz, pronoun, wake_hint, quiet_start, quiet_end, chattiness, created_at)
pets(id, user_id, name, skin, personality_pack, hunger, mood, bond_xp, bond_level,
     independence, today_seed, last_msg_at, msgs_sent_today)
pet_memory(id, pet_id, kind, key, value, confidence, source_msg_id, expires_at)
  -- kind: fact | preference | event | person
messages(id, pet_id, direction, type, content, media_url, llm_used, created_at,
         delivered, dismissed, replied)
friendships(id, pet_a, pet_b, status, created_at)
playdates(id, friendship_id, scheduled_at, event_seed, report_a, report_b, status)
inventory(id, user_id, item_id, placed_slot)
```

### Chiến lược LLM — kiểm soát chi phí (mục tiêu: < $0.05/MAU/tháng, xem phân tích đầy đủ ở [doc 05](05-phan-tich-chi-phi.md))

**Nguyên tắc 80/20:** template engine phủ 80% tin chủ động; LLM chỉ dùng cho chỗ tạo giá trị thật:

| Luồng | Nguồn | Lý do |
|---|---|---|
| MORNING, HUNGRY, SULK, RARE_EVENT | 100% template (pool 500+ câu viết tay, có slot `{tên}`, `{món ăn}`, `{memory}`) | Lặp theo ngày, viết tay duyên hơn LLM |
| STORY, SELFIE caption | Template pool lớn + biến thể; LLM pre-generate theo **batch** (sinh 100 chuyện/lần, duyệt tay, nhét vào pool) | LLM offline-batch = rẻ + kiểm duyệt được |
| REPLY (user rep tự do) | **LLM realtime (Haiku 4.5)** + prompt caching | Đây là moment "nó hiểu mình" — đáng tiền nhất |
| PLAYDATE_REPORT | LLM realtime (2 bản kể/playdate) | Cần sáng tạo + nhất quán 2 phía |
| Memory extraction | LLM, gộp batch cuối ngày | Không cần realtime |

**Kỹ thuật giảm chi phí cụ thể:**
1. **Prompt caching**: system prompt persona (~2k token) cache được — trả 10% giá cho phần cache đọc lại.
2. **Cap theo user**: N lượt reply LLM/ngày (free: ~15, sub: ~60). Vượt cap → pet "buồn ngủ": *"tui buồn ngủ quá... mai nói tiếp nha"* — cạn budget cũng thành nét tính cách, user không biết đó là rate limit.
3. `max_tokens: 150` — pet chỉ nhắn ngắn, đúng persona luôn.
4. Reply gần giống nhau (chào, "ăn chưa", emoji đơn) → match trước bằng embedding/regex → trả template, khỏi gọi LLM.
5. Ước tính với Haiku (chi tiết ở doc 05): ~$0.0015/lượt reply, trung bình ~50 lượt LLM/MAU/tháng sau cheap-path ≈ **$0.05–0.10/MAU/tháng**, giảm còn ~$0.04–0.06 sau tối ưu. 100k MAU ≈ $5k/tháng — cần doanh thu ~2% sub để bù, khả thi.

### Selfie pipeline — KHÔNG gen ảnh AI runtime

Gen ảnh AI mỗi selfie vừa đắt vừa lệch art style. Thay vào đó **compose từ asset**:

```
[Background pool ~30 cảnh: quán cà phê, mái nhà, công viên, bụi cỏ, cửa sổ mưa...]
        +
[Pet sprite theo pose/mood/outfit đang mặc ~20 pose]
        +
[Props ngẫu nhiên: lá cây, ly nước, con thạch sùng...]
        ↓ compose server-side (sharp/canvas) hoặc client-side
[Selfie duy nhất + caption khớp với "hôm nay Bông đi đâu" trong today_seed]
```

Outfit user mua xuất hiện trong selfie → cosmetic có mặt trong content shareable → thúc mua hàng tự nhiên.

### Voice pipeline

- Kịch bản voice ngắn 2–6s, viết tay (~50 câu/mùa), TTS chất giọng dễ thương (Azure/Google TTS tiếng Việt, hoặc thu âm thật nếu tìm được giọng hay — thu thật duyên hơn nhiều).
- Pre-generate toàn bộ, lưu CDN. Server chỉ chọn file phù hợp ngữ cảnh. **Không TTS runtime.**

### Playdate engine

```
1. Cron chọn cặp friendship đến hẹn
2. Sinh event_seed: {hoạt động: "tranh nhau cái lá", ai_thắng: A, chi_tiết: [...]}
3. Gọi LLM 1 lần với seed + persona 2 pet → sinh 2 bản kể (A kể theo góc A, B theo góc B,
   lệch nhau có chủ đích, mỗi bản có 1 chi tiết phóng đại được đánh dấu)
4. Gửi lệch giờ nhau 10–40 phút (tự nhiên hơn cùng lúc)
```

## 2.4 Bảo mật & vận hành

- Auth: anonymous device-id trước (giảm ma sát), gắn Google sign-in khi cần sync/friend.
- Mọi output LLM qua filter (blocklist + moderation) trước khi đẩy FCM.
- Rate limit Reply API theo device. Log token usage per user — dashboard chi phí ngay từ ngày 1.
- FCM token rotation: refresh khi `onNewToken`, dọn token chết theo response FCM.
- Analytics tối thiểu: delivered/opened/replied/dismissed per message type — đây là la bàn tune content.
