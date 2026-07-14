# 03 — Kế hoạch & Workflow

## 3.1 Roadmap 4 phase

### PHASE 0 — Prototype "cảm giác" (1–2 tuần)
Mục tiêu: trả lời câu hỏi duy nhất — **nhận tin nhắn từ một con pet có thật sự sướng không?**

- [ ] Server tối giản (1 file): cron gửi FCM theo lịch cứng, pool ~40 tin viết tay
- [ ] Android app tối giản: xin quyền notification, render MessagingStyle + avatar, RemoteInput reply
- [ ] Reply → gọi Claude Haiku với system prompt persona (doc 04) → FCM trả lời sau delay ngẫu nhiên
- [ ] Tự dùng 1 tuần + đưa 3–5 người bạn dùng
- **Gate:** nếu sau 3 ngày mình vẫn *mong* tin nó nhắn → đi tiếp. Nếu thấy phiền → sửa content/nhịp trước khi viết thêm bất kỳ dòng code nào.

### PHASE 1 — MVP "một mối quan hệ hoàn chỉnh" (4–6 tuần)
- [ ] Pet Brain đầy đủ: chỉ số ẩn, rule engine, học khung giờ, quiet hours, cap tin/ngày
- [ ] Template engine + pool 300–500 tin viết tay (MORNING/HUNGRY/STORY/SULK/RARE_EVENT)
- [ ] Memory system: extraction batch + dùng memory trong template slot
- [ ] Selfie compose pipeline (10 background, 8 pose) + caption
- [ ] Onboarding đầy đủ (đặt tên, xưng hô, battery whitelist per-OEM, 24h đầu scripted)
- [ ] App UI: phòng pet + album + settings (chưa cần shop)
- [ ] Cost guard: cap LLM/user, prompt caching, token dashboard
- [ ] Closed beta 30–50 người (bạn bè + Threads)
- **Gate:** D7 retention > 35%, số screenshot tự nguyện đăng > 5

### PHASE 2 — Social & viral (3–4 tuần)
- [ ] Friend system (link mời) + Playdate engine + PLAYDATE_REPORT
- [ ] Voice messages (thu âm/TTS pre-gen ~50 câu)
- [ ] Nút "chia sẻ đoạn chat" xuất ảnh đẹp (khung chat giả lập, watermark tên app) — giảm ma sát screenshot
- [ ] Open beta + đăng organic trên Threads bằng chính screenshot pet của mình
- **Gate:** K-factor có tín hiệu (mỗi 10 user rủ được ≥ 3 user qua playdate invite)

### PHASE 3 — Monetization & mở rộng (liên tục)
- [ ] Shop: nội thất + outfit (xuất hiện trong selfie), IAP
- [ ] Gói tính cách thứ 2 (tsundere hoặc cục súc miền Tây)
- [ ] Subscription Bông+
- [ ] Sự kiện theo mùa (Tết pet đòi lì xì, Trung thu...) — content ops hàng tháng
- [ ] Cân nhắc iOS port

## 3.2 Workflow phát triển hằng ngày

```
ý tưởng content/feature
   │
   ▼
Viết message vào content sheet (xem 3.3) ──► review giọng điệu (đọc to lên, có cười không?)
   │                                              │ fail → sửa
   ▼                                              ▼
Merge vào template pool (JSON/DB seed) ◄──── pass
   │
   ▼
Deploy server (content không cần release app!)
   │
   ▼
Theo dõi metrics per-template: reply-rate, dismiss-rate
   │
   ▼
Template nào dismiss-rate cao / reply-rate thấp → giết hoặc viết lại
```

**Nhịp làm việc đề xuất (solo dev):**
- Sáng: code (client/server)
- Chiều tối: viết content (lúc não "chán code" viết tin nhắn lại duyên hơn)
- Mỗi tối: tự đọc lại toàn bộ tin pet gửi mình hôm nay như một user thật

## 3.3 Content pipeline (quan trọng ngang code)

Content sheet — mỗi dòng một message template:

| id | type | text | slots | điều_kiện | trọng_số | mood_range |
|---|---|---|---|---|---|---|
| morning_017 | MORNING | "dậy chưaaa. tui dậy từ 6h. tui đói từ 6h01" | — | — | 1.0 | 40–100 |
| story_042 | STORY | "hôm nay tui rình con thạch sùng {duration}. nó thắng." | duration | — | 1.0 | 50–100 |
| mem_003 | RARE_EVENT | "nè. {memory.event} xong chưa. tui để dành cho {pronoun} nửa cái bánh quy. có cắn một miếng rồi nhưng kệ đi" | memory.event, pronoun | có memory kind=event <7 ngày | 2.0 | any |

Quy trình duyệt content (kể cả content LLM sinh batch):
1. Sinh/viết → 2. đọc to bằng giọng pet → 3. hỏi "có screenshot không?" → 4. check blocklist → 5. vào pool.

## 3.4 Message flow chi tiết (sequence)

```
┌─ Tin chủ động ────────────────────────────────────────────────┐
│ Cron tick → Pet Brain chọn (type, template/LLM)                │
│  → Composer render text (điền slot memory/tên)                 │
│  → [nếu SELFIE] compose ảnh → upload CDN                       │
│  → FCM data message {type, text, media, avatar_mood, msg_id}   │
│  → Client render MessagingStyle + actions                      │
│  → Client báo về: delivered / dismissed / action               │
└────────────────────────────────────────────────────────────────┘

┌─ User reply ──────────────────────────────────────────────────┐
│ RemoteInput → POST /reply {text, client_msg_id}                │
│  → cheap-path check (chào/emoji/ăn chưa → template, khỏi LLM)  │
│  → LLM path: build prompt = [persona(cached) + state + memory  │
│     + 10 tin gần nhất + tin mới] → Haiku → output filter       │
│  → delay tự nhiên (5s–15min tùy "pet đang làm gì")             │
│  → FCM đẩy reply → client append vào MessagingStyle            │
│  → tối: batch memory-extraction các hội thoại trong ngày       │
└────────────────────────────────────────────────────────────────┘

┌─ Playdate ────────────────────────────────────────────────────┐
│ User A bấm đồng ý lời xin của pet → tạo playdate(scheduled_at) │
│  → đến giờ: sinh event_seed → 1 call LLM → report_a, report_b  │
│  → gửi A lúc T, gửi B lúc T+10..40min                          │
│  → cả hai đều có thể rep để "hỏi tới" → LLM giữ nhất quán seed │
└────────────────────────────────────────────────────────────────┘
```

## 3.5 Metrics — la bàn sản phẩm

| Metric | Ý nghĩa | Mục tiêu MVP |
|---|---|---|
| Notification reply-rate | Tin có đáng rep không (metric quan trọng NHẤT) | > 25% |
| Dismiss-rate per type | Type nào đang gây phiền | < 30% |
| D1 / D7 / D30 retention | Mối quan hệ có sống không | 60 / 35 / 20% |
| Permission grant rate (notif + battery) | Onboarding có thuyết phục không | > 85 / 50% |
| Share/screenshot events | Động cơ viral | tracking từ ngày 1 |
| LLM cost per MAU | Sống còn tài chính | < $0.05/tháng (xem doc 05) |
| Uninstall trong 48h đầu | Nhịp nhắn có sai không | < 15% |

## 3.6 Cấu trúc repo đề xuất

```
Bong/
├── README.md
├── docs/                      # tài liệu này
├── server/
│   ├── src/
│   │   ├── brain/             # rule engine, chỉ số, lịch trình đời sống
│   │   ├── composer/          # template engine + LLM client + output filter
│   │   ├── content/           # template pool (JSON), persona prompts
│   │   ├── fcm/
│   │   ├── api/               # reply, friend, shop endpoints
│   │   ├── playdate/
│   │   └── jobs/              # cron tick, memory extraction batch
│   └── test/
├── android/
│   └── app/src/main/java/.../
│       ├── notification/      # FCMService, renderer, reply receiver
│       ├── ui/                # Compose: room, album, shop, onboarding
│       └── data/              # Room offline queue, API client
└── assets/                    # sprite pet, backgrounds, voice files
```
