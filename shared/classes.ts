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

/** strip control characters and markup, then cap the length */
export function cleanClassText(v: unknown, max: number): string {
  if (typeof v !== 'string') return '';
  return v.replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
}

export function boardOrder<T extends { xp: number; name: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => b.xp - a.xp || a.name.localeCompare(b.name, 'de'));
}
