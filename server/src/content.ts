import fs from 'node:fs';
import path from 'node:path';
import type { Arc, Cast, Content, ContentConfig, MessageTemplate, ReplyRule } from './types.ts';

function readJson<T>(dir: string, file: string): T {
  const p = path.join(dir, file);
  return JSON.parse(fs.readFileSync(p, 'utf8')) as T;
}

export function loadContent(dir: string): Content {
  const config = readJson<ContentConfig>(dir, 'config.json');
  const cast = readJson<Cast>(dir, 'cast.json');
  const templates = readJson<{ templates: MessageTemplate[] }>(dir, 'messages.json').templates;
  const arcs = readJson<{ arcs: Arc[] }>(dir, 'scenarios.json').arcs;
  const replyRules = readJson<{ rules: ReplyRule[] }>(dir, 'replies.json').rules
    .slice()
    .sort((a, b) => a.priority - b.priority);

  validate({ config, cast, templates, arcs, replyRules });
  return { config, cast, templates, arcs, replyRules };
}

function validate(c: Content): void {
  const ids = new Set<string>();
  for (const t of c.templates) {
    if (ids.has(t.id)) throw new Error(`Template id trùng: ${t.id}`);
    ids.add(t.id);
    if (t.window !== 'any' && !c.config.time_windows[t.window]) {
      throw new Error(`Template ${t.id} dùng window không tồn tại: ${t.window}`);
    }
  }
  const neighborIds = new Set(c.cast.neighbors.map((n) => n.id));
  for (const a of c.arcs) {
    if (a.cast_pick === 'neighbor' && a.gossip_pool) {
      for (const key of Object.keys(a.gossip_pool)) {
        if (!neighborIds.has(key)) throw new Error(`Arc ${a.id}: gossip_pool có neighbor lạ '${key}'`);
      }
    }
  }
  if (!c.replyRules.some((r) => r.id === 'default')) throw new Error('replies.json thiếu rule default');
  if (c.replyRules[0].id !== 'safety_serious') {
    throw new Error('Rule safety_serious phải có priority thấp nhất (check trước tiên)');
  }
}
