import crypto from 'node:crypto';
import fs from 'node:fs';
import type { OutgoingMessage, User } from './types.ts';
import { fmtVN } from './time.ts';

export interface Transport {
  name: string;
  /** Gửi 1 tin (nhiều bong bóng). Transport tự lo việc giãn cách bong bóng. */
  send(user: User, msg: OutgoingMessage, bubbleDelay: { min: number; max: number }): Promise<void>;
}

/** Dev transport: in ra console thay vì đẩy FCM. */
export class ConsoleTransport implements Transport {
  name = 'console';

  async send(user: User, msg: OutgoingMessage): Promise<void> {
    const time = fmtVN(new Date());
    for (const [i, b] of msg.bubbles.entries()) {
      const text = b === '' ? '(tin nhắn trống)' : b;
      const suffix = i === msg.bubbles.length - 1 && msg.actions.length ? `  [${msg.actions.join('] [')}]` : '';
      console.log(`  ${time} 💬 ${user.pet_name} → ${user.device_id} (${msg.mtype}): ${text}${suffix}`);
    }
    if (msg.away) console.log(`  ${time} 🚪 ${user.pet_name} đi vắng${msg.roomNote ? ` — note: "${msg.roomNote}"` : ''}`);
  }
}

interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
}

/**
 * FCM HTTP v1 không qua firebase-admin: tự ký JWT RS256 bằng node:crypto,
 * đổi lấy access token OAuth2, POST lên fcm.googleapis.com.
 */
export class FcmTransport implements Transport {
  name = 'fcm';
  private sa: ServiceAccount;
  private accessToken = '';
  private tokenExpiry = 0;

  constructor(serviceAccountPath: string) {
    this.sa = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
  }

  private async getAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiry - 60_000) return this.accessToken;
    const nowSec = Math.floor(Date.now() / 1000);
    const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
    const claims = Buffer.from(
      JSON.stringify({
        iss: this.sa.client_email,
        scope: 'https://www.googleapis.com/auth/firebase.messaging',
        aud: 'https://oauth2.googleapis.com/token',
        iat: nowSec,
        exp: nowSec + 3600,
      }),
    ).toString('base64url');
    const signer = crypto.createSign('RSA-SHA256');
    signer.update(`${header}.${claims}`);
    const signature = signer.sign(this.sa.private_key).toString('base64url');
    const jwt = `${header}.${claims}.${signature}`;

    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: `grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${jwt}`,
    });
    if (!res.ok) throw new Error(`OAuth token failed: ${res.status} ${await res.text()}`);
    const json = (await res.json()) as { access_token: string; expires_in: number };
    this.accessToken = json.access_token;
    this.tokenExpiry = Date.now() + json.expires_in * 1000;
    return this.accessToken;
  }

  async send(user: User, msg: OutgoingMessage, bubbleDelay: { min: number; max: number }): Promise<void> {
    if (!user.fcm_token) {
      console.warn(`  ⚠️ user ${user.device_id} chưa có fcm_token, bỏ qua`);
      return;
    }
    // Mỗi bong bóng = 1 data message, giãn cách tự nhiên phía server
    for (const [i, bubble] of msg.bubbles.entries()) {
      if (i > 0) {
        const delayMs = (bubbleDelay.min + Math.random() * (bubbleDelay.max - bubbleDelay.min)) * 1000;
        await new Promise((r) => setTimeout(r, delayMs));
      }
      await this.sendOne(user, msg, bubble, i);
    }
  }

  private async sendOne(user: User, msg: OutgoingMessage, bubble: string, idx: number): Promise<void> {
    const isLast = idx === msg.bubbles.length - 1;
    const token = await this.getAccessToken();
    const body = {
      message: {
        token: user.fcm_token,
        android: { priority: 'HIGH' },
        data: {
          kind: 'pet_message',
          msg_id: msg.msgId,
          bubble_idx: String(idx),
          bubble_count: String(msg.bubbles.length),
          text: bubble,
          mtype: msg.mtype,
          mood: msg.mood,
          actions: isLast ? msg.actions.join(',') : '',
          away: msg.away ? '1' : '0',
          room_note: msg.roomNote ?? '',
          pet_name: user.pet_name,
        },
      },
    };
    const res = await fetch(`https://fcm.googleapis.com/v1/projects/${this.sa.project_id}/messages:send`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      // Token chết (user gỡ app) → xóa để khỏi bắn tiếp; các lỗi khác chỉ log
      if (res.status === 404 || text.includes('UNREGISTERED')) {
        console.warn(`  ⚠️ FCM token chết cho ${user.device_id}`);
      } else {
        console.error(`  ❌ FCM lỗi ${res.status}: ${text.slice(0, 300)}`);
      }
    }
  }
}

export function createTransport(serviceAccountPath: string): Transport {
  if (serviceAccountPath && fs.existsSync(serviceAccountPath)) {
    console.log(`🚀 FCM transport (service account: ${serviceAccountPath})`);
    return new FcmTransport(serviceAccountPath);
  }
  console.log('🖥️ Console transport (chưa cấu hình FCM_SERVICE_ACCOUNT — tin nhắn in ra console)');
  return new ConsoleTransport();
}
