/* Snapwise – successive-relearning scheduler.
   Per card: 1st pass (immediate retrieval) -> later the same day -> next day -> equal gaps
   (~15% of the retention interval, daily if the test is <= 7 days away) -> night before (retrieval only,
   no new cards) -> morning of the test (only cards missed last time, written once). */
import type { Card, CardState, Test } from '../../../shared/types';

export type Phase = 'past' | 'testDay' | 'nightBefore' | 'learning';
export type PlanKind = 'first' | 'next' | 'relearn' | 'night' | 'morning' | 'first+night';
export interface SessionEntry { testId: string; itemId: string; isNew: boolean; morning: boolean; }
type TestLike = Pick<Test, 'created' | 'testDate' | 'items'> & Partial<Pick<Test, 'id'>>;

const H = 3600e3;
export const dayISO = (t: number) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
export const parseDay = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d).getTime(); };
export const addDays = (iso: string, n: number) => { const [y, m, d] = iso.split('-').map(Number); return dayISO(new Date(y, m - 1, d + n).getTime()); };
export const daysBetween = (a: string, b: string) => Math.round((parseDay(b) - parseDay(a)) / 864e5);
export const retention = (test: Pick<Test, 'created' | 'testDate'>) => Math.max(1, daysBetween(test.created, test.testDate));
export const gapDays = (test: Pick<Test, 'created' | 'testDate'>) => { const ri = retention(test); return ri <= 7 ? 1 : Math.max(1, Math.round(ri * 0.15)); };
export const daysLeft = (test: Pick<Test, 'testDate'>, now: number) => daysBetween(dayISO(now), test.testDate);
export function phase(test: Pick<Test, 'testDate'>, now: number): Phase {
  const dl = daysLeft(test, now);
  return dl < 0 ? 'past' : dl === 0 ? 'testDay' : dl === 1 ? 'nightBefore' : 'learning';
}
export const freshState = (): CardState => ({ introduced: false, sessions: 0, lapses: 0, dueAt: null, struggledLast: false });
export function st(item: Pick<Card, 'st'>): CardState { return item.st || ((item as Card).st = freshState()); }

export function newQuota(test: TestLike, now: number): number {
  const dl = daysLeft(test, now);
  if (dl <= 0) return 0;
  const today = dayISO(now);
  const notIntro = test.items.filter(i => !st(i).introduced).length;
  if (!notIntro) return 0;
  const introToday = test.items.filter(i => st(i).introducedDay === today).length;
  const daysAvail = Math.max(1, dl - 1); // finish introducing before the night before
  return Math.max(0, Math.ceil((notIntro + introToday) / daysAvail) - introToday);
}
export const newItems = (test: TestLike, now: number) => test.items.filter(i => !st(i).introduced).slice(0, newQuota(test, now));
export function dueReviews(test: TestLike, now: number): Card[] {
  const ph = phase(test, now);
  if (ph === 'past') return [];
  if (ph === 'testDay') return test.items.filter(i => st(i).introduced && st(i).struggledLast && !st(i).morningDone);
  return test.items.filter(i => st(i).introduced && st(i).dueAt != null && (st(i).dueAt as number) <= now)
    .sort((a, b) => (Number(st(b).struggledLast) - Number(st(a).struggledLast)) || ((st(a).dueAt as number) - (st(b).dueAt as number)));
}
export function laterToday(test: TestLike, now: number): Card[] {
  const end = parseDay(addDays(dayISO(now), 1));
  return test.items.filter(i => { const d = st(i).dueAt; return d != null && d > now && d < end; });
}
export function nextDueAt(test: TestLike, now: number): number | null {
  if (phase(test, now) === 'past') return null;
  let best: number | null = null;
  for (const i of test.items) { const d = st(i).dueAt; if (d != null && d > now && (best == null || d < best)) best = d; }
  if (best == null && test.items.some(i => !st(i).introduced) && daysLeft(test, now) > 0) best = parseDay(addDays(dayISO(now), 1));
  if (best == null && phase(test, now) === 'nightBefore' && test.items.some(i => st(i).struggledLast)) best = parseDay(test.testDate) + 6 * H;
  return best;
}
export function introduce(item: Card, now: number) { const s = st(item); if (!s.introduced) { s.introduced = true; s.introducedDay = dayISO(now); } }

/** call when a card reached the criterion (one correct recall) in a session */
export function recordCriterion(test: TestLike, item: Card, now: number, struggled: boolean): CardState {
  const s = st(item);
  const today = dayISO(now);
  const ph = phase(test, now);
  s.sessions = (s.sessions || 0) + 1;
  s.lastAt = now;
  s.struggledLast = !!struggled;
  if (struggled) s.lapses = (s.lapses || 0) + 1;
  s.log = (s.log || []).slice(-9).concat([struggled ? 0 : 1]);
  if (ph === 'testDay' || ph === 'past') { s.morningDone = true; s.dueAt = null; return s; }
  const nightBefore = addDays(test.testDate, -1);
  if (s.sessions === 1) {
    const t = now + 3 * H, lim = parseDay(today) + 21 * H;
    if (t <= lim) { s.dueAt = t; return s; }
  }
  if (today >= nightBefore) { s.dueAt = null; return s; }
  let next = s.sessions <= 2 ? addDays(today, 1) : addDays(today, gapDays(test));
  if (next > nightBefore) next = nightBefore;
  s.dueAt = parseDay(next);
  return s;
}

export function mastery(test: TestLike): number {
  if (!test.items.length) return 0;
  const sum = test.items.reduce((a, i) => a + Math.min(3, st(i).sessions || 0) / 3 * (st(i).struggledLast ? 0.85 : 1), 0);
  return Math.round(sum / test.items.length * 100);
}

/** planned session days for the timeline */
export function plan(test: Pick<Test, 'created' | 'testDate'>): { day: string; kind: PlanKind }[] {
  const out: { day: string; kind: PlanKind }[] = [];
  const nb = addDays(test.testDate, -1);
  const c = test.created;
  if (c > test.testDate) return out;
  out.push({ day: c, kind: 'first' });
  if (c < nb) {
    let d = addDays(c, 1);
    if (d < nb) out.push({ day: d, kind: 'next' });
    const g = gapDays(test);
    d = addDays(d, g);
    while (d < nb) { out.push({ day: d, kind: 'relearn' }); d = addDays(d, g); }
    out.push({ day: nb, kind: 'night' });
  } else if (c === nb) out[0].kind = 'first+night';
  out.push({ day: test.testDate, kind: 'morning' });
  return out;
}

/** build today's session across all tests */
export function buildSession(tests: Test[], now: number, size: number) {
  const active = tests.filter(t => t.items.length && phase(t, now) !== 'past').sort((a, b) => a.testDate.localeCompare(b.testDate));
  const reviews: SessionEntry[] = [], news: SessionEntry[] = [];
  for (const t of active) {
    const morning = phase(t, now) === 'testDay';
    dueReviews(t, now).forEach(i => reviews.push({ testId: t.id, itemId: i.id, isNew: false, morning }));
    newItems(t, now).forEach(i => news.push({ testId: t.id, itemId: i.id, isNew: true, morning: false }));
  }
  const newSlots = Math.min(news.length, Math.max(Math.ceil(size * 0.4), size - reviews.length));
  const revSlots = Math.max(0, size - newSlots);
  const entries = reviews.slice(0, revSlots).concat(news.slice(0, newSlots));
  return { entries, totalDue: reviews.length + news.length, reviews: reviews.length, news: news.length };
}
export const todayCount = (tests: Test[], now: number) => tests.reduce((n, t) => n + dueReviews(t, now).length + newItems(t, now).length, 0);
