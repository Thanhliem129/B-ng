# BÔNG — Con pet sống trong thanh thông báo

> Game không có màn hình chơi. Pet của bạn "ký sinh" vào đời sống số của bạn:
> nó nhắn tin cho bạn như một người thật, gửi ảnh selfie, giận dỗi seen không rep,
> và kể xấu pet của bạn thân bạn.

## Concept một dòng

**Một mối quan hệ, không phải một trò chơi.** Toàn bộ gameplay diễn ra trong
notification tray của Android. Mở app chỉ để ngắm phòng của nó và mua đồ.

## Tại sao ý tưởng này ăn

| Insight | Cách game khai thác |
|---|---|
| Gen Z nhắn tin nhiều hơn nói chuyện | Pet giao tiếp 100% qua tin nhắn — đúng "ngôn ngữ mẹ đẻ" của người chơi |
| Screenshot tin nhắn hài là content viral số 1 trên Threads/FB | Mỗi tin nhắn của pet được thiết kế để *đáng screenshot* |
| Mọi game pet đều chết vì "phải nhớ mở app" | Game này không cần mở app — nó tự tìm đến bạn |
| Drama giữa bạn bè là chất keo xã hội | Pet playdate + kể chuyện (bịa) về pet đứa kia → drama thật giữa người thật |

## Tài liệu

| File | Nội dung |
|---|---|
| [docs/01-phan-tich-game-design.md](docs/01-phan-tich-game-design.md) | Phân tích thị trường, rủi ro, game design chi tiết (persona, hệ thống mood, message types, social, monetization) |
| [docs/02-kien-truc-ky-thuat.md](docs/02-kien-truc-ky-thuat.md) | Kiến trúc Android + server, FCM, chiến lược LLM tiết kiệm chi phí, data model |
| [docs/03-ke-hoach-workflow.md](docs/03-ke-hoach-workflow.md) | Roadmap 4 phase, workflow phát triển, content pipeline, metrics |
| [docs/04-prompts.md](docs/04-prompts.md) | Bộ prompt LLM chi tiết: system prompt persona, prompt từng loại tin nhắn, memory, guardrails, few-shot tiếng Việt |
| [docs/05-phan-tich-chi-phi.md](docs/05-phan-tich-chi-phi.md) | Phân tích chi phí triển khai: setup, hạ tầng theo scale, mô hình chi phí LLM, điểm hòa vốn, ngân sách 6 tháng |

## Stack tóm tắt

- **Client:** Android (Kotlin, Jetpack Compose cho app-phòng), NotificationCompat MessagingStyle + RemoteInput
- **Server:** Node/TypeScript hoặc Python FastAPI, FCM Admin SDK, PostgreSQL, Redis (queue + scheduler)
- **LLM:** Claude Haiku 4.5 cho reply thông minh (~20% lưu lượng), template engine cho 80% còn lại
- **Ảnh selfie:** compose từ pool asset vẽ sẵn (sprite pet + background), KHÔNG gen AI runtime
- **Voice:** TTS pre-generate theo batch, phát qua notification

## Trạng thái triển khai

| Thành phần | Trạng thái |
|---|---|
| [server/](server/README.md) | ✅ Phase 0 hoàn chỉnh — brain tick, kế hoạch ngày, arc, dỗi, reply engine, FCM HTTP v1, console transport dev mode. Zero-LLM, zero npm dependency (Node ≥ 24) |
| [android/](android/README.md) | 🔨 Khung Phase 0 — MessagingStyle + RemoteInput + dismiss/feed, onboarding, phòng placeholder. Cần Android Studio + `google-services.json` để build |
| Gate Phase 0 | ⏳ Tự dùng 1 tuần + 3–5 bạn bè → "có mong tin nó nhắn không?" |

## Nguyên tắc thiết kế bất di bất dịch

1. **Pet là một đứa bạn, không phải một cái app.** Không bao giờ nhắn kiểu system message ("Bạn có 3 nhiệm vụ chưa hoàn thành").
2. **Ít mà chất.** Tối đa 4–6 tin/ngày. Một tin nhắn nhàm = một bước gần uninstall.
3. **Giận dỗi có duyên, không tống tiền cảm xúc.** Pet dỗi kiểu hài, không guilt-trip kiểu dark pattern.
4. **Screenshot-first.** Mỗi message type phải trả lời được câu hỏi: "người chơi có muốn chụp cái này khoe không?"
