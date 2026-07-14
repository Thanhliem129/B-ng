# Bông Server — Phase 0

Não của pet nằm hoàn toàn ở đây: đọc `content/` (5 file JSON), quyết định nhắn gì khi nào,
đẩy xuống client qua FCM. **Zero-LLM, zero npm dependency** — chỉ cần Node ≥ 24.

## Chạy

```bash
cd server
node src/index.ts        # hoặc: npm start / npm run dev (watch mode)
```

Không cấu hình gì thêm → chạy ở **console transport**: tin nhắn in ra console thay vì
đẩy FCM. Đủ để dev/test toàn bộ engine mà chưa cần Firebase.

### Biến môi trường

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `PORT` | `8787` | Cổng API |
| `CONTENT_DIR` | `../content` | Thư mục 5 file JSON content |
| `DB_PATH` | `server/data/bong.db` | SQLite (tự tạo) |
| `FCM_SERVICE_ACCOUNT` | *(trống)* | Đường dẫn service account JSON → bật FCM thật |
| `NODE_ENV` | `development` | `production` tắt endpoint `/api/debug/*` |

### Bật FCM thật

1. Tạo Firebase project → Project settings → Service accounts → **Generate new private key**.
2. Lưu file JSON đó (vd `server/service-account.json` — đã nằm trong .gitignore).
3. Chạy: `FCM_SERVICE_ACCOUNT=./service-account.json node src/index.ts`

Server tự ký JWT gọi FCM HTTP v1 — không cần cài firebase-admin.

## API

| Endpoint | Body | Vai trò |
|---|---|---|
| `POST /api/register` | `{device_id, pet_name, pronoun, fcm_token?}` | Đăng ký device; user mới được lên kế hoạch ngày + tin chào sau 15–30 phút. Gọi lại khi token đổi |
| `POST /api/reply` | `{device_id, text, client_msg_id}` | User rep → rule engine `replies.json` → trả lời sau 5–40s |
| `POST /api/event` | `{device_id, msg_id, event: dismissed\|action, action?}` | Swipe-dismiss (tính dỗi) / nút nhanh (feed) |
| `GET /api/health` | — | Health check |

### Debug (chỉ dev)

| Endpoint | Vai trò |
|---|---|
| `GET /api/debug/users` | Toàn bộ user + state |
| `GET /api/debug/messages?device_id=` | 50 tin gần nhất |
| `GET /api/debug/jobs?device_id=` | Job đang chờ (lịch nhắn) |
| `POST /api/debug/send` `{device_id, type}` | Bắn ngay 1 tin theo type (nghe thử content) |
| `POST /api/debug/arc` `{device_id, arc_id}` | Chạy ngay 1 arc từ đầu |
| `POST /api/debug/replan` `{device_id}` | Lên kế hoạch lại hôm nay |
| `POST /api/debug/tick` | Ép brain tick + chạy job đến hạn |

## Cách hoạt động (tóm tắt)

- **Brain tick (60s):** mỗi user, nếu sang ngày mới (giờ VN) → reset quota, lên kế hoạch:
  mỗi window 1 suất tin (giờ ngẫu nhiên trong window), roll xác suất arc (tối đa 2/ngày),
  15% có RARE_EVENT.
- **Job poll (3s):** chạy job đến hạn. Tin chủ động tôn trọng: quiet hours 22:30–07:00,
  cap 6 tin/ngày, giãn cách ≥ 45 phút, pet "đi vắng" thì hoãn.
- **Dỗi:** dismiss 1/2/3 tin liên tiếp → sulk seen_1/2/3 sau 10–25 phút. Rep hoặc bấm nút → hết dỗi.
- **Reply:** normalize bỏ dấu → match keyword theo priority (safety_serious luôn trước) → default nếu không khớp.
- Mỗi bong bóng = 1 FCM data message, giãn 2–5s. Mọi tin log vào bảng `messages`
  (delivered/dismissed/replied) — đây là số liệu tune content.
