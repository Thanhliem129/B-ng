# 01 — Phân tích & Game Design

## PHẦN A: PHÂN TÍCH

### A1. Phân tích thị trường & đối thủ

| Sản phẩm | Giống gì | Khác gì (lợi thế của mình) |
|---|---|---|
| **Finch** (self-care pet) | Pet gửi notification, bond qua chăm sóc | Finch vẫn app-first, notification chỉ là reminder. Pet của mình *sống* trong notification, có tính cách, nhắn như người thật |
| **Tamagotchi / Pou / My Talking Tom** | Nuôi pet, cho ăn | Cần mở app, gameplay lặp lại, pet không có "đời sống riêng" |
| **Replika / Character.AI** | Chat với nhân vật AI | Họ là chatbot chờ bạn nhắn trước. Pet của mình *chủ động* nhắn, có nhu cầu riêng, và là pet chứ không phải bạn trai/gái ảo (an toàn hơn nhiều về mặt nội dung) |
| **Widget pets (Peridot, Dot)** | Pet hiện diện thụ động trên màn hình | Widget không tạo cảm giác "được quan tâm". Notification = có người tìm mình |
| **Zalo/Messenger bots** | Nhắn tin chủ động | Không phải pet, không có game state, không có phòng/đồ/bond |

**Khoảng trống:** chưa có sản phẩm nào ở VN (và rất ít trên thế giới) làm "pet giao tiếp chủ động qua notification như một mối quan hệ nhắn tin thật". Finch là comp gần nhất và đã chứng minh retention của mô hình "pet quan tâm mình" là rất cao (D30 ~25%, top self-care app).

### A2. Insight người dùng mục tiêu

- **Đối tượng chính:** 16–28 tuổi, dùng Threads/FB/TikTok, quen văn hóa "rep tin nhắn", thích humor kiểu "mèo hư", "con giáp thứ 13", meme drama.
- **Job-to-be-done:** không phải "chơi game" — mà là *"có một đứa quan tâm mình vô điều kiện nhưng theo cách hài hước, không nặng nề"* + *"có content để đăng"*.
- **Kênh lan truyền tự nhiên:** screenshot đoạn chat của pet → đăng Threads → "app gì đây tải với" → viral loop không tốn tiền marketing.

### A3. Phân tích rủi ro (quan trọng — đọc kỹ trước khi code)

| # | Rủi ro | Mức độ | Giải pháp |
|---|---|---|---|
| R1 | **Notification fatigue** — spam là uninstall ngay | ☠️ Chí mạng | Cap cứng 4–6 tin/ngày, học khung giờ user hay rep, quiet hours mặc định 22h–7h30, user chỉnh được "độ nói nhiều" |
| R2 | **OEM battery killer** (Xiaomi/Oppo/Vivo — chiếm ~60% máy Android VN) giết background process | ☠️ Chí mạng | Kiến trúc **server-push (FCM high priority)** thay vì local scheduling; onboarding có bước hướng dẫn whitelist battery theo từng hãng máy; xem doc 02 |
| R3 | **Chi phí LLM** phình theo user | Cao | Hybrid 80/20: template + LLM; cap token/user/ngày; Haiku; prompt caching. Chi tiết doc 02 |
| R4 | **Pet nhạt** — viết tính cách không duyên thì toàn bộ concept sập | Cao | Đầu tư nhất vào content: persona bible + 500 template message viết tay được test trên nhóm beta; LLM chỉ phủ phần còn lại. Doc 04 |
| R5 | **iOS không làm được như Android** (background hạn chế, không có MessagingStyle tương đương) | Trung | Android-first. iOS phase sau: vẫn khả thi với push server-side + UNTextInputNotificationAction cho reply, chỉ mất một số hiệu ứng |
| R6 | **Nội dung LLM lệch chuẩn** (pet nói bậy, tư vấn nhạy cảm) | Trung | Guardrails nhiều lớp trong prompt + output filter + pet có "quyền" né topic ("tui là con mèo mà bà hỏi tui chuyện đó chi") — né topic trở thành một nét tính cách. Doc 04 |
| R7 | **User bỏ 3 ngày rồi quay lại thấy pet "chết"** → cảm giác tội lỗi → không mở lại | Trung | Pet KHÔNG BAO GIỜ chết. Bỏ lâu → pet dỗi/tự lập hơn, quay lại luôn có đường hàn gắn dễ và ngọt |
| R8 | Drama playdate gây hiểu lầm thật giữa 2 người bạn | Thấp | Chuyện bịa luôn được flag hài hước rõ ràng, có disclaimer trong app, chỉ bịa chuyện vô hại (xem A7) |

---

## PHẦN B: GAME DESIGN

### B1. Nhân vật — "Bông" (persona mặc định)

- **Loài:** một sinh vật tròn tròn không rõ loài (mèo lai bụi bông?) — tránh gắn cứng vào mèo/chó để dễ mở rộng skin.
- **Tính cách lõi:** lười nhưng bám người, mồm mép, hơi mất dạy kiểu đáng yêu, drama queen chuyện nhỏ nhặt, xưng **"tui – bà/ông"** (đọc từ giới tính user hoặc mặc định "bà").
- **Đời sống riêng:** pet có "lịch trình" bịa của nó — đi phơi nắng, rình con thạch sùng, đi chơi với pet hàng xóm. Nó KỂ về đời nó chứ không chỉ đòi ăn. Đây là điểm khác biệt lớn nhất với mọi pet game: **pet có chuyện để kể**.
- Người chơi được đặt lại tên pet; tính cách khác (tsundere, cục súc, sến...) là item mở khóa/premium.

### B2. Chỉ số ẩn (không hiện số cho user — user chỉ *cảm nhận* qua thái độ pet)

| Chỉ số | Range | Tăng khi | Giảm khi | Ảnh hưởng |
|---|---|---|---|---|
| **No bụng** (hunger) | 0–100 | Được cho ăn (action trên notification) | Theo giờ | Đói → nhắn đòi ăn, đói lâu → dỗi |
| **Mood** | 0–100 | Được rep, được xoa đầu, chơi với bạn | Bị seen không rep, bị bỏ đói | Quyết định *giọng điệu* mọi tin nhắn |
| **Bond** (thân thiết) | level 1–50 | Tương tác đều đặn (không phải nhiều — mà *đều*) | Không bao giờ giảm, chỉ đứng | Mở khóa loại tin nhắn sâu hơn, pet nhớ nhiều hơn, gọi tên thân mật hơn |
| **Sự tự lập** | 0–100 | User bỏ bê lâu | User quay lại chăm | Bỏ lâu pet không chết mà "tự lập" — nhắn ít đi, hơi khách sáo. Chăm lại thì tan băng |

**Triết lý:** không có fail state. Trạng thái tệ nhất là "pet hơi xa cách", và luôn hàn gắn được trong 1–2 ngày.

### B3. Các loại tin nhắn (message taxonomy)

Mỗi tin thuộc 1 type, có budget/ngày, nguồn sinh (template hay LLM):

| Type | Ví dụ | Tần suất | Nguồn |
|---|---|---|---|
| `MORNING` | "dậy chưaaa. tui dậy từ 6h. tui đói từ 6h01" | 1/ngày, theo giờ dậy học được | Template + slot |
| `HUNGRY` | "bụng tui đang kêu nè. bà nghe hông. để tui ghé sát điện thoại" | 1–2/ngày khi hunger < 30 | Template |
| `STORY` (kể chuyện đời nó) | "hôm nay tui rình con thạch sùng 2 tiếng. nó thắng." | 1/ngày | Template pool lớn + LLM trộn |
| `SELFIE` | [ảnh nó ngồi ở quán cà phê] "tui đi cà phê một mình. đúng hơn là tui ngồi ké." | 2–3/tuần | Asset compose + caption template |
| `VOICE` | Tin voice 3–5s lí nhí "bà ơi... thôi khỏi" | 1–2/tuần | TTS pre-gen |
| `SULK` (dỗi) | "" (tin nhắn trống) → 10 phút sau: "hông có gì" | Khi bị seen 2+ tin liên tiếp | Template |
| `PLAYDATE_REPORT` | "tui mới đi chơi với Mochi về. bà biết gì chưa. thôi tui hông kể đâu" | Sau mỗi playdate | LLM (đây là chỗ đáng tiền nhất) |
| `REPLY` | Trả lời tin user rep | Không giới hạn nhưng cap token/ngày | LLM (Haiku) + fallback template |
| `RARE_EVENT` | Sự kiện hiếm: pet gửi "quà" nó nhặt được, pet nằm mơ kể lại | ~1/tuần, random | Template viết tay chất lượng cao |

**Quy tắc vàng:** tổng tin chủ động ≤ 6/ngày. Thà thiếu còn hơn thừa.

### B4. Tương tác của người chơi (100% trên notification)

1. **Reply text** (RemoteInput) — nói chuyện tự do, pet trả lời bằng LLM.
2. **Quick action buttons** trên notification: `[Cho ăn 🍙]` `[Xoa đầu]` — không cần gõ, một chạm.
3. **Seen không rep** — cũng là một tương tác! Pet biết notification đã bị dismiss (swipe) và sẽ có thái độ.
4. Trong app (phụ): ngắm phòng, mua/xếp đồ nội thất, xem album selfie pet đã gửi, xem "nhật ký" pet, kết bạn playdate, settings.

### B5. Vòng lặp cốt lõi (core loop)

```
  Pet chủ động nhắn (theo lịch trình đời nó + trạng thái)
        │
        ▼
  User thấy notification giữa đời thật ──── lơ ──► Pet dỗi/tự lập (vẫn có đường về)
        │ rep / bấm nút
        ▼
  Pet phản hồi có duyên, +bond, pet nhớ thông tin về user
        │
        ▼
  Bond tăng → tin nhắn sâu hơn, cá nhân hơn, pet "hiểu mình" hơn
        │
        ▼
  Khoảnh khắc đáng screenshot → đăng Threads → bạn bè tải → PLAYDATE
        │
        ▼
  Pet đi chơi với pet của bạn → về kể chuyện (có bịa) → drama vui giữa 2 người thật
        └──────────► lan truyền tiếp
```

### B6. Hệ thống trí nhớ của pet (bond phải *cảm nhận được*)

Pet nhớ facts về user, trích từ các đoạn rep: tên gọi thân mật, món ăn user thích, user học/làm gì, deadline user than vãn, tên crush (nếu user kể)... Lưu dạng key-value có TTL. Sau đó dùng lại một cách *tự nhiên và bất ngờ*:

> Tuần trước user rep: "tui đang ôn thi mệt quá"
> 3 ngày sau, 21h, pet nhắn: "nè. thi xong chưa. tui để dành cho bà nửa cái bánh quy. có cắn một miếng rồi nhưng mà kệ đi"

Đây là khoảnh khắc "ủa nó nhớ luôn hả" — moment đáng screenshot nhất và rẻ nhất để tạo ra (1 lần trích xuất + 1 template có slot).

### B7. Social twist — Playdate & Drama

- User A và B kết bạn trong app (mã mời/link). Pet hai bên thành "bạn".
- Server tạo **playdate event** ~2 lần/tuần: hai pet "đi chơi với nhau" (offscreen, không cần realtime).
- Sau playdate, **mỗi pet về kể chuyện cho chủ của nó — hai phiên bản KHÁC NHAU về cùng một sự kiện**, trong đó có chi tiết bịa/phóng đại:
  - Pet A kể: "Mochi giành cái lá của tui. xong nó chối."
  - Pet B (Mochi) kể: "hôm nay tui nhặt được cái lá đẹp lắm mà con Bông cứ nhìn chằm chằm. tui cho nó luôn. tui tốt bụng ghê."
- Hai user so tin nhắn với nhau → cười → screenshot cả đôi → viral kép.
- **An toàn:** chuyện bịa chỉ xoay quanh đồ vật/đồ ăn/trò chơi của pet, KHÔNG BAO GIỜ bịa về chủ của pet kia (không "chủ của Mochi nói xấu bà" — cấm tuyệt đối trong prompt).
- Pet cũng có thể "xin" chủ: "mai cho tui qua nhà Mochi chơi nha" → user bấm đồng ý → tạo lịch playdate.

### B8. Monetization (không phá hoại mối quan hệ)

| Nguồn thu | Chi tiết | Nguyên tắc |
|---|---|---|
| Đồ nội thất phòng | Skin phòng, giường, cây cảnh — ảnh hưởng background selfie pet gửi | Cosmetic thuần |
| Outfit pet | Xuất hiện trong selfie → user muốn pet mặc đẹp để screenshot | Cosmetic thuần |
| Gói tính cách/giọng | Tsundere, cục súc miền Tây, tiểu thư... | Premium 1 lần |
| Subscription "Bông+" | Nhiều tin LLM hơn, voice message nhiều hơn, pet nhớ dai hơn, selfie độc quyền | KHÔNG bán thức ăn, KHÔNG bán "pet bớt dỗi" — cảm xúc không phải hàng hóa |

**Cấm:** pay-to-feed, pay-to-un-sulk, quảng cáo chen vào giọng pet. Một lần user cảm thấy pet là máy bán hàng, mối quan hệ chết.

### B9. Onboarding (15 phút đầu quyết định tất cả)

1. Mở app lần đầu: không có menu — chỉ có một quả trứng/cục bông. Đặt tên. Chọn cách xưng hô.
2. Xin quyền notification với lời thoại của pet: "cho tui quyền nhắn tin cho bà nha. hông thôi tui nhắn vào hư không đó."
3. **Bước sống còn:** hướng dẫn tắt battery optimization theo từng hãng máy (detect OEM, hiện đúng hướng dẫn Xiaomi/Oppo/Samsung...), cũng bằng giọng pet: "máy bà nó hay giết tui lắm. bà vào đây cứu tui cái."
4. Trong 24h đầu, pet nhắn dày hơn bình thường một chút (6–7 tin, chất lượng cao nhất, viết tay 100%) để "cắm móc" — sau đó giãn về nhịp thường.
5. Tin đầu tiên đến sau khi đóng app 15–30 phút (không phải ngay lập tức — tạo cảm giác "nó tự nhắn").
