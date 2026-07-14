import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

export const config = {
  port: Number(process.env.PORT ?? 8787),
  // content/ nằm ở gốc repo, cạnh server/
  contentDir: process.env.CONTENT_DIR ?? path.resolve(here, '../../content'),
  dbPath: process.env.DB_PATH ?? path.resolve(here, '../data/bong.db'),
  // Đường dẫn service account JSON của Firebase. Không có → console transport (dev).
  fcmServiceAccount: process.env.FCM_SERVICE_ACCOUNT ?? '',
  // VN không có DST nên offset cứng là đủ cho Phase 0
  utcOffsetHours: Number(process.env.UTC_OFFSET_HOURS ?? 7),
  // Bật endpoint /api/debug/* (tắt khi production)
  debug: (process.env.NODE_ENV ?? 'development') !== 'production',
  // Xác suất RARE_EVENT mỗi ngày
  rareEventDailyChance: 0.15,
};
