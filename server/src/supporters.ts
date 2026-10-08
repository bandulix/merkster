/* Merkster – supporters (parents, grandparents, coaches …).
   - A student creates an invite link. The token is 192 random bits, lives only in the URL *fragment*
     (/join#<token>, never sent to or logged by the server as a URL) and is posted in a request body.
     The DB stores HMAC(APP_SECRET, token). Invites expire, have a use limit and can be revoked.
   - Every supporter call re-checks the student↔supporter link and the student's sharing switches in SQL.
     Supporters only receive aggregated stats and exam results – never cards or card text; a photo of a graded
     test only if the student explicitly allows it for that supporter. They can write reactions from a fixed set
     (no free text), reward rules for this student and a "verified" mark on a result – nothing else. */
import crypto from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type pg from 'pg';
import type { Config } from './config';
import type { HistoryEntry, Test } from '../../shared/types';
import { computeProgress, practiceBefore, xpToReach, type CheerLite, type Progress } from '../../shared/gamification';
import {
  INVITE_DAYS_DEFAULT, INVITE_DAYS_MAX, INVITE_USES_MAX, MAX_OPEN_INVITES, MAX_SUPPORTERS, REACTIONS, RELATIONS, TARGET_KINDS,
  targetKey, type Cheer, type Invite, type KidMilestone, type KidResult, type KidSummary, type ReactionCount, type Relation, type Supporter, type TargetKind
} from '../../shared/supporters';
import { tx } from './db';
import { avatarPath } from './avatars';
import { limiter } from './ratelimit';
import { gradingOf } from './rewards';
import { loadCards } from './reportcards';
import { cardsLite } from '../../shared/reportcards';

type Q = pg.Pool | pg.PoolClient;
const TOKEN_RE = /^[A-Za-z0-9_-]{32}$/;
const ID_NUM = /^\d{1,18}$/;
const cleanLabel = (v: unknown) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 40) : '');
const cleanRelation = (v: unknown): Relation => (RELATIONS as readonly string[]).includes(v as string) ? (v as Relation) : 'other';
const firstName = (n: string) => (n || '').trim().split(/\s+/)[0] || '';
const localDay = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 864e5);

const inviteRow = (r: Record<string, any>): Invite => ({
  id: String(r.id), relation: cleanRelation(r.relation), label: r.label, maxUses: r.max_uses, uses: r.uses,
  expiresAt: new Date(r.expires_at).toISOString(), createdAt: new Date(r.created_at).toISOString(),
  status: r.revoked_at ? 'revoked' : r.uses >= r.max_uses ? 'used' : new Date(r.expires_at).getTime() < Date.now() ? 'expired' : 'open'
});

/* ---------- a student's progress, recomputed on the server from the same data + the same code as the app ---------- */
export async function loadStudent(q: Q, studentId: number) {
  const [t, s, c, cards] = await Promise.all([
    q.query('SELECT id, name, subject, foreign_lang, native_lang, test_date, format, articles, created_day, days, result, result_skipped, grading FROM tests WHERE user_id = $1 AND NOT deleted', [studentId]),
    q.query('SELECT id, day, cards, first_try, ms, active_ms, correct, ended_at, test_ids FROM practice_sessions WHERE user_id = $1', [studentId]),
    q.query('SELECT supporter_id, target_kind, target_id, created_at FROM reactions WHERE student_id = $1', [studentId]),
    loadCards(q, studentId)
  ]);
  const tests = t.rows.map(r => ({ id: r.id, name: r.name, subject: r.subject, foreign: r.foreign_lang, native: r.native_lang, testDate: r.test_date, format: r.format, articles: r.articles, created: r.created_day, days: r.days || [], result: r.result || null, resultSkipped: r.result_skipped, grading: r.grading || null, items: [] }) as unknown as Test);
  const history: HistoryEntry[] = s.rows.map(r => ({ id: r.id, day: r.day, n: r.cards, firstTry: r.first_try, ms: r.ms, activeMs: r.active_ms, correct: r.correct, at: r.ended_at ?? undefined, tests: r.test_ids || [] }));
  const cheers: CheerLite[] = c.rows.map(r => ({ at: new Date(r.created_at).getTime(), target: targetKey(r.target_kind, r.target_id), from: String(r.supporter_id) }));
  return { tests, history, cheers, cards, progress: computeProgress(history, tests, Date.now(), cheers, cardsLite(cards)) };
}
/** level-ups (with the time they happened) + unlocked badges, newest first */
export function milestonesOf(p: Progress): Omit<KidMilestone, 'reactions'>[] {
  const out: Omit<KidMilestone, 'reactions'>[] = [];
  let xp = 0, level = 1;
  for (const e of [...p.events].sort((a, b) => a.at - b.at)) { xp += e.xp; while (xp >= xpToReach(level + 1)) { level++; out.push({ kind: 'level', id: String(level), at: e.at }); } }
  for (const b of p.badges) out.push({ kind: 'badge', id: b.id, at: b.at });
  return out.sort((a, b) => b.at - a.at);
}

export async function supporterExport(q: Q, uid: number) {
  const [inv, sup, kids, rin, rout] = await Promise.all([
    q.query('SELECT * FROM invites WHERE student_id = $1 ORDER BY created_at', [uid]),
    q.query('SELECT l.*, u.name FROM supporter_links l JOIN users u ON u.id = l.supporter_id WHERE l.student_id = $1', [uid]),
    q.query('SELECT l.*, u.name FROM supporter_links l JOIN users u ON u.id = l.student_id WHERE l.supporter_id = $1', [uid]),
    q.query('SELECT supporter_id, target_kind, target_id, reaction, created_at, seen_at FROM reactions WHERE student_id = $1 ORDER BY created_at', [uid]),
    q.query('SELECT student_id, target_kind, target_id, reaction, created_at FROM reactions WHERE supporter_id = $1 ORDER BY created_at', [uid])
  ]);
  const link = (r: any, who: 'supporter' | 'student') => ({ [who + 'Id']: String(r[who + '_id']), name: r.name, relation: r.relation, label: r.label, showResults: r.show_results, showPractice: r.show_practice, showPhotos: r.show_photos, since: r.created_at });
  return {
    invites: inv.rows.map(inviteRow),
    mySupporters: sup.rows.map(r => link(r, 'supporter')),
    iSupport: kids.rows.map(r => link(r, 'student')),
    reactionsReceived: rin.rows.map(r => ({ from: String(r.supporter_id), target: r.target_kind + ':' + r.target_id, reaction: r.reaction, at: r.created_at, seenAt: r.seen_at })),
    reactionsGiven: rout.rows.map(r => ({ to: String(r.student_id), target: r.target_kind + ':' + r.target_id, reaction: r.reaction, at: r.created_at }))
  };
}

export async function supportersPlugin(app: FastifyInstance, { pool, config }: { pool: pg.Pool; config: Config }) {
  const auth = { preHandler: app.requireUser };
  const uidOf = (req: FastifyRequest) => req.user!.id;
  const hashToken = (t: string) => crypto.createHmac('sha256', config.appSecret).update('invite:' + t).digest('hex');
  const inviteLimit = limiter(30, 10 * 60e3), reactLimit = limiter(120, 10 * 60e3), createLimit = limiter(20, 60 * 60e3);
  const limited = (reply: FastifyReply, r: { ok: boolean; retryAfter?: number }) => { if (!r.ok) { reply.header('Retry-After', String(r.retryAfter)).code(429).send({ error: 'rate_limited' }); return true; } return false; };
  const tokenOf = (req: FastifyRequest) => { const t = (req.body as { token?: unknown } | null)?.token; return typeof t === 'string' && TOKEN_RE.test(t) ? t : null; };

  /** the link between the signed-in supporter and a student – re-checked on every supporter call */
  async function linkFor(supporterId: number, studentId: string) {
    if (!ID_NUM.test(studentId)) return null;
    return (await pool.query(`SELECT l.*, u.name, u.avatar_etag FROM supporter_links l JOIN users u ON u.id = l.student_id WHERE l.supporter_id = $1 AND l.student_id = $2`, [supporterId, studentId])).rows[0] || null;
  }
  async function reactionCounts(studentId: number, supporterId: number) {
    const r = await pool.query(`SELECT target_kind, target_id, reaction, count(*)::int AS n, bool_or(supporter_id = $2) AS mine FROM reactions WHERE student_id = $1 GROUP BY 1, 2, 3`, [studentId, supporterId]);
    const m = new Map<string, ReactionCount[]>();
    for (const x of r.rows) { const k = targetKey(x.target_kind, x.target_id); (m.get(k) || m.set(k, []).get(k)!).push({ reaction: x.reaction, n: x.n, mine: x.mine }); }
    return (k: string) => m.get(k) || [];
  }
  async function kidSummary(link: Record<string, any>, supporterId: number, full: boolean): Promise<KidSummary> {
    const sid = Number(link.student_id);
    const out: KidSummary = { id: String(sid), name: firstName(link.name), avatar: avatarPath(link.student_id, link.avatar_etag), relation: cleanRelation(link.relation), label: link.label, showResults: link.show_results, showPractice: link.show_practice, showPhotos: link.show_photos, grading: await gradingOf(pool, link.student_id) };
    if (!link.show_results && !link.show_practice) return out;
    const { tests, history, cards, progress: p } = await loadStudent(pool, sid);
    const rc = await reactionCounts(sid, supporterId);
    const today = localDay();
    if (link.show_practice) {
      const upcoming = tests.filter(t => t.testDate >= today).sort((a, b) => a.testDate.localeCompare(b.testDate)).slice(0, full ? 20 : 3)
        .map(t => ({ name: t.name, subject: t.subject, testDate: t.testDate, daysLeft: daysBetween(today, t.testDate), practisedDays: new Set((t.days || []).filter(d => d <= t.testDate)).size }));
      out.practice = {
        level: p.level, rankId: p.rank.id, xp: p.xp, streak: p.streak.current, bestStreak: p.streak.best, weekMinutes: p.week.activeMin, weekSessions: p.week.sessions,
        badges: p.badges.length, upcoming, milestones: milestonesOf(p).slice(0, full ? 30 : 4).map(m => ({ ...m, reactions: rc(targetKey(m.kind, m.id)) }))
      };
    }
    if (link.show_results) {
      const [ver, ph] = await Promise.all([
        pool.query('SELECT test_id FROM result_verifications WHERE student_id = $1 AND supporter_id = $2', [sid, supporterId]),
        link.show_photos ? pool.query('SELECT test_id FROM result_photos WHERE student_id = $1', [sid]) : Promise.resolve({ rows: [] as { test_id: string }[] })
      ]);
      const verified = new Set(ver.rows.map(r => r.test_id as string)), photos = new Set(ph.rows.map(r => r.test_id as string));
      out.reportCards = [...cards].reverse().slice(0, full ? 20 : 1).map(c => ({ ...c, hasPhoto: !!(c.hasPhoto && link.show_photos), reactions: rc(targetKey('report', c.id)) }));
      out.results = tests.filter(t => t.result).sort((a, b) => b.testDate.localeCompare(a.testDate)).slice(0, full ? 200 : 3).map((t): KidResult => ({
        testId: t.id, name: t.name, subject: t.subject, testDate: t.testDate, result: t.result!,
        ...(link.show_practice ? { practice: practiceBefore(t, history) } : {}), reactions: rc(targetKey('result', t.id)), verified: verified.has(t.id), photo: photos.has(t.id)
      }));
    }
    return out;
  }

  /* ================= student side ================= */
  app.post('/api/invites', auth, async (req, reply) => {
    if (limited(reply, createLimit(String(uidOf(req))))) return;
    const b = (req.body || {}) as Record<string, unknown>;
    const days = Math.min(INVITE_DAYS_MAX, Math.max(1, Math.round(Number(b.days) || INVITE_DAYS_DEFAULT)));
    const maxUses = Math.min(INVITE_USES_MAX, Math.max(1, Math.round(Number(b.maxUses) || 1)));
    const open = Number((await pool.query(`SELECT count(*) FROM invites WHERE student_id = $1 AND revoked_at IS NULL AND uses < max_uses AND expires_at > now()`, [uidOf(req)])).rows[0].count);
    if (open >= MAX_OPEN_INVITES) return reply.code(409).send({ error: 'too_many_invites' });
    const token = crypto.randomBytes(24).toString('base64url');
    const r = await pool.query(`INSERT INTO invites (student_id, token_hash, relation, label, max_uses, expires_at) VALUES ($1,$2,$3,$4,$5, now() + make_interval(days => $6)) RETURNING *`,
      [uidOf(req), hashToken(token), cleanRelation(b.relation), cleanLabel(b.label), maxUses, days]);
    return reply.code(201).send({ invite: { ...inviteRow(r.rows[0]), token, url: `${config.publicUrl}/join#${token}` } });
  });
  app.get('/api/invites', auth, async req => {
    const r = await pool.query(`SELECT * FROM invites WHERE student_id = $1 AND created_at > now() - interval '30 days' ORDER BY created_at DESC LIMIT 50`, [uidOf(req)]);
    return { invites: r.rows.map(inviteRow) };
  });
  app.delete<{ Params: { id: string } }>('/api/invites/:id', auth, async (req, reply) => {
    if (!ID_NUM.test(req.params.id)) return reply.code(404).send({ error: 'not_found' });
    const r = await pool.query('UPDATE invites SET revoked_at = coalesce(revoked_at, now()) WHERE id = $1 AND student_id = $2', [req.params.id, uidOf(req)]);
    return r.rowCount ? { ok: true } : reply.code(404).send({ error: 'not_found' });
  });

  /** privacy between relatives: may supporters see each other's rules and amounts? (default: no) */
  app.put('/api/supporters/visibility', auth, async req => {
    const v = (req.body as { seeEachOther?: unknown } | null)?.seeEachOther === true;
    await pool.query('UPDATE users SET supporters_see_each_other = $2 WHERE id = $1', [uidOf(req), v]);
    return { ok: true, seeEachOther: v };
  });
  app.get('/api/supporters', auth, async req => {
    const seeEachOther = !!(await pool.query('SELECT supporters_see_each_other AS v FROM users WHERE id = $1', [uidOf(req)])).rows[0]?.v;
    const r = await pool.query(`SELECT l.*, u.name, u.avatar_etag FROM supporter_links l JOIN users u ON u.id = l.supporter_id WHERE l.student_id = $1 ORDER BY l.created_at`, [uidOf(req)]);
    return { seeEachOther, supporters: r.rows.map((x): Supporter => ({ id: String(x.supporter_id), name: x.name, avatar: avatarPath(x.supporter_id, x.avatar_etag), relation: cleanRelation(x.relation), label: x.label, showResults: x.show_results, showPractice: x.show_practice, showPhotos: x.show_photos, since: new Date(x.created_at).toISOString() })) };
  });
  app.patch<{ Params: { id: string } }>('/api/supporters/:id', auth, async (req, reply) => {
    if (!ID_NUM.test(req.params.id)) return reply.code(404).send({ error: 'not_found' });
    const b = (req.body || {}) as Record<string, unknown>;
    const r = await pool.query(`UPDATE supporter_links SET show_results = coalesce($3, show_results), show_practice = coalesce($4, show_practice),
        label = coalesce($5, label), relation = coalesce($6, relation), show_photos = coalesce($7, show_photos) WHERE student_id = $1 AND supporter_id = $2 RETURNING *`,
      [uidOf(req), req.params.id, typeof b.showResults === 'boolean' ? b.showResults : null, typeof b.showPractice === 'boolean' ? b.showPractice : null,
        typeof b.label === 'string' ? cleanLabel(b.label) : null, typeof b.relation === 'string' ? cleanRelation(b.relation) : null, typeof b.showPhotos === 'boolean' ? b.showPhotos : null]);
    return r.rowCount ? { ok: true } : reply.code(404).send({ error: 'not_found' });
  });
  app.delete<{ Params: { id: string } }>('/api/supporters/:id', auth, async (req, reply) => {
    if (!ID_NUM.test(req.params.id)) return reply.code(404).send({ error: 'not_found' });
    const r = await pool.query('DELETE FROM supporter_links WHERE student_id = $1 AND supporter_id = $2', [uidOf(req), req.params.id]);   // their reactions, reward rules, earned rewards and verifications go too (FK cascade)
    if (r.rowCount) req.log.info({ studentId: String(uidOf(req)) }, 'supporter removed');
    return r.rowCount ? { ok: true } : reply.code(404).send({ error: 'not_found' });
  });

  /** cheers I received (newest first) */
  app.get('/api/cheers', auth, async req => {
    const r = await pool.query(`SELECT r.*, u.name, u.avatar_etag, l.relation, l.label FROM reactions r
      JOIN supporter_links l ON l.student_id = r.student_id AND l.supporter_id = r.supporter_id JOIN users u ON u.id = r.supporter_id
      WHERE r.student_id = $1 ORDER BY r.created_at DESC LIMIT 300`, [uidOf(req)]);
    return { cheers: r.rows.map((x): Cheer => ({ id: String(x.id), from: { id: String(x.supporter_id), name: firstName(x.name), avatar: avatarPath(x.supporter_id, x.avatar_etag), relation: cleanRelation(x.relation), label: x.label }, targetKind: x.target_kind, targetId: x.target_id, reaction: x.reaction, at: new Date(x.created_at).getTime(), seen: !!x.seen_at })) };
  });
  app.post('/api/cheers/seen', auth, async req => {
    await pool.query('UPDATE reactions SET seen_at = now() WHERE student_id = $1 AND seen_at IS NULL', [uidOf(req)]);
    return { ok: true };
  });

  /* ================= invitee / supporter side ================= */
  /** what the invite page shows before/after sign-in (first name only) */
  app.post('/api/invite/preview', async (req, reply) => {
    if (limited(reply, inviteLimit(req.ip))) return;
    const token = tokenOf(req);
    const r = token ? (await pool.query('SELECT i.*, u.name, u.avatar_etag FROM invites i JOIN users u ON u.id = i.student_id WHERE i.token_hash = $1', [hashToken(token)])).rows[0] : null;
    if (!r) return { valid: false, reason: 'not_found' };
    const st = inviteRow(r).status;
    if (st !== 'open') return { valid: false, reason: st };
    return { valid: true, studentName: firstName(r.name), studentAvatar: avatarPath(r.student_id, r.avatar_etag), relation: cleanRelation(r.relation) };
  });
  app.post('/api/invite/accept', auth, async (req, reply) => {
    if (limited(reply, inviteLimit(req.ip))) return;
    const token = tokenOf(req), me = uidOf(req);
    if (!token) return reply.code(404).send({ error: 'not_found' });
    const res = await tx(pool, async c => {
      const inv = (await c.query('SELECT * FROM invites WHERE token_hash = $1 FOR UPDATE', [hashToken(token)])).rows[0];
      if (!inv) return { code: 404, body: { error: 'not_found' } };
      const student = (await c.query('SELECT id, name, avatar_etag FROM users WHERE id = $1', [inv.student_id])).rows[0];
      const who = { id: String(student.id), name: firstName(student.name), avatar: avatarPath(student.id, student.avatar_etag) };
      if (Number(inv.student_id) === Number(me)) return { code: 400, body: { error: 'own_invite' } };
      const existing = (await c.query('SELECT 1 FROM supporter_links WHERE student_id = $1 AND supporter_id = $2', [inv.student_id, me])).rows[0];
      if (existing) return { code: 200, body: { ok: true, already: true, student: who } };   // re-opening the link doesn't burn a use
      const st = inviteRow(inv).status;
      if (st !== 'open') return { code: 410, body: { error: st } };
      const n = Number((await c.query('SELECT count(*) FROM supporter_links WHERE student_id = $1', [inv.student_id])).rows[0].count);
      if (n >= MAX_SUPPORTERS) return { code: 409, body: { error: 'too_many_supporters' } };
      await c.query('UPDATE invites SET uses = uses + 1 WHERE id = $1', [inv.id]);
      await c.query('INSERT INTO supporter_links (student_id, supporter_id, relation, label, invite_id) VALUES ($1,$2,$3,$4,$5)', [inv.student_id, me, inv.relation, inv.label, inv.id]);
      await c.query('UPDATE users SET is_supporter = TRUE WHERE id = $1', [me]);
      return { code: 200, body: { ok: true, student: who } };
    });
    if (res.code === 200 && !(res.body as { already?: boolean }).already) req.log.info({ supporterId: String(me) }, 'supporter linked');
    return reply.code(res.code).send(res.body);
  });

  /** the kids I cheer for */
  app.get('/api/kids', auth, async req => {
    const links = (await pool.query(`SELECT l.*, u.name, u.avatar_etag FROM supporter_links l JOIN users u ON u.id = l.student_id WHERE l.supporter_id = $1 ORDER BY l.created_at`, [uidOf(req)])).rows;
    return { kids: await Promise.all(links.map(l => kidSummary(l, uidOf(req), false))) };
  });
  app.get<{ Params: { id: string } }>('/api/kids/:id', auth, async (req, reply) => {
    const link = await linkFor(uidOf(req), req.params.id);
    if (!link) return reply.code(403).send({ error: 'not_linked' });
    return { kid: await kidSummary(link, uidOf(req), true) };
  });
  /** toggle a reaction: { kind, id, reaction, on } */
  app.post<{ Params: { id: string } }>('/api/kids/:id/react', auth, async (req, reply) => {
    if (limited(reply, reactLimit(String(uidOf(req))))) return;
    const link = await linkFor(uidOf(req), req.params.id);
    if (!link) return reply.code(403).send({ error: 'not_linked' });
    const b = (req.body || {}) as Record<string, unknown>;
    const kind = b.kind as TargetKind, id = typeof b.id === 'string' ? b.id.slice(0, 40) : '', reaction = b.reaction as string, on = b.on !== false;
    if (!(TARGET_KINDS as readonly string[]).includes(kind) || !id || !REACTIONS.includes(reaction)) return reply.code(400).send({ error: 'invalid' });
    // the target must exist AND be visible to this supporter right now
    const sid = Number(link.student_id);
    if (kind === 'report') {
      if (!link.show_results) return reply.code(403).send({ error: 'hidden' });
      const c = /^\d{1,18}$/.test(id) ? (await pool.query('SELECT 1 FROM report_cards WHERE user_id = $1 AND id = $2', [sid, id])).rows[0] : null;
      if (!c) return reply.code(404).send({ error: 'not_found' });
    } else if (kind === 'result') {
      if (!link.show_results) return reply.code(403).send({ error: 'hidden' });
      const t = (await pool.query('SELECT 1 FROM tests WHERE user_id = $1 AND id = $2 AND NOT deleted AND result IS NOT NULL', [sid, id])).rows[0];
      if (!t) return reply.code(404).send({ error: 'not_found' });
    } else {
      if (!link.show_practice) return reply.code(403).send({ error: 'hidden' });
      const { progress } = await loadStudent(pool, sid);
      if (!milestonesOf(progress).some(m => m.kind === kind && m.id === id)) return reply.code(404).send({ error: 'not_found' });
    }
    await tx(pool, async c => {
      if (!on) { await c.query('DELETE FROM reactions WHERE student_id = $1 AND supporter_id = $2 AND target_kind = $3 AND target_id = $4 AND reaction = $5', [sid, uidOf(req), kind, id, reaction]); return; }
      // one preset message per target: a new one replaces the old
      if (reaction.startsWith('msg:')) await c.query(`DELETE FROM reactions WHERE student_id = $1 AND supporter_id = $2 AND target_kind = $3 AND target_id = $4 AND reaction LIKE 'msg:%'`, [sid, uidOf(req), kind, id]);
      await c.query('INSERT INTO reactions (student_id, supporter_id, target_kind, target_id, reaction) VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING', [sid, uidOf(req), kind, id, reaction]);
    });
    const rc = await reactionCounts(sid, uidOf(req));
    return { reactions: rc(targetKey(kind, id)) };
  });
}
