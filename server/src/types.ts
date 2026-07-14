// Kiểu dữ liệu cho content JSON (hợp đồng dữ liệu — xem content/README.md)

export interface TimeWindow {
  start: string; // "HH:MM"
  end: string;
}

export interface ContentConfig {
  version: number;
  quiet_hours: { start: string; end: string };
  daily_message_cap: number;
  min_gap_minutes: number;
  bubble_delay_seconds: { min: number; max: number };
  reply_delay_seconds: { min: number; max: number };
  time_windows: Record<string, TimeWindow>;
  scenario_daily_max: number;
  template_cooldown_days: number;
}

export interface MessageTemplate {
  id: string;
  type: string; // MORNING | HUNGRY | WANT_PLAY | POOP | NIGHT | STORY | SULK | RARE_EVENT
  window: string; // tên window hoặc "any"
  weight: number;
  messages: string[];
  actions?: string[];
  trigger?: string; // SULK: seen_1 | seen_2 | seen_3
  cooldown_days?: number; // RARE_EVENT: cooldown riêng
  followup_minutes?: number;
  followup?: string[];
}

export interface Neighbor {
  id: string;
  pet: string;
  species: string;
  owner: string | null;
  personality: string;
  relationship: string;
}

export interface Cast {
  version: number;
  neighbors: Neighbor[];
  rivals: { id: string; name: string; role: string }[];
}

export interface ArcStep {
  delay_minutes: [number, number];
  messages?: string[];
  away_status?: boolean;
  room_note?: string;
  use_gossip_pool?: boolean;
}

export interface Arc {
  id: string;
  title: string;
  trigger: { window: string; chance: number };
  cast_pick?: string; // "neighbor"
  steps: ArcStep[];
  gossip_pool?: Record<string, string[][]>;
}

export interface ReplyRule {
  id: string;
  priority: number;
  keywords: string[];
  mode?: string; // "serious"
  responses: string[][]; // mỗi phần tử = 1 bộ bong bóng
  note?: string;
}

export interface Content {
  config: ContentConfig;
  cast: Cast;
  templates: MessageTemplate[];
  arcs: Arc[];
  replyRules: ReplyRule[]; // đã sort theo priority tăng dần, default cuối
}

// Runtime

export interface User {
  id: number;
  device_id: string;
  fcm_token: string | null;
  pet_name: string;
  pronoun: string;
  created_at: string;
}

export interface UserState {
  user_id: number;
  day: string; // yyyy-mm-dd theo giờ VN — đổi ngày thì reset quota + lên kế hoạch mới
  sent_today: number;
  last_proactive_at: string | null;
  seen_streak: number;
  away_until: string | null;
  away_note: string | null;
}

/** Một tin pet gửi đi: nhiều bong bóng, kèm metadata cho client render notification. */
export interface OutgoingMessage {
  msgId: string;
  mtype: string;
  bubbles: string[];
  actions: string[];
  mood: string; // happy | hungry | sulky | sleepy — client chọn avatar
  away: boolean;
  roomNote: string | null;
}

export type JobKind =
  | 'send_template' // payload: { type, window }
  | 'arc_start'     // payload: { arc_id }
  | 'arc_step'      // payload: { arc_run_id }
  | 'sulk'          // payload: { trigger }
  | 'sulk_followup' // payload: { template_id }
  | 'reply_send'    // payload: { bubbles, mtype }
  | 'welcome';      // payload: {}

export interface Job {
  id: number;
  user_id: number;
  due_at: string;
  kind: JobKind;
  payload: string; // JSON
  done: number;
}
