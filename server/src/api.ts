import http from 'node:http';
import type { Db } from './db.ts';
import type { Engine } from './engine.ts';
import type { Scheduler } from './scheduler.ts';
import { config } from './config.ts';

type Handler = (body: Record<string, unknown>, url: URL) => Promise<object> | object;

class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function createApi(db: Db, engine: Engine, scheduler: Scheduler): http.Server {
  const routes: Record<string, Handler> = {
    'GET /api/health': () => ({ ok: true, time: new Date().toISOString() }),

    /** Đăng ký / cập nhật device. Gọi lại khi FCM token đổi (onNewToken). */
    'POST /api/register': (body) => {
      const deviceId = str(body.device_id);
      const petName = (str(body.pet_name, false) || 'Bông').slice(0, 30);
      const pronoun = (str(body.pronoun, false) || 'bà').slice(0, 10);
      const fcmToken = str(body.fcm_token, false) || null;
      const existing = db.getUserByDevice(deviceId);
      const user = db.upsertUser(deviceId, fcmToken, petName, pronoun);
      if (!existing) {
        engine.rolloverIfNeeded(user); // lên kế hoạch phần còn lại của hôm nay
        engine.scheduleWelcome(user);  // tin đầu tiên sau 15–30 phút
      }
      return { ok: true, user_id: user.id, is_new: !existing };
    },

    /** User rep từ RemoteInput. client_msg_id chống gửi trùng khi retry. */
    'POST /api/reply': (body) => {
      const user = requireUser(db, body);
      const text = str(body.text).slice(0, 500);
      const clientMsgId = str(body.client_msg_id, false);
      if (clientMsgId && db.seenClientMsg(user.id, clientMsgId)) return { ok: true, deduped: true };
      const { ruleId } = engine.onReply(user, text);
      return { ok: true, rule: ruleId };
    },

    /** Sự kiện notification: dismissed (swipe) / action (nút nhanh). */
    'POST /api/event': async (body) => {
      const user = requireUser(db, body);
      const event = str(body.event);
      const msgId = str(body.msg_id, false);
      if (event === 'dismissed') engine.onDismissed(user, msgId);
      else if (event === 'action') await engine.onAction(user, msgId, str(body.action, false));
      return { ok: true };
    },
  };

  if (config.debug) {
    Object.assign(routes, {
      'GET /api/debug/users': () => ({
        users: db.allUsers().map((u) => ({ ...u, state: db.getState(u.id) })),
      }),
      'GET /api/debug/messages': (_b: Record<string, unknown>, url: URL) => {
        const user = db.getUserByDevice(url.searchParams.get('device_id') ?? '');
        if (!user) throw new HttpError(404, 'unknown device');
        return { messages: db.recentMessages(user.id, 50) };
      },
      'GET /api/debug/jobs': (_b: Record<string, unknown>, url: URL) => {
        const user = db.getUserByDevice(url.searchParams.get('device_id') ?? '');
        if (!user) throw new HttpError(404, 'unknown device');
        return { jobs: db.pendingJobs(user.id) };
      },
      /** Cho job chạy ngay không cần chờ tới giờ (test). */
      'POST /api/debug/fire': async (body: Record<string, unknown>) => {
        const jobId = Number(body.job_id);
        const job = db.pendingJobs(requireUser(db, body).id).find((j) => j.id === jobId);
        if (!job) throw new HttpError(404, 'job không tồn tại hoặc đã chạy');
        await engine.processJob(job);
        return { ok: true };
      },
      /** Ép lên kế hoạch lại ngày hôm nay (xóa day → rollover). */
      'POST /api/debug/replan': (body: Record<string, unknown>) => {
        const user = requireUser(db, body);
        db.setState(user.id, { day: '' });
        engine.rolloverIfNeeded(user);
        return { ok: true, jobs: db.pendingJobs(user.id) };
      },
      'POST /api/debug/tick': async () => {
        scheduler.brainTick();
        await scheduler.processJobs();
        return { ok: true };
      },
      /** Gửi ngay 1 tin theo type (bỏ qua lịch/quota) — để nghe thử content. */
      'POST /api/debug/send': async (body: Record<string, unknown>) => {
        const user = requireUser(db, body);
        await engine.debugSendTemplate(user, str(body.type), str(body.window, false) || null);
        return { ok: true };
      },
      /** Chạy ngay 1 arc từ đầu (bỏ qua roll chance) — delay giữa các step vẫn thật. */
      'POST /api/debug/arc': async (body: Record<string, unknown>) => {
        const user = requireUser(db, body);
        await engine.debugStartArc(user, str(body.arc_id));
        return { ok: true };
      },
    });
  }

  return http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
    const key = `${req.method} ${url.pathname}`;
    const handler = routes[key];
    res.setHeader('content-type', 'application/json; charset=utf-8');
    if (!handler) {
      res.writeHead(404).end(JSON.stringify({ error: 'not found' }));
      return;
    }
    try {
      const body = req.method === 'POST' ? await readJson(req) : {};
      const result = await handler(body, url);
      res.writeHead(200).end(JSON.stringify(result));
    } catch (e) {
      if (e instanceof HttpError) {
        res.writeHead(e.status).end(JSON.stringify({ error: e.message }));
      } else {
        console.error(`${key} lỗi:`, e);
        res.writeHead(500).end(JSON.stringify({ error: 'internal' }));
      }
    }
  });
}

function str(v: unknown, required = true): string {
  if (typeof v === 'string' && v.trim()) return v.trim();
  if (required) throw new HttpError(400, 'thiếu tham số bắt buộc');
  return '';
}

function requireUser(db: Db, body: Record<string, unknown>) {
  const user = db.getUserByDevice(str(body.device_id));
  if (!user) throw new HttpError(404, 'device chưa đăng ký');
  return user;
}

function readJson(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.setEncoding('utf8');
    req.on('data', (c) => {
      data += c;
      if (data.length > 64_000) reject(new HttpError(413, 'body quá lớn'));
    });
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        reject(new HttpError(400, 'JSON không hợp lệ'));
      }
    });
    req.on('error', reject);
  });
}
