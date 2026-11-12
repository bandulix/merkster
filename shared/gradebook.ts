/* Exam grades the student enters themselves (not a report card).
   Raw value + scale are kept; score is 0–100, higher = better, via shared/grades. */
import type { ExamResult, GradeSystem, Subject, Test } from './types';
import { fmtPctIn, scoreOf, toPct } from './grades';

export type ExamKind = 'klassenarbeit' | 'test' | 'klausur' | 'oral' | 'final';
export type Mood = 'awful' | 'bad' | 'ok' | 'good' | 'great';
export type GradePrivacy = 'hide' | 'summary' | 'grades';
export type GradeScale = 'de_grade' | 'points15' | 'percent';

export const EXAM_KINDS: ExamKind[] = ['klassenarbeit', 'test', 'klausur', 'oral', 'final'];
export const MOODS: Mood[] = ['awful', 'bad', 'ok', 'good', 'great'];
export const GRADE_PRIVACY: GradePrivacy[] = ['hide', 'summary', 'grades'];
export const GRADE_SCALES: GradeScale[] = ['de_grade', 'points15', 'percent'];

export interface GradeEntry {
  id: string;
  testId: string | null;
  subject: Subject;
  title: string;
  kind: ExamKind;
  date: string;
  system: GradeScale;
  value: number;
  score: number;
  mood: Mood | null;
  note: string;
  /** 0–100 of planned days actually practised, frozen when the grade was saved */
  adherence: number | null;
  withPlan: boolean;
  updatedAt: number;
  deleted?: boolean;
}

/** Default target: a German 3 (befriedigend) or better. Stored as a minimum normalised score. */
export const DEFAULT_TARGET_SCORE = scoreOf({ system: 'de_grade', value: 3 });

export function isScale(v: unknown): v is GradeScale {
  return v === 'de_grade' || v === 'points15' || v === 'percent';
}
export function scoreFor(system: GradeScale, value: number): number {
  return scoreOf({ system, value });
}
export function meetsTarget(score: number, target: number): boolean {
  return score + 0.001 >= target;
}
export function targetFor(subject: Subject, targets: Partial<Record<Subject, number>> | undefined): number {
  const n = targets?.[subject];
  return typeof n === 'number' && n >= 0 && n <= 100 ? n : DEFAULT_TARGET_SCORE;
}

/** Share of grades at or above the subject's target. */
export function erfolgsquote(grades: GradeEntry[], targets?: Partial<Record<Subject, number>>): { rate: number; hit: number; total: number } {
  const list = grades.filter(g => !g.deleted);
  if (!list.length) return { rate: 0, hit: 0, total: 0 };
  const hit = list.filter(g => meetsTarget(g.score, targetFor(g.subject, targets))).length;
  return { rate: hit / list.length, hit, total: list.length };
}
export function averageScore(grades: GradeEntry[]): number | null {
  const list = grades.filter(g => !g.deleted);
  if (!list.length) return null;
  return list.reduce((s, g) => s + g.score, 0) / list.length;
}
export interface SubjectStat { subject: Subject; n: number; avg: number; rate: number; best: number }
export function bySubject(grades: GradeEntry[], targets?: Partial<Record<Subject, number>>): SubjectStat[] {
  const map = new Map<Subject, GradeEntry[]>();
  for (const g of grades) {
    if (g.deleted) continue;
    const list = map.get(g.subject) || [];
    list.push(g);
    map.set(g.subject, list);
  }
  return [...map.entries()].map(([subject, list]) => {
    const scores = list.map(g => g.score);
    const q = erfolgsquote(list, targets);
    return { subject, n: list.length, avg: scores.reduce((a, b) => a + b, 0) / scores.length, rate: q.rate, best: Math.max(...scores) };
  }).sort((a, b) => b.n - a.n || a.subject.localeCompare(b.subject));
}
export function trendOf(grades: GradeEntry[]): 'up' | 'down' | 'flat' | null {
  const scores = grades.filter(g => !g.deleted).slice().sort((a, b) => a.date.localeCompare(b.date)).map(g => g.score);
  if (scores.length < 2) return null;
  const k = Math.min(3, Math.floor(scores.length / 2));
  const recent = scores.slice(-k);
  const prev = scores.slice(-2 * k, -k);
  if (!prev.length) return null;
  const diff = recent.reduce((a, b) => a + b, 0) / recent.length - prev.reduce((a, b) => a + b, 0) / prev.length;
  return diff > 3 ? 'up' : diff < -3 ? 'down' : 'flat';
}
export interface GroupStat { n: number; avg: number }
export function planEffect(grades: GradeEntry[]): { withPlan: GroupStat | null; without: GroupStat | null } {
  const group = (withPlan: boolean): GroupStat | null => {
    const list = grades.filter(g => !g.deleted && g.withPlan === withPlan);
    if (!list.length) return null;
    return { n: list.length, avg: list.reduce((s, g) => s + g.score, 0) / list.length };
  };
  return { withPlan: group(true), without: group(false) };
}
export interface AdherenceBand { id: 'low' | 'mid' | 'high'; n: number; avg: number }
export function adherenceBands(grades: GradeEntry[]): AdherenceBand[] {
  const buckets: Record<AdherenceBand['id'], GradeEntry[]> = { low: [], mid: [], high: [] };
  for (const g of grades) {
    if (g.deleted || g.adherence == null || !g.withPlan) continue;
    const id = g.adherence >= 70 ? 'high' : g.adherence >= 40 ? 'mid' : 'low';
    buckets[id].push(g);
  }
  return (['low', 'mid', 'high'] as const).map(id => {
    const list = buckets[id];
    return { id, n: list.length, avg: list.length ? list.reduce((s, g) => s + g.score, 0) / list.length : 0 };
  }).filter(b => b.n > 0);
}

/** planned study days (anything except the exam morning) that were actually practised */
export function adherencePct(planned: string[], practised: string[] | undefined): number | null {
  if (!planned.length) return null;
  const set = new Set(practised || []);
  return Math.round(planned.filter(d => set.has(d)).length / planned.length * 100);
}

export function fromTestResult(test: Test): GradeEntry | null {
  if (!test.result) return null;
  const system: GradeScale = isScale(test.result.system) ? test.result.system : 'percent';
  const value = system === 'percent' && !isScale(test.result.system) ? toPct(test.result) : test.result.value;
  const withPlan = test.items.length > 0 || !!test.study?.goals?.length;
  return {
    id: 'legacy-' + test.id,
    testId: test.id,
    subject: test.subject,
    title: test.name,
    kind: 'klassenarbeit',
    date: test.testDate,
    system,
    value,
    score: scoreOf({ system, value }),
    mood: null,
    note: test.result.note || '',
    adherence: null,
    withPlan,
    updatedAt: test.result.enteredAt
  };
}

/** Saved grades, plus older test results that were never copied into a grade row. */
export function collectGrades(tests: Test[], grades: GradeEntry[], adherenceFor?: (t: Test) => number | null): GradeEntry[] {
  const linked = new Set(grades.filter(g => g.testId && !g.deleted).map(g => g.testId));
  const extra: GradeEntry[] = [];
  for (const t of tests) {
    if (linked.has(t.id)) continue;
    const g = fromTestResult(t);
    if (!g) continue;
    if (adherenceFor && g.withPlan) g.adherence = adherenceFor(t);
    extra.push(g);
  }
  return [...grades.filter(g => !g.deleted), ...extra].sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
}

export function toExamResult(g: Pick<GradeEntry, 'system' | 'value' | 'note' | 'updatedAt'>): ExamResult {
  const r: ExamResult = { system: g.system as GradeSystem, value: g.value, enteredAt: g.updatedAt, score: scoreFor(g.system, g.value) };
  if (g.note.trim()) r.note = g.note.trim().slice(0, 300);
  return r;
}
export function formatScore(score: number, system: GradeSystem): string {
  return fmtPctIn(score, system);
}

/** What another student may see. Exact grades are opt-in; notes and mood never leave the device. */
export interface SharedGradeView {
  privacy: GradePrivacy;
  name: string;
  summary?: { n: number; avg: number; rate: number; trend: 'up' | 'down' | 'flat' | null; best: number; system: GradeScale };
  grades?: { date: string; subject: Subject; title: string; kind: ExamKind; system: GradeScale; value: number; score: number; metTarget: boolean }[];
}
export function presentGrades(name: string, privacy: GradePrivacy, grades: GradeEntry[], targets?: Partial<Record<Subject, number>>, system: GradeScale = 'de_grade'): SharedGradeView {
  if (privacy === 'hide') return { privacy, name };
  const list = grades.filter(g => !g.deleted).sort((a, b) => a.date.localeCompare(b.date));
  const avg = averageScore(list);
  const q = erfolgsquote(list, targets);
  const summary = {
    n: list.length,
    avg: avg ?? 0,
    rate: q.rate,
    trend: trendOf(list),
    best: list.length ? Math.max(...list.map(g => g.score)) : 0,
    system
  };
  if (privacy === 'summary') return { privacy, name, summary };
  return {
    privacy, name, summary,
    grades: list.map(g => ({
      date: g.date, subject: g.subject, title: g.title, kind: g.kind, system: g.system, value: g.value, score: g.score,
      metTarget: meetsTarget(g.score, targetFor(g.subject, targets))
    }))
  };
}

export function daysUntil(today: string, exam: string): number {
  const [ay, am, ad] = today.split('-').map(Number);
  const [by, bm, bd] = exam.split('-').map(Number);
  return Math.round((new Date(by, (bm || 1) - 1, bd || 1).getTime() - new Date(ay, (am || 1) - 1, ad || 1).getTime()) / 864e5);
}
