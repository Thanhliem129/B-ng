import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import type { Job, JobKind, User, UserState } from './types.ts';

export class Db {
  private db: DatabaseSync;

  constructor(dbPath: string) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new DatabaseSync(dbPath);
    this.db.exec('PRAGMA journal_mode = WAL');
    this.migrate();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        device_id TEXT NOT NULL UNIQUE,
        fcm_token TEXT,
        pet_name TEXT NOT NULL,
        pronoun TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS user_state (
        user_id INTEGER PRIMARY KEY REFERENCES users(id),
        day TEXT NOT NULL DEFAULT '',
        sent_today INTEGER NOT NULL DEFAULT 0,
        last_proactive_at TEXT,
        seen_streak INTEGER NOT NULL DEFAULT 0,
        away_until TEXT,
        away_note TEXT
      );
      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        msg_id TEXT,
        direction TEXT NOT NULL,          -- out | in
        mtype TEXT NOT NULL,              -- MORNING/.../REPLY/USER
        source TEXT,                      -- template_id / arc:step / rule id
        content TEXT NOT NULL,            -- JSON bubbles hoặc text user
        created_at TEXT NOT NULL,
        delivered INTEGER NOT NULL DEFAULT 0,
        dismissed INTEGER NOT NULL DEFAULT 0,
        replied INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_messages_user ON messages(user_id, created_at);
      CREATE TABLE IF NOT EXISTS template_history (
        user_id INTEGER NOT NULL,
        template_id TEXT NOT NULL,
        sent_day TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_tpl_hist ON template_history(user_id, template_id);
      CREATE TABLE IF NOT EXISTS jobs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        due_at TEXT NOT NULL,
        kind TEXT NOT NULL,
        payload TEXT NOT NULL DEFAULT '{}',
        done INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_jobs_due ON jobs(done, due_at);
      CREATE TABLE IF NOT EXISTS arc_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        arc_id TEXT NOT NULL,
        day TEXT NOT NULL,
        neighbor_id TEXT,
        step_idx INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'running' -- running | done
      );
      CREATE TABLE IF NOT EXISTS reply_dedupe (
        user_id INTEGER NOT NULL,
        client_msg_id TEXT NOT NULL,
        PRIMARY KEY (user_id, client_msg_id)
      );
    `);
  }

  // ---- users ----

  upsertUser(deviceId: string, fcmToken: string | null, petName: string, pronoun: string): User {
    const existing = this.getUserByDevice(deviceId);
    if (existing) {
      this.db
        .prepare('UPDATE users SET fcm_token = COALESCE(?, fcm_token), pet_name = ?, pronoun = ? WHERE id = ?')
        .run(fcmToken, petName, pronoun, existing.id);
      return this.getUserByDevice(deviceId)!;
    }
    this.db
      .prepare('INSERT INTO users (device_id, fcm_token, pet_name, pronoun, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(deviceId, fcmToken, petName, pronoun, new Date().toISOString());
    const user = this.getUserByDevice(deviceId)!;
    this.db.prepare('INSERT INTO user_state (user_id) VALUES (?)').run(user.id);
    return user;
  }

  getUserByDevice(deviceId: string): User | null {
    return (this.db.prepare('SELECT * FROM users WHERE device_id = ?').get(deviceId) as User | undefined) ?? null;
  }

  getUser(id: number): User | null {
    return (this.db.prepare('SELECT * FROM users WHERE id = ?').get(id) as User | undefined) ?? null;
  }

  allUsers(): User[] {
    return this.db.prepare('SELECT * FROM users').all() as unknown as User[];
  }

  updateFcmToken(userId: number, token: string): void {
    this.db.prepare('UPDATE users SET fcm_token = ? WHERE id = ?').run(token, userId);
  }

  // ---- state ----

  getState(userId: number): UserState {
    return this.db.prepare('SELECT * FROM user_state WHERE user_id = ?').get(userId) as unknown as UserState;
  }

  setState(userId: number, patch: Partial<UserState>): void {
    const cols = Object.keys(patch);
    if (!cols.length) return;
    const sql = `UPDATE user_state SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE user_id = ?`;
    this.db.prepare(sql).run(...cols.map((c) => (patch as Record<string, unknown>)[c] as never), userId);
  }

  // ---- messages ----

  logOutgoing(userId: number, msgId: string, mtype: string, source: string, bubbles: string[]): void {
    this.db
      .prepare(
        'INSERT INTO messages (user_id, msg_id, direction, mtype, source, content, created_at, delivered) VALUES (?, ?, ?, ?, ?, ?, ?, 1)',
      )
      .run(userId, msgId, 'out', mtype, source, JSON.stringify(bubbles), new Date().toISOString());
  }

  logIncoming(userId: number, text: string): void {
    this.db
      .prepare("INSERT INTO messages (user_id, direction, mtype, content, created_at) VALUES (?, 'in', 'USER', ?, ?)")
      .run(userId, text, new Date().toISOString());
  }

  markDismissed(userId: number, msgId: string): void {
    this.db.prepare('UPDATE messages SET dismissed = 1 WHERE user_id = ? AND msg_id = ?').run(userId, msgId);
  }

  markLastOutReplied(userId: number): void {
    this.db
      .prepare(
        "UPDATE messages SET replied = 1 WHERE id = (SELECT id FROM messages WHERE user_id = ? AND direction = 'out' ORDER BY id DESC LIMIT 1)",
      )
      .run(userId);
  }

  recentMessages(userId: number, limit = 30): unknown[] {
    return this.db
      .prepare('SELECT * FROM messages WHERE user_id = ? ORDER BY id DESC LIMIT ?')
      .all(userId, limit);
  }

  // ---- template history (cooldown) ----

  templateUsedRecently(userId: number, templateId: string, sinceDay: string): boolean {
    const row = this.db
      .prepare('SELECT 1 FROM template_history WHERE user_id = ? AND template_id = ? AND sent_day >= ? LIMIT 1')
      .get(userId, templateId, sinceDay);
    return !!row;
  }

  recordTemplateUse(userId: number, templateId: string, day: string): void {
    this.db.prepare('INSERT INTO template_history (user_id, template_id, sent_day) VALUES (?, ?, ?)').run(userId, templateId, day);
  }

  // ---- jobs ----

  addJob(userId: number, dueAt: string, kind: JobKind, payload: object): number {
    this.db
      .prepare('INSERT INTO jobs (user_id, due_at, kind, payload) VALUES (?, ?, ?, ?)')
      .run(userId, dueAt, kind, JSON.stringify(payload));
    return Number(this.db.prepare('SELECT last_insert_rowid() AS id').get()!.id);
  }

  dueJobs(nowIso: string, limit = 50): Job[] {
    return this.db
      .prepare('SELECT * FROM jobs WHERE done = 0 AND due_at <= ? ORDER BY due_at LIMIT ?')
      .all(nowIso, limit) as unknown as Job[];
  }

  finishJob(id: number): void {
    this.db.prepare('UPDATE jobs SET done = 1 WHERE id = ?').run(id);
  }

  postponeJob(id: number, dueAt: string): void {
    this.db.prepare('UPDATE jobs SET due_at = ? WHERE id = ?').run(dueAt, id);
  }

  /** Hủy các job chưa chạy theo kind (vd: hủy sulk khi user rep). */
  cancelJobs(userId: number, kinds: JobKind[]): void {
    const ph = kinds.map(() => '?').join(',');
    this.db.prepare(`UPDATE jobs SET done = 1 WHERE user_id = ? AND done = 0 AND kind IN (${ph})`).run(userId, ...kinds);
  }

  pendingJobs(userId: number): Job[] {
    return this.db
      .prepare('SELECT * FROM jobs WHERE user_id = ? AND done = 0 ORDER BY due_at')
      .all(userId) as unknown as Job[];
  }

  countPendingJobs(userId: number, kind: JobKind): number {
    return Number(
      this.db.prepare('SELECT COUNT(*) AS n FROM jobs WHERE user_id = ? AND done = 0 AND kind = ?').get(userId, kind)!.n,
    );
  }

  // ---- arcs ----

  createArcRun(userId: number, arcId: string, day: string, neighborId: string | null): number {
    this.db
      .prepare('INSERT INTO arc_runs (user_id, arc_id, day, neighbor_id) VALUES (?, ?, ?, ?)')
      .run(userId, arcId, day, neighborId);
    return Number(this.db.prepare('SELECT last_insert_rowid() AS id').get()!.id);
  }

  getArcRun(id: number): { id: number; user_id: number; arc_id: string; day: string; neighbor_id: string | null; step_idx: number; status: string } | null {
    return (this.db.prepare('SELECT * FROM arc_runs WHERE id = ?').get(id) as never) ?? null;
  }

  updateArcRun(id: number, stepIdx: number, status: string): void {
    this.db.prepare('UPDATE arc_runs SET step_idx = ?, status = ? WHERE id = ?').run(stepIdx, status, id);
  }

  // ---- reply dedupe ----

  /** true nếu client_msg_id này đã xử lý rồi. */
  seenClientMsg(userId: number, clientMsgId: string): boolean {
    try {
      this.db.prepare('INSERT INTO reply_dedupe (user_id, client_msg_id) VALUES (?, ?)').run(userId, clientMsgId);
      return false;
    } catch {
      return true;
    }
  }

  raw(): DatabaseSync {
    return this.db;
  }
}
