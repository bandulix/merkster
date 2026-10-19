/* Class groups: one student creates the class and owns its name, motto and cover.
   Any member can invite classmates and share a test. Sharing copies the cards, not the practice. */

export const CLASS_NAME_MAX = 40;
export const CLASS_MOTTO_MAX = 80;
export const CLASS_MEMBERS_MAX = 40;
export const CLASSES_PER_STUDENT = 8;
export const CLASS_INVITE_USES_DEFAULT = 30;
export const CLASS_INVITE_USES_MAX = 40;
export const CLASS_INVITE_DAYS_DEFAULT = 14;
export const CLASS_INVITE_DAYS_MAX = 30;
export const CLASS_OPEN_INVITES_MAX = 5;
export const CLASS_CARDS_MAX = 400;
export const CLASS_COVER_MAX_BYTES = 1_500_000;

/** Class boss: correct recalls on a taken share deal this much HP (capped per session). */
export const BOSS_HP_PER_CARD = 3;
export const BOSS_HP_MIN = 30;
export const BOSS_HP_MAX = 600;
export const BOSS_HIT_MAX = 40;
export const BOSS_DAYS_DEFAULT = 14;

/** 1v1 vocab clash */
export const CLASH_CARDS_DEFAULT = 8;
export const CLASH_CARDS_MIN = 3;
export const CLASH_CARDS_MAX = 15;
export const CLASH_EXPIRE_HOURS = 48;

/** strip control characters and markup, then cap the length */
export function cleanClassText(v: unknown, max: number): string {
  if (typeof v !== 'string') return '';
  return v.replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
}

export function boardOrder<T extends { xp: number; name: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => b.xp - a.xp || a.name.localeCompare(b.name, 'de'));
}

export function bossMaxHp(cardCount: number): number {
  const n = Math.max(0, Math.round(Number(cardCount) || 0));
  return Math.min(BOSS_HP_MAX, Math.max(BOSS_HP_MIN, n * BOSS_HP_PER_CARD));
}

/** Deterministic shuffle of card positions for a clash (same seed → same order). */
export function pickClashPositions(cardCount: number, want: number, seed: string): number[] {
  const n = Math.max(0, Math.floor(cardCount));
  const k = Math.min(Math.max(CLASH_CARDS_MIN, Math.floor(want) || CLASH_CARDS_DEFAULT), CLASH_CARDS_MAX, n);
  if (k <= 0 || n <= 0) return [];
  const idx = Array.from({ length: n }, (_, i) => i);
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  for (let i = idx.length - 1; i > 0; i--) {
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    const j = (h >>> 0) % (i + 1);
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return idx.slice(0, k);
}

/** Tolerant enough for a clash: case/umlaut/article-light match against alternatives. */
export function clashAnswerOk(expected: string, got: string): boolean {
  const clean = (s: string) => s.normalize('NFC').replace(/[’‘´`]/g, "'").replace(/[“”„«»"]/g, '')
    .replace(/\s+/g, ' ').trim().replace(/^[\s.,;:!?¡¿–—-]+/, '').replace(/[\s.,;:!?–—-]+$/, '').trim();
  const fold = (s: string) => s.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const arts = /^(der|die|das|den|dem|des|ein|eine|einen|einem|einer|the|an|a|to|le|la|les|un|une|des|el|los|las)\s+/i;
  const core = (s: string) => fold(clean(s)).replace(arts, '').trim();
  const u = core(got);
  if (!u) return false;
  const alts = clean(expected).split(/\s*[;,/|]\s*|\s+or\s+|\s+oder\s+/i).map(core).filter(Boolean);
  if (!alts.length) alts.push(core(expected));
  return alts.some(a => a === u || a.replace(/\s+/g, '') === u.replace(/\s+/g, ''));
}
