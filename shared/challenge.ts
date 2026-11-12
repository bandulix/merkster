/* A shared weekly goal. Everyone adds. Nobody is ranked. */
export const WEEKLY_TARGET = 20;

export function weekKey(d = new Date()): string {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

export function addUnits(current: number, extra: number, optedOut: boolean): number {
  if (optedOut) return current;
  const n = Number.isFinite(extra) ? Math.max(0, Math.min(100, Math.round(extra))) : 0;
  return current + n;
}

export function groupTotal(rows: { units: number; optedOut: boolean }[]): number {
  return rows.reduce((n, r) => n + (r.optedOut ? 0 : r.units), 0);
}

export function reached(total: number, target = WEEKLY_TARGET): boolean {
  return total >= target;
}

/** Names in alphabetical order. The bar is the group, not a race. */
export function contributionList<T extends { name: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => a.name.localeCompare(b.name, 'de'));
}
