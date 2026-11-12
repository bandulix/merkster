/* Class XP board: recompute progress from the same history the app uses.
   No supporter reactions and no report cards. */
import type pg from 'pg';
import type { HistoryEntry, Test } from '../../shared/types';
import { computeProgress, type Progress } from '../../shared/gamification';

type Q = pg.Pool | pg.PoolClient;
const byUser = (rows: Record<string, any>[], key: string) => {
  const m = new Map<number, Record<string, any>[]>();
  for (const r of rows) {
    const id = Number(r[key]);
    const list = m.get(id);
    if (list) list.push(r); else m.set(id, [r]);
  }
  return m;
};
export async function loadStudents(q: Q, studentIds: number[]) {
  const ids = [...new Set(studentIds.map(Number))].filter(n => Number.isInteger(n));
  const out = new Map<number, { tests: Test[]; history: HistoryEntry[]; progress: Progress }>();
  if (!ids.length) return out;
  const [t, s] = await Promise.all([
    q.query('SELECT user_id, id, name, subject, foreign_lang, native_lang, test_date, format, articles, created_day, days, result, result_skipped, grading FROM tests WHERE user_id = ANY($1::bigint[]) AND NOT deleted', [ids]),
    q.query('SELECT user_id, id, day, cards, first_try, ms, active_ms, correct, ended_at, test_ids FROM practice_sessions WHERE user_id = ANY($1::bigint[])', [ids])
  ]);
  const testsOf = byUser(t.rows, 'user_id'), sessionsOf = byUser(s.rows, 'user_id');
  const now = Date.now();
  for (const id of ids) {
    const tests = (testsOf.get(id) || []).map(r => ({ id: r.id, name: r.name, subject: r.subject, foreign: r.foreign_lang, native: r.native_lang, testDate: r.test_date, format: r.format, articles: r.articles, created: r.created_day, days: r.days || [], result: r.result || null, resultSkipped: r.result_skipped, grading: r.grading || null, items: [] }) as unknown as Test);
    const history: HistoryEntry[] = (sessionsOf.get(id) || []).map(r => ({ id: r.id, day: r.day, n: r.cards, firstTry: r.first_try, ms: r.ms, activeMs: r.active_ms, correct: r.correct, at: r.ended_at ?? undefined, tests: r.test_ids || [] }));
    out.set(id, { tests, history, progress: computeProgress(history, tests, now) });
  }
  return out;
}
