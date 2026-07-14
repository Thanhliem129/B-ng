/** normalize theo hợp đồng replies.json: lowercase + bỏ dấu tiếng Việt. */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd'); // đ -> d
}

export interface SlotContext {
  pronoun: string;
  pet_name: string;
  neighbor?: { pet: string; owner: string | null };
}

/** Điền slot {pronoun}, {pet_name}, {n.pet}, {n.owner} vào một câu. */
export function fillSlots(text: string, ctx: SlotContext): string {
  return text
    .replaceAll('{pronoun}', ctx.pronoun)
    .replaceAll('{pet_name}', ctx.pet_name)
    .replaceAll('{n.pet}', ctx.neighbor?.pet ?? '')
    .replaceAll('{n.owner}', ctx.neighbor?.owner ?? '');
}

export function fillSlotsAll(texts: string[], ctx: SlotContext): string[] {
  return texts.map((t) => fillSlots(t, ctx));
}

export function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** Chọn ngẫu nhiên theo trọng số. */
export function weightedPick<T extends { weight: number }>(items: T[]): T {
  const total = items.reduce((s, i) => s + i.weight, 0);
  let r = Math.random() * total;
  for (const i of items) {
    r -= i.weight;
    if (r <= 0) return i;
  }
  return items[items.length - 1];
}
