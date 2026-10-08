/* Strict validation of everything clients send (never trust the browser). */
import { scoreOf, validResult } from '../../shared/grades';
import { CARD_TYPES, FORMATS, GRADE_SYSTEMS, LANG_CODES, SUBJECT_KEYS, type CardState, type ExamResult, type Lang, type WireCard, type WireProfile, type WireSession, type WireTest } from '../../shared/types';

export const ID_RE = /^[A-Za-z0-9_-]{4,64}$/;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');
const oneOf = <T extends string>(v: unknown, list: readonly T[], d: T): T => (list.includes(v as T) ? (v as T) : d);
const day = (v: unknown): string | null => (typeof v === 'string' && DAY_RE.test(v) && !Number.isNaN(Date.parse(v)) ? v : null);
const num = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const ts = (v: unknown) => Math.max(0, Math.min(num(v, Date.now()), Date.now() + 864e5)); // no far-future clocks
const lang = (v: unknown): Lang | null => (LANG_CODES.includes(v as Lang) ? (v as Lang) : null);

export function cleanResult(r: unknown): ExamResult | null {
  if (!r || typeof r !== 'object') return null;
  const o = r as Record<string, unknown>;
  const res: ExamResult = { system: oneOf(o.system, GRADE_SYSTEMS, 'de_grade'), value: num(o.value, NaN), enteredAt: ts(o.enteredAt) };
  if (res.system === 'xofy') res.max = num(o.max, NaN);
  if (typeof o.note === 'string' && o.note.trim()) res.note = str(o.note, 300).trim();
  if (!validResult(res)) return null;
  res.score = scoreOf(res);   // normalised 0–100, always recomputed on the server
  return res;
}
export function cleanTest(t: unknown): WireTest | null {
  const o = (t || {}) as Record<string, unknown>;
  if (typeof o.id !== 'string' || !ID_RE.test(o.id)) return null;
  const testDate = day(o.testDate); if (!testDate && !o.deleted) return null;
  return {
    id: o.id, name: str(o.name, 120).trim() || 'Test', subject: oneOf(o.subject, SUBJECT_KEYS, 'other'),
    foreign: lang(o.foreign), native: lang(o.native) || 'de', testDate: testDate || '2000-01-01', format: oneOf(o.format, FORMATS, 'mixed'),
    articles: !!o.articles, created: day(o.created), days: Array.isArray(o.days) ? o.days.map(day).filter((d): d is string => !!d).slice(-400) : [],
    result: cleanResult(o.result), resultSkipped: !!o.resultSkipped, grading: GRADE_SYSTEMS.includes(o.grading as never) ? (o.grading as WireTest['grading']) : null, updatedAt: ts(o.updatedAt), deleted: !!o.deleted
  };
}
export function cleanState(s: unknown): CardState {
  const o = (s || {}) as Record<string, unknown>;
  return {
    introduced: !!o.introduced, introducedDay: day(o.introducedDay) || undefined, sessions: Math.max(0, Math.floor(num(o.sessions))),
    lapses: Math.max(0, Math.floor(num(o.lapses))), dueAt: typeof o.dueAt === 'number' ? o.dueAt : null, struggledLast: !!o.struggledLast,
    morningDone: !!o.morningDone, lastAt: typeof o.lastAt === 'number' ? o.lastAt : undefined,
    log: Array.isArray(o.log) ? o.log.filter(x => x === 0 || x === 1).slice(-10) as number[] : []
  };
}
export function cleanCard(c: unknown): WireCard | null {
  const o = (c || {}) as Record<string, unknown>;
  if (typeof o.id !== 'string' || !ID_RE.test(o.id) || typeof o.testId !== 'string' || !ID_RE.test(o.testId)) return null;
  const term = str(o.term, 2000).trim(), meaning = str(o.meaning, 2000).trim();
  if (!o.deleted && (!term || !meaning)) return null;
  return {
    id: o.id, testId: o.testId, position: Math.max(0, Math.min(100000, Math.floor(num(o.position)))), type: oneOf(o.type, CARD_TYPES, 'pair'),
    term, meaning, example: str(o.example, 1000), distractors: Array.isArray(o.distractors) ? o.distractors.map(d => str(d, 300)).filter(Boolean).slice(0, 6) : [],
    st: cleanState(o.st), updatedAt: ts(o.updatedAt), deleted: !!o.deleted
  };
}
export function cleanSession(s: unknown): WireSession | null {
  const o = (s || {}) as Record<string, unknown>;
  if (typeof o.id !== 'string' || !ID_RE.test(o.id)) return null;
  const d = day(o.day); if (!d) return null;
  const n = (v: unknown, max: number) => Math.max(0, Math.min(max, Math.floor(num(v))));
  return { id: o.id, day: d, n: n(o.n, 10000), firstTry: n(o.firstTry, 10000), ms: n(o.ms, 864e5), activeMs: n(o.activeMs ?? o.ms, 864e5), correct: n(o.correct ?? o.n, 100000), at: typeof o.at === 'number' && o.at > 0 ? Math.min(o.at, Date.now() + 864e5) : null, tests: Array.isArray(o.tests) ? o.tests.filter((x): x is string => typeof x === 'string' && ID_RE.test(x)).slice(0, 50) : [] };
}
export function cleanProfile(p: unknown): WireProfile | null {
  const o = (p || {}) as Record<string, unknown>;
  const d = (o.data || {}) as Record<string, unknown>;
  const s = (d.settings || {}) as Record<string, unknown>;
  const settings = {
    uiLang: oneOf(s.uiLang, ['en', 'de'] as const, 'en'), theme: oneOf(s.theme, ['auto', 'light', 'dark'] as const, 'auto'),
    sessionSize: [8, 15, 25].includes(s.sessionSize as number) ? (s.sessionSize as number) : 15, tts: s.tts !== false, onboarded: !!s.onboarded,
    grading: oneOf(s.grading, GRADE_SYSTEMS, 'de_grade'), sound: s.sound === true,
    termStarts: (Array.isArray(s.termStarts) && s.termStarts.length === 2 && s.termStarts.every(m => Number.isInteger(m) && m >= 1 && m <= 12) && s.termStarts[0] !== s.termStarts[1] ? s.termStarts : [8, 2]) as [number, number],
    ackLevel: Math.max(1, Math.min(1000, Math.floor(num(s.ackLevel, 1)))),
    ackBadges: Array.isArray(s.ackBadges) ? s.ackBadges.filter((x): x is string => typeof x === 'string' && /^[a-z0-9_]{2,40}$/.test(x)).slice(0, 200) : []
  };
  const k = (d.streak || {}) as Record<string, unknown>, t = (d.stats || {}) as Record<string, unknown>;
  return {
    data: {
      settings,
      streak: { count: Math.max(0, Math.floor(num(k.count))), best: Math.max(0, Math.floor(num(k.best))), lastDay: day(k.lastDay) },
      stats: { sessions: Math.max(0, num(t.sessions)), answers: Math.max(0, num(t.answers)), firstTry: Math.max(0, num(t.firstTry)), ms: Math.max(0, num(t.ms)) }
    },
    updatedAt: ts(o.updatedAt)
  };
}
