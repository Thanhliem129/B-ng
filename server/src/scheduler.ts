import type { Db } from './db.ts';
import type { Engine } from './engine.ts';
import { iso, now } from './time.ts';

/**
 * Hai vòng lặp:
 *  - jobs poll (3s): chạy các job đến hạn (reply delay ngắn nhất là 5s nên 3s là đủ mịn)
 *  - brain tick (60s): rollover ngày → lên kế hoạch tin cho từng user
 */
export class Scheduler {
  private jobTimer: NodeJS.Timeout | null = null;
  private brainTimer: NodeJS.Timeout | null = null;
  private processing = false;

  private db: Db;
  private engine: Engine;

  constructor(db: Db, engine: Engine) {
    this.db = db;
    this.engine = engine;
  }

  start(): void {
    this.brainTick();
    this.jobTimer = setInterval(() => void this.processJobs(), 3_000);
    this.brainTimer = setInterval(() => this.brainTick(), 60_000);
  }

  stop(): void {
    if (this.jobTimer) clearInterval(this.jobTimer);
    if (this.brainTimer) clearInterval(this.brainTimer);
  }

  brainTick(): void {
    for (const user of this.db.allUsers()) {
      try {
        this.engine.rolloverIfNeeded(user);
      } catch (e) {
        console.error(`brain tick lỗi cho user ${user.device_id}:`, e);
      }
    }
  }

  async processJobs(): Promise<void> {
    if (this.processing) return; // tránh chạy chồng khi FCM chậm
    this.processing = true;
    try {
      const due = this.db.dueJobs(iso(now()));
      for (const job of due) {
        try {
          await this.engine.processJob(job);
        } catch (e) {
          console.error(`job ${job.id} (${job.kind}) lỗi:`, e);
          this.db.finishJob(job.id); // không retry vô hạn ở Phase 0
        }
      }
    } finally {
      this.processing = false;
    }
  }
}
