/* Merkster – per-user data: offline-first sync endpoint + plain REST API.
   Conflict rule: last write wins per entity (test, card, profile) using the client's updatedAt.
   Every write bumps a global revision (sync_rev) so clients can pull "everything after rev N". */
import crypto from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import type { SyncResponse, WireCard, WireProfile, WireSession, WireTest } from '../../shared/types';
import { tx } from './db';
import { supporterExport } from './supporters';
import { evaluateSoon, rewardsExport } from './rewards';
import { reportCardsExport } from './reportcards';
import { classesExport } from './classes';
import { cleanCard, cleanProfile, cleanSession, cleanState, cleanTest, ID_RE } from './sanitize';

type Q = pg.Pool | pg.PoolClient;
const newId = () => crypto.randomBytes(9).toString('base64url');

/* ---------- writes (all LWW, all scoped by user_id) ---------- */
export async function upsertTest(q: Q, uid: number, t: WireTest) {
  await q.query(`INSERT INTO tests (user_id, id, name, subject, foreign_lang, native_lang, test_date, format, articles, created_day, days, updated_at, deleted, result, result_skipped, grading)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
    ON CONFLICT (user_id, id) DO UPDATE SET name = EXCLUDED.name, subject = EXCLUDED.subject, foreign_lang = EXCLUDED.foreign_lang, native_lang = EXCLUDED.native_lang,
      test_date = EXCLUDED.test_date, format = EXCLUDED.format, articles = EXCLUDED.articles, created_day = COALESCE(tests.created_day, EXCLUDED.created_day),
      days = EXCLUDED.days, updated_at = EXCLUDED.updated_at, deleted = EXCLUDED.deleted, result = EXCLUDED.result, result_skipped = EXCLUDED.result_skipped, grading = EXCLUDED.grading, rev = nextval('sync_rev')
    WHERE tests.updated_at <= EXCLUDED.updated_at`,
    [uid, t.id, t.name, t.subject, t.foreign, t.native, t.testDate, t.format, t.articles, t.created, JSON.stringify(t.days), t.updatedAt, !!t.deleted, t.result ? JSON.stringify(t.result) : null, !!t.resultSkipped, t.grading || null]);
  if (t.deleted) await q.query(`UPDATE cards SET deleted = TRUE, updated_at = $3, rev = nextval('sync_rev') WHERE user_id = $1 AND test_id = $2 AND NOT deleted`, [uid, t.id, t.updatedAt]);
}
/** returns false when the card's test does not exist (or is deleted) for this user */
export async function upsertCard(q: Q, uid: number, c: WireCard): Promise<boolean> {
  const r = await q.query(`INSERT INTO cards (user_id, id, test_id, position, type, term, meaning, example, distractors, state, updated_at, deleted)
    SELECT $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12
    WHERE EXISTS (SELECT 1 FROM tests WHERE user_id = $1 AND id = $3 AND NOT deleted)
    ON CONFLICT (user_id, id) DO UPDATE SET test_id = EXCLUDED.test_id, position = EXCLUDED.position, type = EXCLUDED.type, term = EXCLUDED.term,
      meaning = EXCLUDED.meaning, example = EXCLUDED.example, distractors = EXCLUDED.distractors, state = EXCLUDED.state,
      updated_at = EXCLUDED.updated_at, deleted = EXCLUDED.deleted, rev = nextval('sync_rev')
    WHERE cards.updated_at <= EXCLUDED.updated_at`,
    [uid, c.id, c.testId, c.position, c.type, c.term || '-', c.meaning || '-', c.example, JSON.stringify(c.distractors), JSON.stringify(c.st), c.updatedAt, !!c.deleted]);
  return (r.rowCount || 0) > 0;
}
export async function insertSession(q: Q, uid: number, s: WireSession) {
  await q.query(`INSERT INTO practice_sessions (user_id, id, day, cards, first_try, ms, test_ids, ended_at, correct, active_ms) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (user_id, id) DO NOTHING`,
    [uid, s.id, s.day, s.n, s.firstTry, s.ms, JSON.stringify(s.tests), s.at, s.correct, s.activeMs]);
}
export async function upsertProfile(q: Q, uid: number, p: WireProfile) {
  await q.query(`INSERT INTO profiles (user_id, data, updated_at) VALUES ($1,$2,$3)
    ON CONFLICT (user_id) DO UPDATE SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at, rev = nextval('sync_rev')
    WHERE profiles.updated_at <= EXCLUDED.updated_at`, [uid, JSON.stringify(p.data), p.updatedAt]);
}

/* ---------- reads ---------- */
const testRow = (r: Record<string, any>): WireTest => ({ id: r.id, name: r.name, subject: r.subject, foreign: r.foreign_lang, native: r.native_lang, testDate: r.test_date, format: r.format, articles: r.articles, created: r.created_day, days: r.days, result: r.result || null, resultSkipped: !!r.result_skipped, grading: r.grading || null, updatedAt: r.updated_at, deleted: r.deleted || undefined });
const cardRow = (r: Record<string, any>): WireCard => ({ id: r.id, testId: r.test_id, position: r.position, type: r.type, term: r.term, meaning: r.meaning, example: r.example, distractors: r.distractors, st: cleanState(r.state), updatedAt: r.updated_at, deleted: r.deleted || undefined });
const sessionRow = (r: Record<string, any>): WireSession => ({ id: r.id, day: r.day, n: r.cards, firstTry: r.first_try, ms: r.ms, tests: r.test_ids, at: r.ended_at ?? null, correct: r.correct, activeMs: r.active_ms });

export async function pull(q: Q, uid: number, since: number): Promise<SyncResponse> {
  const live = since > 0 ? '' : ' AND NOT deleted'; // a fresh device doesn't need tombstones
  const [t, c, s, p] = await Promise.all([
    q.query(`SELECT *, rev FROM tests WHERE user_id = $1 AND rev > $2${live} ORDER BY rev`, [uid, since]),
    q.query(`SELECT *, rev FROM cards WHERE user_id = $1 AND rev > $2${live} ORDER BY test_id, position`, [uid, since]),
    q.query(`SELECT * FROM practice_sessions WHERE user_id = $1 AND rev > $2 ORDER BY rev`, [uid, since]),
    q.query(`SELECT * FROM profiles WHERE user_id = $1 AND rev > $2`, [uid, since])
  ]);
  const revs = [since, ...t.rows.map(r => r.rev), ...c.rows.map(r => r.rev), ...s.rows.map(r => r.rev), ...p.rows.map(r => r.rev)];
  return {
    rev: Math.max(...revs), tests: t.rows.map(testRow), cards: c.rows.map(cardRow), sessions: s.rows.map(sessionRow),
    profile: p.rows[0] ? { data: p.rows[0].data, updatedAt: p.rows[0].updated_at } : null
  };
}

export async function dataPlugin(app: FastifyInstance, { pool }: { pool: pg.Pool }) {
  const uidOf = (req: { user: { id: number } | null }) => (req.user as { id: number }).id;
  const auth = { preHandler: app.requireUser };

  /* ---- offline-first sync: push local changes, get everything newer than `since` ---- */
  app.post('/api/sync', auth, async (req, reply) => {
    const uid = uidOf(req);
    const body = (req.body || {}) as { since?: unknown; push?: Record<string, unknown> };
    const since = typeof body.since === 'number' && body.since >= 0 ? Math.floor(body.since) : 0;
    const push = body.push || {};
    const arr = (v: unknown) => (Array.isArray(v) ? v : []);
    const tests = arr(push.tests).map(cleanTest).filter((x): x is WireTest => !!x);
    const cards = arr(push.cards).map(cleanCard).filter((x): x is WireCard => !!x);
    const sessions = arr(push.sessions).map(cleanSession).filter((x): x is WireSession => !!x);
    if (tests.length > 500 || cards.length > 20000 || sessions.length > 2000) return reply.code(413).send({ error: 'too_much' });
    const profile = push.profile ? cleanProfile(push.profile) : null;
    let skipped = 0;
    await tx(pool, async c => {
      for (const t of tests) await upsertTest(c, uid, t);
      for (const card of cards) if (!(await upsertCard(c, uid, card))) skipped++;
      for (const s of sessions) await insertSession(c, uid, s);
      if (profile) await upsertProfile(c, uid, profile);
    });
    // supporter rewards depend on results / practice days / level → re-evaluate in the background
    if (tests.length || sessions.length) evaluateSoon(pool, uid, req.log);
    const out = await pull(pool, uid, since);
    return { ...out, accepted: { tests: tests.length, cards: cards.length - skipped, sessions: sessions.length }, skippedCards: skipped };
  });

  /* ---- REST: tests ---- */
  app.get('/api/tests', auth, async req => {
    const r = await pool.query(`SELECT t.*, (SELECT count(*) FROM cards c WHERE c.user_id = t.user_id AND c.test_id = t.id AND NOT c.deleted) AS card_count
      FROM tests t WHERE t.user_id = $1 AND NOT t.deleted ORDER BY t.test_date`, [uidOf(req)]);
    return { tests: r.rows.map(row => ({ ...testRow(row), cardCount: Number(row.card_count) })) };
  });
  app.post('/api/tests', auth, async (req, reply) => {
    const t = cleanTest({ id: newId(), created: new Date().toISOString().slice(0, 10), ...(req.body as object), updatedAt: Date.now(), deleted: false });
    if (!t) return reply.code(400).send({ error: 'invalid_test' });
    await upsertTest(pool, uidOf(req), t);
    return reply.code(201).send({ test: t });
  });
  app.get<{ Params: { id: string } }>('/api/tests/:id', auth, async (req, reply) => {
    const t = await pool.query('SELECT * FROM tests WHERE user_id = $1 AND id = $2 AND NOT deleted', [uidOf(req), req.params.id]);
    if (!t.rows[0]) return reply.code(404).send({ error: 'not_found' });
    const c = await pool.query('SELECT * FROM cards WHERE user_id = $1 AND test_id = $2 AND NOT deleted ORDER BY position', [uidOf(req), req.params.id]);
    return { test: testRow(t.rows[0]), cards: c.rows.map(cardRow) };
  });
  app.patch<{ Params: { id: string } }>('/api/tests/:id', auth, async (req, reply) => {
    const cur = await pool.query('SELECT * FROM tests WHERE user_id = $1 AND id = $2 AND NOT deleted', [uidOf(req), req.params.id]);
    if (!cur.rows[0]) return reply.code(404).send({ error: 'not_found' });
    const t = cleanTest({ ...testRow(cur.rows[0]), ...(req.body as object), id: req.params.id, updatedAt: Date.now(), deleted: false });
    if (!t) return reply.code(400).send({ error: 'invalid_test' });
    await upsertTest(pool, uidOf(req), t);
    evaluateSoon(pool, uidOf(req), req.log);
    return { test: t };
  });
  app.delete<{ Params: { id: string } }>('/api/tests/:id', auth, async (req, reply) => {
    const cur = await pool.query('SELECT * FROM tests WHERE user_id = $1 AND id = $2 AND NOT deleted', [uidOf(req), req.params.id]);
    if (!cur.rows[0]) return reply.code(404).send({ error: 'not_found' });
    await tx(pool, c => upsertTest(c, uidOf(req), { ...testRow(cur.rows[0]), updatedAt: Date.now(), deleted: true }));
    return { ok: true };
  });

  /* ---- REST: cards (incl. review state) ---- */
  app.get<{ Params: { id: string } }>('/api/tests/:id/cards', auth, async req => {
    const c = await pool.query('SELECT * FROM cards WHERE user_id = $1 AND test_id = $2 AND NOT deleted ORDER BY position', [uidOf(req), req.params.id]);
    return { cards: c.rows.map(cardRow) };
  });
  app.post<{ Params: { id: string } }>('/api/tests/:id/cards', auth, async (req, reply) => {
    if (!ID_RE.test(req.params.id)) return reply.code(404).send({ error: 'not_found' });
    const list = Array.isArray((req.body as { cards?: unknown })?.cards) ? (req.body as { cards: unknown[] }).cards : [];
    const base = Number((await pool.query('SELECT coalesce(max(position), -1) + 1 AS p FROM cards WHERE user_id = $1 AND test_id = $2', [uidOf(req), req.params.id])).rows[0].p);
    const cards = list.slice(0, 2000).map((x, i) => cleanCard({ ...(x as object), id: newId(), testId: req.params.id, position: base + i, updatedAt: Date.now() })).filter((x): x is WireCard => !!x);
    const ok = await tx(pool, async c => { for (const card of cards) if (!(await upsertCard(c, uidOf(req), card))) return false; return true; });
    if (!ok) return reply.code(404).send({ error: 'test_not_found' });
    return reply.code(201).send({ cards });
  });
  app.patch<{ Params: { id: string } }>('/api/cards/:id', auth, async (req, reply) => {
    const cur = await pool.query('SELECT * FROM cards WHERE user_id = $1 AND id = $2 AND NOT deleted', [uidOf(req), req.params.id]);
    if (!cur.rows[0]) return reply.code(404).send({ error: 'not_found' });
    const card = cleanCard({ ...cardRow(cur.rows[0]), ...(req.body as object), id: req.params.id, testId: cur.rows[0].test_id, updatedAt: Date.now(), deleted: false });
    if (!card) return reply.code(400).send({ error: 'invalid_card' });
    await upsertCard(pool, uidOf(req), card);
    return { card };
  });
  app.delete<{ Params: { id: string } }>('/api/cards/:id', auth, async (req, reply) => {
    const r = await pool.query(`UPDATE cards SET deleted = TRUE, updated_at = $3, rev = nextval('sync_rev') WHERE user_id = $1 AND id = $2 AND NOT deleted`, [uidOf(req), req.params.id, Date.now()]);
    return r.rowCount ? { ok: true } : reply.code(404).send({ error: 'not_found' });
  });

  /* ---- REST: practice sessions ---- */
  app.get('/api/sessions', auth, async req => {
    const r = await pool.query('SELECT * FROM practice_sessions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 200', [uidOf(req)]);
    return { sessions: r.rows.map(sessionRow) };
  });
  app.post('/api/sessions', auth, async (req, reply) => {
    const s = cleanSession({ id: newId(), ...(req.body as object) });
    if (!s) return reply.code(400).send({ error: 'invalid_session' });
    await insertSession(pool, uidOf(req), s);
    evaluateSoon(pool, uidOf(req), req.log);
    return reply.code(201).send({ session: s });
  });

  /* ---- data export (GDPR Art. 15/20): everything we store about the signed-in user ---- */
  app.get('/api/me/export', auth, async (req, reply) => {
    const uid = uidOf(req);
    const u = (await pool.query('SELECT id, email, name, avatar_url, avatar_type, avatar_data, avatar_fetched_at, is_supporter, created_at, last_login_at FROM users WHERE id = $1', [uid])).rows[0];
    const data = await pull(pool, uid, 0);
    const ai = (await pool.query('SELECT created_at, ok, images, cards FROM ai_requests WHERE user_id = $1 ORDER BY created_at', [uid])).rows;
    reply.header('Content-Disposition', 'attachment; filename="my-data.json"');
    const supporters = await supporterExport(pool, uid);
    const rewards = await rewardsExport(pool, uid);
    const reportCards = await reportCardsExport(pool, uid);
    const classes = await classesExport(pool, uid);
    return { exportedAt: new Date().toISOString(), account: { id: String(u.id), email: u.email, name: u.name, avatarUrl: u.avatar_url, profilePicture: u.avatar_data ? { type: u.avatar_type, fetchedAt: u.avatar_fetched_at, dataUrl: `data:${u.avatar_type};base64,${Buffer.from(u.avatar_data).toString('base64')}` } : null, isSupporter: !!u.is_supporter, createdAt: u.created_at, lastLoginAt: u.last_login_at }, ...data, aiRequests: ai, supporters, rewards, reportCards, classes };
  });

  /* ---- delete all of my learning data (account stays) ---- */
  app.delete('/api/me/data', auth, async req => {
    await tx(pool, async c => {
      // soft-delete with a new revision so the user's other devices learn about it on their next sync
      await c.query(`UPDATE cards SET deleted = TRUE, updated_at = $2, rev = nextval('sync_rev') WHERE user_id = $1 AND NOT deleted`, [uidOf(req), Date.now()]);
      await c.query(`UPDATE tests SET deleted = TRUE, updated_at = $2, rev = nextval('sync_rev') WHERE user_id = $1 AND NOT deleted`, [uidOf(req), Date.now()]);
      await c.query('DELETE FROM practice_sessions WHERE user_id = $1', [uidOf(req)]);
      await c.query('DELETE FROM profiles WHERE user_id = $1', [uidOf(req)]);
      await c.query('DELETE FROM result_photos WHERE student_id = $1', [uidOf(req)]);
      await c.query('DELETE FROM report_cards WHERE user_id = $1', [uidOf(req)]);
      await c.query('DELETE FROM class_shares WHERE author_id = $1', [uidOf(req)]);
    });
    return { ok: true };
  });
}
