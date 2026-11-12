/* Offline pack and reminder rules. Answers merge by progress, not by who wrote last. */
import type { CardState } from './types';

export interface PackCard { id: string; testId: string; term: string; meaning: string; day: string }

/** Cards the student should still have while offline: today and the next two days. */
export function inOfflineWindow(day: string, today: string, horizon = 2): boolean {
  return day >= today && day <= addDays(today, horizon);
}

function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Keep the further-along review. A newer empty card must not wipe a practised one. */
export function mergeCardState(local: CardState, remote: CardState): CardState {
  const sessions = Math.max(local.sessions || 0, remote.sessions || 0);
  const richer = (local.sessions || 0) >= (remote.sessions || 0) ? local : remote;
  const other = richer === local ? remote : local;
  return {
    ...richer,
    introduced: !!(local.introduced || remote.introduced),
    sessions,
    lapses: Math.max(local.lapses || 0, remote.lapses || 0),
    struggledLast: !!(local.struggledLast || remote.struggledLast),
    morningDone: !!(local.morningDone || remote.morningDone),
    dueAt: later(local.dueAt, remote.dueAt),
    lastAt: later(local.lastAt ?? null, remote.lastAt ?? null) ?? undefined,
    introducedDay: local.introducedDay || remote.introducedDay || other.introducedDay
  };
}

function later(a: number | null | undefined, b: number | null | undefined): number | null {
  const x = typeof a === 'number' ? a : 0;
  const y = typeof b === 'number' ? b : 0;
  const m = Math.max(x, y);
  return m > 0 ? m : null;
}

export interface PushPrefs {
  enabled: boolean;
  hour: number;
  quietAfter: number;
  quietBefore: number;
  lastDay: string | null;
}

export const DEFAULT_PUSH: PushPrefs = { enabled: false, hour: 16, quietAfter: 20, quietBefore: 7, lastDay: null };

/** At most one reminder a day, and never during quiet hours. Off until the student opts in. */
export function mayNotify(now: Date, prefs: PushPrefs, today: string): boolean {
  if (!prefs.enabled) return false;
  if (prefs.lastDay === today) return false;
  const h = now.getHours();
  const after = clampHour(prefs.quietAfter, 20);
  const before = clampHour(prefs.quietBefore, 7);
  if (h >= after || h < before) return false;
  return h === clampHour(prefs.hour, 16);
}

function clampHour(n: number, d: number): number {
  return Number.isInteger(n) && n >= 0 && n <= 23 ? n : d;
}

export function reminderText(name: string, due: number, lang: 'de' | 'en'): string {
  const who = (name || 'Merki').slice(0, 24);
  if (lang === 'en') return due > 0 ? `${who}: ${due} cards are waiting. A short round is enough.` : `${who}: a short round today keeps the plan light.`;
  return due > 0 ? `${who}: ${due} Karten warten. Eine kurze Runde reicht.` : `${who}: eine kurze Runde hält den Plan leicht.`;
}
