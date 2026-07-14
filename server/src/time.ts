import { config } from './config.ts';
import type { ContentConfig } from './types.ts';

const MS_PER_MIN = 60_000;

export function now(): Date {
  return new Date();
}

/** Số phút trong ngày theo giờ VN (0..1439). */
export function minutesOfDayVN(d: Date = now()): number {
  const shifted = new Date(d.getTime() + config.utcOffsetHours * 3600_000);
  return shifted.getUTCHours() * 60 + shifted.getUTCMinutes();
}

/** yyyy-mm-dd theo giờ VN. */
export function dayVN(d: Date = now()): string {
  const shifted = new Date(d.getTime() + config.utcOffsetHours * 3600_000);
  return shifted.toISOString().slice(0, 10);
}

export function parseHM(hm: string): number {
  const [h, m] = hm.split(':').map(Number);
  return h * 60 + m;
}

/** Quiet hours có thể vắt qua nửa đêm (22:30 → 07:00). */
export function inQuietHours(cfg: ContentConfig, d: Date = now()): boolean {
  const m = minutesOfDayVN(d);
  const start = parseHM(cfg.quiet_hours.start);
  const end = parseHM(cfg.quiet_hours.end);
  return start > end ? m >= start || m < end : m >= start && m < end;
}

/** Tên window hiện tại (morning/noon/...) hoặc null nếu ngoài mọi window. */
export function currentWindow(cfg: ContentConfig, d: Date = now()): string | null {
  const m = minutesOfDayVN(d);
  for (const [name, w] of Object.entries(cfg.time_windows)) {
    if (m >= parseHM(w.start) && m < parseHM(w.end)) return name;
  }
  return null;
}

/** Date hôm nay (giờ VN) tại phút thứ `minutes`. Có thể đã ở quá khứ. */
export function todayAtVN(minutes: number, ref: Date = now()): Date {
  const dayStart = new Date(ref.getTime() + config.utcOffsetHours * 3600_000);
  dayStart.setUTCHours(0, 0, 0, 0);
  return new Date(dayStart.getTime() - config.utcOffsetHours * 3600_000 + minutes * MS_PER_MIN);
}

export function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** Thời điểm ngẫu nhiên trong window (hôm nay, giờ VN). */
export function randomTimeInWindow(cfg: ContentConfig, windowName: string, ref: Date = now()): Date {
  let startM: number;
  let endM: number;
  if (windowName === 'any') {
    // "any": ban ngày, tránh quiet hours
    startM = parseHM(cfg.quiet_hours.end) + 60; // 08:00
    endM = parseHM(cfg.quiet_hours.start) - 60; // 21:30
  } else {
    const w = cfg.time_windows[windowName];
    startM = parseHM(w.start);
    endM = parseHM(w.end);
  }
  return todayAtVN(randInt(startM, endM - 1), ref);
}

export function addMinutes(d: Date, mins: number): Date {
  return new Date(d.getTime() + mins * MS_PER_MIN);
}

export function iso(d: Date): string {
  return d.toISOString();
}

/** HH:MM giờ VN để log cho dễ đọc. */
export function fmtVN(d: Date): string {
  const shifted = new Date(d.getTime() + config.utcOffsetHours * 3600_000);
  return shifted.toISOString().slice(11, 16);
}
