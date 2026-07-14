import type { Db } from './db.ts';
import type { Transport } from './push.ts';
import type { Arc, Content, Job, MessageTemplate, OutgoingMessage, User, UserState } from './types.ts';
import { fillSlotsAll, normalize, pick, weightedPick, type SlotContext } from './textutil.ts';
import {
  addMinutes, currentWindow, dayVN, inQuietHours, iso, now, parseHM, randInt,
  randomTimeInWindow, todayAtVN,
} from './time.ts';
import { config } from './config.ts';

/** Mood cho avatar client, suy từ loại tin. */
function moodOf(mtype: string): string {
  if (mtype === 'HUNGRY') return 'hungry';
  if (mtype === 'SULK') return 'sulky';
  if (mtype === 'NIGHT') return 'sleepy';
  return 'happy';
}

let msgCounter = 0;
function newMsgId(): string {
  return `m_${Date.now().toString(36)}_${(msgCounter++).toString(36)}`;
}

export class Engine {
  private db: Db;
  private content: Content;
  private transport: Transport;

  constructor(db: Db, content: Content, transport: Transport) {
    this.db = db;
    this.content = content;
    this.transport = transport;
  }

  // ================= Gửi tin =================

  private slotCtx(user: User, neighborId?: string | null): SlotContext {
    const neighbor = neighborId ? this.content.cast.neighbors.find((n) => n.id === neighborId) : undefined;
    return { pronoun: user.pronoun, pet_name: user.pet_name, neighbor };
  }

  private async deliver(
    user: User,
    mtype: string,
    source: string,
    bubbles: string[],
    opts: { actions?: string[]; away?: boolean; roomNote?: string | null; countsTowardCap?: boolean } = {},
  ): Promise<void> {
    const msg: OutgoingMessage = {
      msgId: newMsgId(),
      mtype,
      bubbles,
      actions: opts.actions ?? [],
      mood: moodOf(mtype),
      away: opts.away ?? false,
      roomNote: opts.roomNote ?? null,
    };
    this.db.logOutgoing(user.id, msg.msgId, mtype, source, bubbles);
    if (opts.countsTowardCap !== false) {
      const st = this.db.getState(user.id);
      this.db.setState(user.id, { sent_today: st.sent_today + 1, last_proactive_at: iso(now()) });
    }
    await this.transport.send(user, msg, this.content.config.bubble_delay_seconds);
  }

  // ================= Kế hoạch ngày =================

  /**
   * Đổi ngày (theo giờ VN): reset quota, lên lịch tin chủ động + roll arc.
   * Gọi từ brain tick; với user mới chỉ lên lịch những mốc còn ở tương lai.
   */
  rolloverIfNeeded(user: User): void {
    const st = this.db.getState(user.id);
    const today = dayVN();
    if (st.day === today) return;
    this.db.setState(user.id, { day: today, sent_today: 0, away_until: null, away_note: null });
    this.planDay(user);
  }

  private planDay(user: User): void {
    const cfg = this.content.config;
    const nowD = now();

    // Tin thường theo window: mỗi window một "suất", giờ ngẫu nhiên trong window
    const plan: { window: string; type: string }[] = [
      { window: 'morning', type: 'MORNING' },
      { window: 'noon', type: 'HUNGRY' },
      { window: 'afternoon', type: Math.random() < 0.5 ? 'WANT_PLAY' : 'STORY' },
      { window: 'evening', type: Math.random() < 0.6 ? 'POOP' : 'STORY' },
      { window: 'night', type: 'NIGHT' },
    ];
    // RARE_EVENT: hiếm, giờ ngẫu nhiên ban ngày
    if (Math.random() < config.rareEventDailyChance) {
      plan.push({ window: 'any', type: 'RARE_EVENT' });
    }
    for (const p of plan) {
      const at = randomTimeInWindow(cfg, p.window, nowD);
      if (at.getTime() <= nowD.getTime()) continue; // mốc đã qua (user mới đăng ký giữa ngày / server restart)
      this.db.addJob(user.id, iso(at), 'send_template', { type: p.type, window: p.window });
    }

    // Arc: roll chance từng arc, tối đa scenario_daily_max
    const won = this.content.arcs.filter((a) => Math.random() < a.trigger.chance);
    // xáo trộn rồi lấy tối đa N
    won.sort(() => Math.random() - 0.5);
    for (const arc of won.slice(0, cfg.scenario_daily_max)) {
      const at = randomTimeInWindow(cfg, arc.trigger.window, nowD);
      if (at.getTime() <= nowD.getTime()) continue;
      this.db.addJob(user.id, iso(at), 'arc_start', { arc_id: arc.id });
    }
  }

  /** Tin chào sân sau khi đăng ký 15–30 phút (né quiet hours). */
  scheduleWelcome(user: User): void {
    const cfg = this.content.config;
    let at = addMinutes(now(), randInt(15, 30));
    if (inQuietHours(cfg, at)) {
      // dời sang sau giờ dậy + 10..40 phút
      const end = parseHM(cfg.quiet_hours.end);
      let target = todayAtVN(end + randInt(10, 40), at);
      if (target.getTime() <= at.getTime()) target = addMinutes(target, 24 * 60);
      at = target;
    }
    this.db.addJob(user.id, iso(at), 'welcome', {});
  }

  // ================= Chọn template =================

  private pickTemplate(user: User, type: string, window: string | null): MessageTemplate | null {
    const cfg = this.content.config;
    const today = dayVN();
    const candidates = this.content.templates.filter((t) => {
      if (t.type !== type) return false;
      if (window && t.window !== 'any' && t.window !== window) return false;
      const cooldown = t.cooldown_days ?? cfg.template_cooldown_days;
      const since = new Date(now().getTime() - cooldown * 86400_000);
      if (this.db.templateUsedRecently(user.id, t.id, dayVN(since))) return false;
      return true;
    });
    if (!candidates.length) return null;
    const chosen = weightedPick(candidates);
    this.db.recordTemplateUse(user.id, chosen.id, today);
    return chosen;
  }

  // ================= Xử lý job =================

  async processJob(job: Job): Promise<void> {
    const user = this.db.getUser(job.user_id);
    if (!user) {
      this.db.finishJob(job.id);
      return;
    }
    const payload = JSON.parse(job.payload) as Record<string, string>;
    const st = this.db.getState(user.id);
    const cfg = this.content.config;

    // Pet đang "đi vắng" → tin thường chờ pet về
    const awayBlocked = st.away_until && new Date(st.away_until).getTime() > now().getTime();
    const isProactive = job.kind === 'send_template' || job.kind === 'welcome';

    if (isProactive) {
      if (awayBlocked) {
        this.db.postponeJob(job.id, iso(addMinutes(new Date(st.away_until!), randInt(2, 10))));
        return;
      }
      if (inQuietHours(cfg)) {
        this.db.finishJob(job.id); // quá giờ — bỏ suất này, mai có suất mới
        return;
      }
      if (st.sent_today >= cfg.daily_message_cap) {
        this.db.finishJob(job.id);
        return;
      }
      // Giãn cách tin tối thiểu
      if (st.last_proactive_at) {
        const elapsedMin = (now().getTime() - new Date(st.last_proactive_at).getTime()) / 60_000;
        if (elapsedMin < cfg.min_gap_minutes) {
          this.db.postponeJob(job.id, iso(addMinutes(now(), Math.ceil(cfg.min_gap_minutes - elapsedMin) + randInt(0, 10))));
          return;
        }
      }
    }

    switch (job.kind) {
      case 'welcome':
        await this.fireWelcome(user);
        break;
      case 'send_template':
        await this.fireTemplate(user, payload.type, payload.window);
        break;
      case 'arc_start':
        await this.fireArcStart(user, payload.arc_id, st, awayBlocked === true, job);
        return; // fireArcStart tự quyết finish/postpone
      case 'arc_step':
        await this.fireArcStep(user, Number(payload.arc_run_id));
        break;
      case 'sulk':
        await this.fireSulk(user, payload.trigger);
        break;
      case 'sulk_followup': {
        const tpl = this.content.templates.find((t) => t.id === payload.template_id);
        if (tpl?.followup) {
          await this.deliver(user, 'SULK', `${tpl.id}:followup`, fillSlotsAll(tpl.followup, this.slotCtx(user)), {
            countsTowardCap: false,
          });
        }
        break;
      }
      case 'reply_send': {
        const bubbles = JSON.parse(payload.bubbles) as string[];
        await this.deliver(user, payload.mtype ?? 'REPLY', `reply:${payload.rule_id ?? ''}`, bubbles, {
          countsTowardCap: false,
        });
        break;
      }
    }
    this.db.finishJob(job.id);
  }

  private async fireWelcome(user: User): Promise<void> {
    const cfg = this.content.config;
    const win = currentWindow(cfg) ?? 'afternoon';
    const typeByWindow: Record<string, string> = {
      morning: 'MORNING', noon: 'HUNGRY', afternoon: 'STORY', evening: 'STORY', night: 'NIGHT',
    };
    await this.fireTemplate(user, typeByWindow[win] ?? 'STORY', win);
  }

  private async fireTemplate(user: User, type: string, window: string): Promise<void> {
    const tpl = this.pickTemplate(user, type, window);
    if (!tpl) return;
    await this.deliver(user, tpl.type, tpl.id, fillSlotsAll(tpl.messages, this.slotCtx(user)), {
      actions: tpl.actions ?? [],
    });
  }

  private async fireArcStart(user: User, arcId: string, st: UserState, awayBlocked: boolean, job: Job): Promise<void> {
    const arc = this.content.arcs.find((a) => a.id === arcId);
    if (!arc) {
      this.db.finishJob(job.id);
      return;
    }
    // Không chồng 2 arc / không chạy khi đang vắng hoặc quiet hours
    if (awayBlocked || inQuietHours(this.content.config)) {
      this.db.finishJob(job.id);
      return;
    }
    const neighborId = arc.cast_pick === 'neighbor' && arc.gossip_pool
      ? pick(Object.keys(arc.gossip_pool))
      : null;
    const runId = this.db.createArcRun(user.id, arc.id, dayVN(), neighborId);
    this.db.finishJob(job.id);
    await this.runArcStep(user, arc, runId, 0, neighborId);
  }

  private async fireArcStep(user: User, arcRunId: number): Promise<void> {
    const run = this.db.getArcRun(arcRunId);
    if (!run || run.status !== 'running') return;
    const arc = this.content.arcs.find((a) => a.id === run.arc_id);
    if (!arc) return;
    await this.runArcStep(user, arc, run.id, run.step_idx, run.neighbor_id);
  }

  private async runArcStep(user: User, arc: Arc, runId: number, stepIdx: number, neighborId: string | null): Promise<void> {
    const step = arc.steps[stepIdx];
    if (!step) {
      this.db.updateArcRun(runId, stepIdx, 'done');
      return;
    }
    const ctx = this.slotCtx(user, neighborId);

    // Nội dung bước này
    let bubbles: string[] = [];
    if (step.use_gossip_pool && arc.gossip_pool && neighborId) {
      bubbles = fillSlotsAll(pick(arc.gossip_pool[neighborId]), ctx);
    } else if (step.messages?.length) {
      bubbles = fillSlotsAll(step.messages, ctx);
    }

    // Trạng thái đi vắng: kéo dài tới bước kế tiếp
    const nextStep = arc.steps[stepIdx + 1];
    let awayUntil: string | null = null;
    if (step.away_status && nextStep) {
      const [dMin, dMax] = nextStep.delay_minutes;
      awayUntil = iso(addMinutes(now(), randInt(dMin, dMax)));
      this.db.setState(user.id, { away_until: awayUntil, away_note: step.room_note ?? null });
    } else if (!step.away_status) {
      this.db.setState(user.id, { away_until: null, away_note: null });
    }

    if (bubbles.length) {
      await this.deliver(user, 'ARC', `${arc.id}:${stepIdx}`, bubbles, {
        away: !!step.away_status,
        roomNote: step.room_note ?? null,
        countsTowardCap: stepIdx === 0, // bước đầu tính quota, các bước sau luôn được kể nốt
      });
    } else if (step.away_status) {
      // Bước im lặng (sneak_out_silent): chỉ đẩy trạng thái phòng trống
      await this.deliver(user, 'ARC_STATUS', `${arc.id}:${stepIdx}`, [], {
        away: true,
        roomNote: step.room_note ?? null,
        countsTowardCap: false,
      });
    }

    if (nextStep) {
      const dueAt = awayUntil ?? iso(addMinutes(now(), randInt(nextStep.delay_minutes[0], nextStep.delay_minutes[1])));
      this.db.updateArcRun(runId, stepIdx + 1, 'running');
      this.db.addJob(user.id, dueAt, 'arc_step', { arc_run_id: String(runId) });
    } else {
      this.db.updateArcRun(runId, stepIdx, 'done');
      this.db.setState(user.id, { away_until: null, away_note: null });
    }
  }

  private async fireSulk(user: User, trigger: string): Promise<void> {
    const cfg = this.content.config;
    if (inQuietHours(cfg)) return;
    const st = this.db.getState(user.id);
    // User đã rep từ lúc lên lịch → thôi không dỗi nữa
    if (st.seen_streak === 0) return;
    const candidates = this.content.templates.filter((t) => t.type === 'SULK' && t.trigger === trigger);
    if (!candidates.length) return;
    const tpl = weightedPick(candidates);
    await this.deliver(user, 'SULK', tpl.id, fillSlotsAll(tpl.messages, this.slotCtx(user)), {
      actions: tpl.actions ?? [],
      countsTowardCap: false,
    });
    if (tpl.followup?.length && tpl.followup_minutes) {
      this.db.addJob(user.id, iso(addMinutes(now(), tpl.followup_minutes)), 'sulk_followup', { template_id: tpl.id });
    }
  }

  // ================= Debug helpers =================

  async debugSendTemplate(user: User, type: string, window: string | null): Promise<void> {
    const tpl = this.pickTemplate(user, type, window);
    if (!tpl) throw new Error(`không còn template ${type} khả dụng (cooldown?)`);
    await this.deliver(user, tpl.type, tpl.id, fillSlotsAll(tpl.messages, this.slotCtx(user)), {
      actions: tpl.actions ?? [],
      countsTowardCap: false,
    });
  }

  async debugStartArc(user: User, arcId: string): Promise<void> {
    const arc = this.content.arcs.find((a) => a.id === arcId);
    if (!arc) throw new Error(`arc không tồn tại: ${arcId}`);
    const neighborId = arc.cast_pick === 'neighbor' && arc.gossip_pool ? pick(Object.keys(arc.gossip_pool)) : null;
    const runId = this.db.createArcRun(user.id, arc.id, dayVN(), neighborId);
    await this.runArcStep(user, arc, runId, 0, neighborId);
  }

  // ================= Sự kiện từ client =================

  /** User swipe-dismiss notification → "bị seen". */
  onDismissed(user: User, msgId: string): void {
    this.db.markDismissed(user.id, msgId);
    const st = this.db.getState(user.id);
    const streak = st.seen_streak + 1;
    this.db.setState(user.id, { seen_streak: streak });
    // Chỉ 1 sulk đang chờ tại một thời điểm
    if (this.db.countPendingJobs(user.id, 'sulk') > 0) return;
    const trigger = `seen_${Math.min(streak, 3)}`;
    const hasTemplate = this.content.templates.some((t) => t.type === 'SULK' && t.trigger === trigger);
    if (!hasTemplate) return;
    this.db.addJob(user.id, iso(addMinutes(now(), randInt(10, 25))), 'sulk', { trigger });
  }

  /** User bấm nút nhanh (feed / pat...). */
  async onAction(user: User, msgId: string, action: string): Promise<void> {
    this.db.setState(user.id, { seen_streak: 0 });
    this.db.cancelJobs(user.id, ['sulk']);
    this.db.markLastOutReplied(user.id);
    if (action === 'feed') {
      const rule = this.content.replyRules.find((r) => r.id === 'feed_promise');
      if (rule) {
        const bubbles = fillSlotsAll(pick(rule.responses), this.slotCtx(user));
        this.db.addJob(user.id, iso(new Date(now().getTime() + randInt(3, 10) * 1000)), 'reply_send', {
          bubbles: JSON.stringify(bubbles),
          mtype: 'REPLY',
          rule_id: 'feed_action',
        });
      }
    }
  }

  /** User rep text → rule engine của replies.json. */
  onReply(user: User, text: string): { ruleId: string } {
    this.db.logIncoming(user.id, text);
    this.db.markLastOutReplied(user.id);
    this.db.setState(user.id, { seen_streak: 0 });
    this.db.cancelJobs(user.id, ['sulk']);

    const norm = normalize(text);
    let matched = this.content.replyRules.find(
      (r) => r.keywords.length && r.keywords.some((k) => norm.includes(k)),
    );
    matched ??= this.content.replyRules.find((r) => r.id === 'default')!;

    const bubbles = fillSlotsAll(pick(matched.responses), this.slotCtx(user));
    const cfg = this.content.config;
    // safety: trả lời nhanh hơn hẳn — pet "ngồi sát bên" không để user chờ
    const delaySec = matched.mode === 'serious'
      ? randInt(3, 6)
      : randInt(cfg.reply_delay_seconds.min, cfg.reply_delay_seconds.max);
    this.db.addJob(user.id, iso(new Date(now().getTime() + delaySec * 1000)), 'reply_send', {
      bubbles: JSON.stringify(bubbles),
      mtype: 'REPLY',
      rule_id: matched.id,
    });
    return { ruleId: matched.id };
  }
}
