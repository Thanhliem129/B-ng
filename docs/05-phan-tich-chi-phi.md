# 05 — Phân tích chi phí triển khai

> Tỷ giá quy đổi dùng trong doc: 1 USD ≈ 26.000 VND.
> Giá LLM theo bảng giá Anthropic hiện hành: Haiku 4.5 = $1/triệu token input,
> $5/triệu token output; cache read = $0,10/triệu; Batch API giảm 50%.

## 5.1 Bức tranh tổng: tiền đi đâu

```
CHI PHÍ = Một lần (setup + asset)
        + Cố định hàng tháng (hạ tầng — gần như phẳng theo scale)
        + Biến đổi theo user (LLM — ĐÂY LÀ CON SỐ QUYẾT ĐỊNH)
        + Nhân lực (solo dev = chi phí cơ hội, không phải tiền mặt)
```

Điểm mấu chốt của dự án này: **FCM miễn phí vô hạn** và hạ tầng rất nhẹ (server chỉ gửi text + ảnh nhỏ), nên chi phí gần như dồn hết vào một biến duy nhất — **số lượt gọi LLM**. Kiểm soát được nó là kiểm soát được toàn bộ bài toán tài chính.

---

## 5.2 Chi phí MỘT LẦN (setup)

| Khoản | Phương án | Chi phí |
|---|---|---|
| Google Play developer | Bắt buộc, trả 1 lần | $25 (~650k) |
| Domain + email | 1 năm | ~$15 (~400k) |
| **Art asset** — pet sprite (~20 pose × 4 mood), 30 background selfie, ~40 item nội thất/outfit | Tự làm (có AI hỗ trợ draft, tự chỉnh style) | 0đ tiền mặt, ~3–4 tuần công |
| | Thuê freelancer VN (200–500k/asset) | 25–40 triệu (~$1.000–1.600) |
| **Voice** ~50 câu 2–6s | TTS (Azure/Google, tiếng Việt) | < 500k, chất lượng trung bình |
| | Thu âm giọng thật (khuyên dùng — duyên hơn hẳn) | 3–5 triệu/session |
| Apple Developer (chỉ khi làm iOS, Phase 3) | Hàng năm | $99/năm |

**Tổng setup:** tối thiểu **~1,5 triệu VND** (tự làm art) → **~45 triệu VND** (thuê toàn bộ). Khuyến nghị Phase 0–1: tự làm art ở mức "đủ dễ thương", chỉ thuê khi concept đã được validate — art đẹp không cứu được pet nhạt.

---

## 5.3 Chi phí CỐ ĐỊNH hàng tháng (hạ tầng) — theo giai đoạn

| Hạng mục | Phase 0–1 (<1k user) | 10k MAU | 100k MAU |
|---|---|---|---|
| App server (VPS Hetzner/Contabo hoặc Railway/Fly) | $6–15 (1 VPS nhỏ chạy tất) | $20–40 | $80–150 (2 node + LB) |
| PostgreSQL | chạy chung VPS: $0 | managed $15–25 | managed $50–100 |
| Redis (queue + cache) | chung VPS: $0 | chung app server hoặc $10 | $15–25 |
| Storage + CDN ảnh/voice (Cloudflare R2 — **egress miễn phí**) | ~$1 | ~$5 | $15–30 |
| FCM (push notification) | **$0** | **$0** | **$0** |
| Monitoring/error (Sentry, Grafana Cloud free tier) | $0 | $0 | $0–25 |
| **Tổng hạ tầng** | **~$10–15/tháng** (~300–400k) | **~$50–80** (~1,5–2tr) | **~$200–330** (~5–8,5tr) |

Nhận xét: hạ tầng **không bao giờ là vấn đề** của dự án này — 100k user vẫn chỉ tốn cỡ tiền thuê một góc văn phòng. Ảnh selfie có thể compose phía client (asset đã nằm trong APK) để đẩy chi phí storage/CDN về gần 0 nếu cần.

---

## 5.4 Chi phí BIẾN ĐỔI — LLM (phân tích kỹ, đây là con số sống còn)

### Đơn giá một lượt gọi

**Reply realtime (Haiku 4.5, có prompt caching):**

| Thành phần | Token | Đơn giá | Thành tiền |
|---|---|---|---|
| Persona + guardrails (cache read) | ~2.000 | $0,10/M | $0,00020 |
| State + memory + 10 tin gần nhất (không cache) | ~850 | $1/M | $0,00085 |
| Output (max 150) | ~100 | $5/M | $0,00050 |
| **Một lượt reply** | | | **≈ $0,0015** |

Các luồng khác (tính trên đầu user/tháng): playdate report ~$0,006; memory extraction chạy Batch API (giảm 50%) ~$0,009; story sinh batch offline gần như 0 (chia đều cho toàn bộ user). **Cộng ~$0,015/user/tháng** ngoài reply.

### Mô hình hành vi user (giả định cần kiểm chứng ở beta)

| Nhóm | Tỷ trọng | Hành vi | Lượt reply/tháng |
|---|---|---|---|
| Nhẹ | 60% | 1–2 rep/ngày, ~10 ngày hoạt động | ~15 |
| Vừa | 30% | ~5 rep/ngày, ~20 ngày | ~100 |
| Nghiện | 10% | chạm cap 15/ngày, ~28 ngày | ~420 |

→ Trung bình gia quyền: **~81 lượt reply/MAU/tháng**.
→ Cheap-path (chào hỏi, "ăn chưa", emoji đơn → template, không gọi LLM) lọc được ~40%: còn **~49 lượt LLM**.

### Chi phí LLM trên mỗi MAU/tháng

```
49 lượt × $0,0015 + $0,015 (playdate/memory) ≈ $0,09/MAU/tháng
Sau khi tối ưu (mục 5.6): ~$0,04–0,06/MAU/tháng
```

> ⚠️ **Đính chính so với doc 02 bản đầu:** ước tính cũ "$0,005–0,01/user/tháng" tính
> thiếu tần suất reply thực tế. Con số làm việc từ nay: **$0,05–0,10/MAU/tháng**
> (mặc định), **$0,04–0,06** sau tối ưu. Doc 02 đã được sửa theo.

### Tổng LLM theo scale

| Scale | Mặc định (~$0,09) | Sau tối ưu (~$0,05) |
|---|---|---|
| 1.000 MAU | ~$90/tháng (~2,3tr) | ~$50 (~1,3tr) |
| 10.000 MAU | ~$900 (~23tr) | ~$500 (~13tr) |
| 100.000 MAU | ~$9.000 (~234tr) | ~$5.000 (~130tr) |

---

## 5.5 TỔNG CHI PHÍ hàng tháng theo giai đoạn

| | Phase 0–1 (500 MAU) | Beta lớn (10k MAU) | Thành công (100k MAU) |
|---|---|---|---|
| Hạ tầng | $12 | $65 | $270 |
| LLM (sau tối ưu) | $25 | $500 | $5.000 |
| **Tổng/tháng** | **~$40 (~1tr VND)** | **~$570 (~15tr)** | **~$5.300 (~138tr)** |
| **Chi phí/MAU** | $0,08 | $0,057 | $0,053 |

**Kết luận quan trọng:** giai đoạn validate ý tưởng (Phase 0–2) chỉ tốn **~1–3 triệu VND/tháng** — rẻ hơn một khóa học online. Rủi ro tài chính thật sự chỉ xuất hiện khi *thành công* (100k MAU), và lúc đó bài toán chuyển thành: doanh thu/MAU có vượt $0,05 không?

---

## 5.6 Đòn bẩy giảm chi phí LLM (xếp theo hiệu quả/công sức)

1. **Cheap-path router** (đã thiết kế): regex/embedding match các reply phổ biến → template. Lọc 40–50% lượt gọi. *Hiệu quả nhất, làm ngay từ MVP.*
2. **Rút context:** 6 tin gần nhất thay vì 10, memory chỉ đưa 3 mục liên quan nhất → input không cache giảm từ 850 → ~500 token (−40% phần đắt thứ nhì).
3. **Cap free thông minh:** 10 lượt LLM/ngày cho free (thay vì 15) — nhóm "nghiện" 10% đang chiếm ~50% chi phí; chính họ là người sẵn sàng mua sub. Cap chuyển họ thành doanh thu thay vì chi phí.
4. **Batch API cho mọi thứ không realtime** (memory, story, thậm chí pre-gen sẵn reply cho các tình huống đoán trước): giảm 50% các luồng đó.
5. **Model routing:** thử nghiệm model nhỏ hơn/self-host cho cheap-path mở rộng — chỉ làm khi >50k MAU, không tối ưu sớm.

---

## 5.7 Doanh thu đối chiếu — điểm hòa vốn

Giả định thị trường VN: sub "Bông+" 39k VND/tháng (net về tay sau Google 15% + VAT ≈ **$1,2**); IAP cosmetic trung bình ~$0,03/MAU/tháng (net).

| Scale | Chi phí/tháng | Doanh thu cần | Tỷ lệ sub cần để hòa vốn |
|---|---|---|---|
| 500 MAU | $40 | $40 | không cần — coi là học phí |
| 10k MAU | $570 | $570 | ~2,3% sub (230 người) — **khả thi** (Finch đạt 3–5%) |
| 100k MAU | $5.300 | $5.300 | ~2,0% sub + IAP — **khả thi nếu content tốt** |

Cấu trúc chi phí này có một đặc tính đẹp: **chi phí/MAU gần như phẳng (~$0,05) trong khi tỷ lệ trả phí thường tăng theo bond** — user gắn bó càng lâu càng dễ mua đồ cho pet. Nghĩa là margin cải thiện dần theo thời gian sống của cohort, ngược với game ads-based.

---

## 5.8 Rủi ro chi phí & phòng bị

| Rủi ro | Kịch bản | Phòng bị |
|---|---|---|
| **Viral đột ngột** (một screenshot nổ trên Threads, +50k user/tuần) | LLM bill nhảy ×10 | Cap/user là cầu chì tự nhiên; thêm **global kill-switch**: quá ngưỡng $X/ngày → toàn bộ pet "buồn ngủ sớm" (giảm cap tạm thời), user không nhận ra sự cố |
| Abuse (user spam reply, script) | Đốt token | Rate limit theo device + cap ngày; pet tự có cớ ngưng ("tui đi ngủ đây") |
| Giá LLM thay đổi | Tăng giá / model cũ bị khai tử | Composer đã tách lớp — swap model là đổi config; template pool là fallback 100% miễn phí |
| Tỷ giá USD/VND tăng | Chi phí VND tăng ~5–10%/năm | Đệm 10% vào mọi dự toán ở trên |
| Google Play chậm duyệt / reject notification-heavy app | Trễ launch | Đọc kỹ policy notification trước; app có UI thật (phòng pet) nên không phải "notification spam app" |

---

## 5.9 Ngân sách đề xuất cho 6 tháng đầu (solo dev, tự làm art)

| Khoản | Số tiền |
|---|---|
| Setup (Play + domain + TTS/thu âm) | ~2–6 triệu VND |
| Hạ tầng + LLM Phase 0–1 (tháng 1–3, <1k user) | ~1tr/tháng × 3 = 3 triệu |
| Hạ tầng + LLM Phase 2 (tháng 4–6, 2–5k user) | ~3–7tr/tháng ≈ 15 triệu |
| Dự phòng 20% | ~5 triệu |
| **Tổng 6 tháng** | **~25–30 triệu VND (~$1.000–1.200)** |

Toàn bộ rủi ro tài chính để đưa sản phẩm đến điểm biết-thắng-hay-thua: **dưới 30 triệu đồng**. Con số này đủ nhỏ để tự đầu tư, không cần gọi vốn — và nếu Phase 1 gate fail thì tổng thiệt hại chỉ ~10 triệu.
