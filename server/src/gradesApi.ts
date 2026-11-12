/* Grades the student types in. Connected classmates (shared plan or class) can see
   a summary by default. Exact grades are opt-in. Notes and mood are never shared. */
import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { collectGrades, isScale, presentGrades, scoreFor, type ExamKind, type GradeEntry, type GradePrivacy, type GradeScale, type Mood } from '../../shared/gradebook';
import { EXAM_KINDS, GRADE_PRIVACY, MOODS } from '../../shared/gradebook';
import { SUBJECT_KEYS, type Subject, type Test } from '../../shared/types';
import { connectedIds, displayName } from './plans';
import { ID_RE } from './sanitize';

const clip = (v: unknown, n: number) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, n) : '');
const day = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : '');

export function cleanGrade(raw: unknown, idFallback: string): GradeEntry | null {
  const o = (raw || {}) as Record<string, unknown>;
  const id = clip(o.id, 64) || idFallback;
  if (!ID_RE.test(id)) return null;
  const subject = (SUBJECT_KEYS as readonly string[]).includes(String(o.subject)) ? o.subject as Subject : 'other';
  const system = isScale(o.system) ? o.system : null;
  const value = typeof o.value === 'number' && Number.isFinite(o.value) ? o.value : NaN;
  if (!system || !Number.isFinite(value)) return null;
  if (system === 'de_grade' && (value < 0.7 || value > 6)) return null;
  if (system === 'points15' && (value < 0 || value > 15)) return null;
  if (system === 'percent' && (value < 0 || value > 100)) return null;
  const kind = (EXAM_KINDS as readonly string[]).includes(String(o.kind)) ? o.kind as ExamKind : 'test';
  const mood = (MOODS as readonly string[]).includes(String(o.mood)) ? o.mood as Mood : null;
  const date = day(o.date);
  if (!date) return null;
  const testId = typeof o.testId === 'string' && ID_RE.test(o.testId) ? o.testId : null;
  const adherence = typeof o.adherence === 'number' && o.adherence >= 0 && o.adherence <= 100 ? Math.round(o.adherence) : null;
  return {
    id, testId, subject, title: clip(o.title, 80) || subject, kind, date, system, value,
    score: scoreFor(system, value), mood, note: clip(o.note, 300), adherence,
    withPlan: !!o.withPlan, updatedAt: typeof o.updatedAt === 'number' ? o.updatedAt : Date.now(), deleted: !!o.deleted
  };
}

function rowToGrade(r: Record<string, any>): GradeEntry {
  return {
    id: r.id, testId: r.test_id, subject: r.subject, title: r.title, kind: r.kind, date: r.taken_on,
    system: r.system, value: Number(r.value), score: Number(r.score), mood: r.mood, note: r.note || '',
    adherence: r.adherence == null ? null : Number(r.adherence), withPlan: !!r.with_plan,
    updatedAt: Number(r.updated_at), deleted: !!r.deleted
  };
}

async function loadUserGrades(pool: pg.Pool, uid: number): Promise<GradeEntry[]> {
  const rows = (await pool.query('SELECT * FROM grades WHERE user_id = $1 AND NOT deleted ORDER BY taken_on', [uid])).rows;
  const tests = (await pool.query('SELECT id, name, subject, test_date, result, days, created_day FROM tests WHERE user_id = $1 AND NOT deleted AND result IS NOT NULL', [uid])).rows;
  const asTests = tests.map(t => ({
    id: t.id, name: t.name, subject: t.subject, foreign: null, native: 'de', created: t.created_day, testDate: t.test_date,
    format: 'mixed', articles: false, items: [], days: t.days || [], result: t.result
  })) as unknown as Test[];
  const saved = rows.map(rowToGrade);
  return collectGrades(asTests, saved);
}

export async function gradesPlugin(app: FastifyInstance, { pool }: { pool: pg.Pool }) {
  const uidOf = (req: { user: { id: number } | null }) => (req.user as { id: number }).id;
  const auth = { preHandler: app.requireUser };

  app.get('/api/grades', auth, async req => ({ grades: await loadUserGrades(pool, uidOf(req)) }));

  app.post('/api/grades', auth, async (req, reply) => {
    const list = Array.isArray((req.body as { grades?: unknown })?.grades) ? (req.body as { grades: unknown[] }).grades : [req.body];
    const cleaned = list.slice(0, 40).map(g => cleanGrade(g, '')).filter((g): g is GradeEntry => !!g);
    if (!cleaned.length) return reply.code(400).send({ error: 'bad_grade' });
    for (const g of cleaned) {
      await pool.query(`INSERT INTO grades (user_id, id, test_id, subject, title, kind, taken_on, system, value, score, mood, note, adherence, with_plan, updated_at, deleted)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
        ON CONFLICT (user_id, id) DO UPDATE SET test_id = EXCLUDED.test_id, subject = EXCLUDED.subject, title = EXCLUDED.title, kind = EXCLUDED.kind,
          taken_on = EXCLUDED.taken_on, system = EXCLUDED.system, value = EXCLUDED.value, score = EXCLUDED.score, mood = EXCLUDED.mood, note = EXCLUDED.note,
          adherence = EXCLUDED.adherence, with_plan = EXCLUDED.with_plan, updated_at = EXCLUDED.updated_at, deleted = EXCLUDED.deleted
        WHERE grades.updated_at <= EXCLUDED.updated_at`,
        [uidOf(req), g.id, g.testId, g.subject, g.title, g.kind, g.date, g.system, g.value, g.score, g.mood, g.note, g.adherence, g.withPlan, g.updatedAt, !!g.deleted]);
    }
    return { grades: cleaned };
  });

  app.delete<{ Params: { id: string } }>('/api/grades/:id', auth, async (req, reply) => {
    if (!ID_RE.test(req.params.id)) return reply.code(400).send({ error: 'bad_grade' });
    const r = await pool.query('UPDATE grades SET deleted = TRUE, updated_at = $3 WHERE user_id = $1 AND id = $2 AND NOT deleted', [uidOf(req), req.params.id, Date.now()]);
    return r.rowCount ? { ok: true } : reply.code(404).send({ error: 'not_found' });
  });

  app.patch('/api/me/grade-privacy', auth, async (req, reply) => {
    const body = (req.body || {}) as { privacy?: unknown; targets?: unknown };
    const privacy: GradePrivacy = (GRADE_PRIVACY as readonly string[]).includes(String(body.privacy)) ? body.privacy as GradePrivacy : 'summary';
    const targets: Record<string, number> = {};
    if (body.targets && typeof body.targets === 'object') {
      for (const [k, v] of Object.entries(body.targets as Record<string, unknown>)) {
        if ((SUBJECT_KEYS as readonly string[]).includes(k) && typeof v === 'number' && v >= 0 && v <= 100) targets[k] = Math.round(v * 10) / 10;
      }
    }
    await pool.query('UPDATE users SET grade_privacy = $2, grade_targets = $3 WHERE id = $1', [uidOf(req), privacy, JSON.stringify(targets)]);
    return { privacy, targets };
  });

  app.get('/api/social/people', auth, async req => {
    const ids = await connectedIds(pool, uidOf(req));
    if (!ids.length) return { people: [] };
    const rows = (await pool.query('SELECT id, name, grade_privacy FROM users WHERE id = ANY($1::bigint[])', [ids])).rows;
    return { people: rows.map(r => ({ id: String(r.id), name: displayName(r.name), privacy: r.grade_privacy || 'summary' })) };
  });

  app.get<{ Params: { id: string } }>('/api/social/compare/:id', auth, async (req, reply) => {
    const other = Number(req.params.id);
    if (!Number.isInteger(other) || other <= 0) return reply.code(404).send({ error: 'not_found' });
    const ids = await connectedIds(pool, uidOf(req));
    if (!ids.includes(other)) return reply.code(404).send({ error: 'not_found' });
    const user = (await pool.query('SELECT name, grade_privacy, grade_targets FROM users WHERE id = $1', [other])).rows[0];
    if (!user) return reply.code(404).send({ error: 'not_found' });
    const privacy = (GRADE_PRIVACY as readonly string[]).includes(user.grade_privacy) ? user.grade_privacy as GradePrivacy : 'summary';
    const grades = privacy === 'hide' ? [] : await loadUserGrades(pool, other);
    const targets = (user.grade_targets && typeof user.grade_targets === 'object') ? user.grade_targets : {};
    const system: GradeScale = 'de_grade';
    return { id: String(other), ...presentGrades(displayName(user.name), privacy, grades, targets, system) };
  });
}
