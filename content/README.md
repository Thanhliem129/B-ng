# content/ — Thư viện hội thoại kịch bản (chạy không cần LLM)

Toàn bộ "não nói chuyện" của pet cho Phase 0: server chỉ cần đọc 5 file JSON này là pet
sống được — nhắn theo lịch, đi chơi, kể xấu hàng xóm, dỗi, và **trả lời tin nhắn của chủ**
mà không cần API key nào. Khi nào gắn LLM, lớp này vẫn giữ nguyên làm cheap-path (tiết
kiệm ~40% chi phí gọi API — xem docs/05).

## Các file

| File | Vai trò |
|---|---|
| [config.json](config.json) | Khung giờ, quiet hours, cap 6 tin/ngày, khoảng cách tin, tốc độ gửi bong bóng |
| [cast.json](cast.json) | Dàn nhân vật cố định: 7 hàng xóm (mỗi con một tính cách) + 2 "kẻ thù truyền kiếp" — để chuyện kể **nhất quán**, hàng xóm nào ra tính cách đó |
| [messages.json](messages.json) | ~66 template tin chủ động theo khung giờ: MORNING, HUNGRY (trưa đòi ăn), WANT_PLAY (chiều đòi đi chơi), POOP (tối đi ị 😄), NIGHT, STORY, SULK (dỗi theo 3 mức seen), RARE_EVENT |
| [scenarios.json](scenarios.json) | 9 kịch bản nhiều bước (arc): lẻn đi chơi rồi về khoe, biến mất im lặng, **sang nhà hàng xóm → về kể xấu** (21 câu chuyện riêng cho 7 hàng xóm), trốn tủ, mơ trưa, mất cọng thun, trốn tắm, xây căn cứ hộp giấy, chiến tranh bồ câu |
| [replies.json](replies.json) | Bộ trả lời reply theo từ khóa (không cần LLM): 12 rule + pool default lảng đáng yêu. Rule `safety_serious` LUÔN check trước tiên — gặp chủ đề nặng là tắt giọng đùa hoàn toàn |

## Cách server tiêu thụ (hợp đồng dữ liệu)

1. **Tick định kỳ** (5 phút): xác định window hiện tại → lọc template đúng window, chưa
   dùng trong `template_cooldown_days`, còn quota (`daily_message_cap`, `min_gap_minutes`,
   ngoài quiet hours) → chọn theo `weight` → điền slot `{pronoun}`, `{pet_name}` → gửi
   `messages[]` thành các bong bóng cách nhau `bubble_delay_seconds`.
2. **Arc**: mỗi ngày lúc 0h roll `trigger.chance` cho từng arc (tối đa `scenario_daily_max`
   arc/ngày); arc trúng được xếp giờ ngẫu nhiên trong window. Arc `visit_neighbor` chọn
   1 neighbor → step 2 lấy ngẫu nhiên 1 chuyện trong `gossip_pool[neighbor.id]`.
   Khi step có `away_status: true`, app hiện phòng trống + `room_note` (nếu có), và pet
   không gửi tin thường cho tới step kế.
3. **SULK**: trigger theo sự kiện dismiss notification (`seen_1/2/3` = số tin bị dismiss
   liên tiếp), không theo lịch.
4. **Reply**: normalize tin user (lowercase + bỏ dấu) → duyệt rules theo `priority` tăng
   dần → rule đầu tiên có keyword khớp (contains) → random 1 bộ `responses` → gửi sau
   `reply_delay_seconds`. Không khớp → `default`. `responses` là mảng các mảng: mỗi phần
   tử con là một bong bóng.

## Luật viết content mới (đọc trước khi thêm)

1. Giọng chuẩn theo [docs/04-prompts.md](../docs/04-prompts.md): xưng **tui**, viết thường,
   mỗi bong bóng ≤ 2 câu ngắn, gần như không emoji, không dấu chấm than kép.
2. Đọc to lên bằng giọng pet — không tự cười thì viết lại.
3. Trả lời được câu "có đáng screenshot không?".
4. Kể về hàng xóm phải ĐÚNG tính cách trong cast.json (Bún ngáo, Mochi chảnh, Vện sợ bướm...).
5. Không topic nhạy cảm, không nhắc app/tính năng/tiền — pet không biết nó là app.
6. Thêm xong chạy `node -e "JSON.parse(require('fs').readFileSync('<file>','utf8'))"` để
   chắc chắn JSON hợp lệ.
