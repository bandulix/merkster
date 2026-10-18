/* Class boss fights + 1v1 vocab clashes.
   Boss damage is claimed after a practice session on a taken share.
   Clash answers are graded on the server against the share snapshot. */
import crypto from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type pg from 'pg';
import type { Config } from './config';
import { tx } from './db';
import { avatarPath } from './avatars';
import { limiter } from './ratelimit';
import { ID_RE } from './sanitize';
import {
  BOSS_DAYS_DEFAULT, BOSS_HIT_MAX, CLASH_CARDS_DEFAULT, CLASH_CARDS_MAX, CLASH_CARDS_MIN, CLASH_EXPIRE_HOURS,
  bossMaxHp, clashAnswerOk, pickClashPositions
} from '../../shared/classes';

type Q = pg.Pool | pg.PoolClient;
const CLASS_ID = /^[A-Za-z0-9_-]{8,16}$/;
const newId = () => crypto.randomBytes(9).toString('base64url');
const firstName = (n: string) => (n || '').trim().split(/\s+/)[0] || '';

async function membership(pool: Q, uid: number, id: string) {
  if (!CLASS_ID.test(id)) return null;
  return (await pool.query(`SELECT c.*, (c.owner_id = $2) AS is_owner
    FROM classes c JOIN class_members m ON m.class_id = c.id AND m.user_id = $2 WHERE c.id = $1`, [id, uid])).rows[0] || null;
}

function person(r: { id: number | string; name: string; avatar_etag?: string | null }) {
  return { id: String(r.id), name: firstName(r.name), avatar: avatarPath(Number(r.id), r.avatar_etag) };
}

export async function classGamesPlugin(app: FastifyInstance, { pool }: { pool: pg.Pool; config: Config }) {
  const auth = { preHandler: app.requireUser };
  const uidOf = (req: FastifyRequest) => req.user!.id;
  const hitLimit = limiter(40, 10 * 60e3), clashLimit = limiter(20, 10 * 60e3), bossLimit = limiter(10, 60 * 60e3);
  const limited = (reply: FastifyReply, r: { ok: boolean; retryAfter?: number }) => {
    if (!r.ok) { reply.header('Retry-After', String(r.retryAfter)).code(429).send({ error: 'rate_limited' }); return true; }
    return false;
  };

  async function shapeBoss(c: Q, boss: Record<string, any>, uid: number) {
    const hits = await c.query(`SELECT h.user_id, h.damage, u.name, u.avatar_etag
      FROM class_boss_hits h JOIN users u ON u.id = h.user_id WHERE h.boss_id = $1`, [boss.id]);
    const byUser = new Map<number, { damage: number; name: string; avatar_etag: string | null }>();
    for (const h of hits.rows) {
      const id = Number(h.user_id);
      const cur = byUser.get(id) || { damage: 0, name: h.name, avatar_etag: h.avatar_etag };
      cur.damage += Number(h.damage);
      byUser.set(id, cur);
    }
    const contrib = [...byUser.entries()]
      .map(([id, v]) => ({ id: String(id), name: firstName(v.name), avatar: avatarPath(id, v.avatar_etag), damage: v.damage, me: id === uid }))
      .sort((a, b) => b.damage - a.damage || a.name.localeCompare(b.name, 'de'));
    const share = (await c.query(`SELECT s.id, s.name, s.card_count, s.test_date, t.test_id AS my_test
      FROM class_shares s LEFT JOIN class_share_takes t ON t.share_id = s.id AND t.user_id = $2
      WHERE s.id = $1`, [boss.share_id, uid])).rows[0];
    const now = Date.now();
    let status = boss.status as string;
    if (status === 'open' && new Date(boss.ends_at).getTime() < now) status = 'expired';
    return {
      id: boss.id as string,
      shareId: boss.share_id as string,
      shareName: share?.name || boss.name || '',
      cards: Number(share?.card_count || 0),
      testDate: share?.test_date ? String(share.test_date).slice(0, 10) : null,
      myTestId: share?.my_test || null,
      maxHp: Number(boss.max_hp),
      hp: status === 'expired' ? Number(boss.hp) : Number(boss.hp),
      status: status === 'expired' && boss.status === 'open' ? 'expired' : boss.status,
      endsAt: new Date(boss.ends_at).toISOString(),
      wonAt: boss.won_at ? new Date(boss.won_at).toISOString() : null,
      createdBy: String(boss.created_by),
      contributors: contrib
    };
  }

  app.get<{ Params: { id: string } }>('/api/classes/:id/boss', auth, async (req, reply) => {
    const cls = await membership(pool, uidOf(req), req.params.id);
    if (!cls) return reply.code(404).send({ error: 'not_found' });
    const open = (await pool.query(`SELECT * FROM class_bosses WHERE class_id = $1 AND status = 'open' ORDER BY created_at DESC LIMIT 1`, [cls.id])).rows[0];
    if (open && new Date(open.ends_at).getTime() < Date.now()) {
      await pool.query(`UPDATE class_bosses SET status = 'cancelled' WHERE id = $1 AND status = 'open'`, [open.id]);
      return { boss: await shapeBoss(pool, { ...open, status: 'cancelled' }, uidOf(req)) };
    }
    if (open) return { boss: await shapeBoss(pool, open, uidOf(req)) };
    const last = (await pool.query(`SELECT * FROM class_bosses WHERE class_id = $1 ORDER BY created_at DESC LIMIT 1`, [cls.id])).rows[0];
    return { boss: last ? await shapeBoss(pool, last, uidOf(req)) : null };
  });

  app.post<{ Params: { id: string } }>('/api/classes/:id/boss', auth, async (req, reply) => {
    if (limited(reply, bossLimit(String(uidOf(req))))) return;
    const cls = await membership(pool, uidOf(req), req.params.id);
    if (!cls) return reply.code(404).send({ error: 'not_found' });
    const shareId = (req.body as { shareId?: unknown } | null)?.shareId;
    if (typeof shareId !== 'string' || !CLASS_ID.test(shareId)) return reply.code(400).send({ error: 'bad_share' });
    const share = (await pool.query('SELECT id, name, card_count, test_date FROM class_shares WHERE id = $1 AND class_id = $2', [shareId, cls.id])).rows[0];
    if (!share) return reply.code(404).send({ error: 'not_found' });
    const open = (await pool.query(`SELECT id FROM class_bosses WHERE class_id = $1 AND status = 'open'`, [cls.id])).rows[0];
    if (open) return reply.code(409).send({ error: 'boss_open' });
    const maxHp = bossMaxHp(share.card_count);
    const testEnd = share.test_date ? new Date(String(share.test_date) + 'T23:59:59.000Z') : null;
    const fallback = new Date(Date.now() + BOSS_DAYS_DEFAULT * 864e5);
    const endsAt = testEnd && testEnd.getTime() > Date.now() ? testEnd : fallback;
    const id = newId();
    try {
      const row = (await pool.query(
        `INSERT INTO class_bosses (id, class_id, share_id, created_by, name, max_hp, hp, ends_at)
         VALUES ($1,$2,$3,$4,$5,$6,$6,$7) RETURNING *`,
        [id, cls.id, share.id, uidOf(req), share.name, maxHp, endsAt.toISOString()]
      )).rows[0];
      return reply.code(201).send({ boss: await shapeBoss(pool, row, uidOf(req)) });
    } catch (e) {
      if ((e as { code?: string }).code === '23505') return reply.code(409).send({ error: 'boss_open' });
      throw e;
    }
  });

  app.post<{ Params: { id: string; bossId: string } }>('/api/classes/:id/boss/:bossId/hit', auth, async (req, reply) => {
    if (limited(reply, hitLimit(String(uidOf(req))))) return;
    const cls = await membership(pool, uidOf(req), req.params.id);
    if (!cls || !CLASS_ID.test(req.params.bossId)) return reply.code(404).send({ error: 'not_found' });
    const b = (req.body || {}) as Record<string, unknown>;
    const sessionId = typeof b.sessionId === 'string' && ID_RE.test(b.sessionId) ? b.sessionId : null;
    const testId = typeof b.testId === 'string' && ID_RE.test(b.testId) ? b.testId : null;
    const damage = Math.min(BOSS_HIT_MAX, Math.max(0, Math.round(Number(b.damage) || 0)));
    if (!sessionId || !testId || damage < 1) return reply.code(400).send({ error: 'bad_hit' });
    try {
      const result = await tx(pool, async c => {
        const boss = (await c.query(`SELECT * FROM class_bosses WHERE id = $1 AND class_id = $2 FOR UPDATE`, [req.params.bossId, cls.id])).rows[0];
        if (!boss) return { error: 'not_found' as const };
        if (boss.status !== 'open') return { error: 'boss_closed' as const };
        if (new Date(boss.ends_at).getTime() < Date.now()) {
          await c.query(`UPDATE class_bosses SET status = 'cancelled' WHERE id = $1`, [boss.id]);
          return { error: 'boss_closed' as const };
        }
        const take = (await c.query(
          `SELECT test_id FROM class_share_takes WHERE share_id = $1 AND user_id = $2`,
          [boss.share_id, uidOf(req)]
        )).rows[0];
        if (!take || take.test_id !== testId) return { error: 'not_taken' as const };
        const ins = await c.query(
          `INSERT INTO class_boss_hits (boss_id, user_id, session_id, damage) VALUES ($1,$2,$3,$4)
           ON CONFLICT (boss_id, user_id, session_id) DO NOTHING RETURNING id`,
          [boss.id, uidOf(req), sessionId, damage]
        );
        if (!ins.rowCount) {
          return { boss: await shapeBoss(c, boss, uidOf(req)), applied: 0 };
        }
        const deal = Math.min(damage, Number(boss.hp));
        const up = (await c.query(
          `UPDATE class_bosses SET hp = hp - $2,
            status = CASE WHEN hp - $2 <= 0 THEN 'won' ELSE status END,
            won_at = CASE WHEN hp - $2 <= 0 THEN now() ELSE won_at END
           WHERE id = $1 AND status = 'open' RETURNING *`,
          [boss.id, deal]
        )).rows[0];
        return { boss: await shapeBoss(c, up || boss, uidOf(req)), applied: deal };
      });
      if ('error' in result) {
        const code = result.error === 'not_found' ? 404 : result.error === 'not_taken' ? 403 : 409;
        return reply.code(code).send({ error: result.error });
      }
      return result;
    } catch (e) {
      req.log.warn({ err: (e as Error).message }, 'boss hit failed');
      return reply.code(400).send({ error: 'bad_hit' });
    }
  });

  app.post<{ Params: { id: string; bossId: string } }>('/api/classes/:id/boss/:bossId/cancel', auth, async (req, reply) => {
    const cls = await membership(pool, uidOf(req), req.params.id);
    if (!cls || !CLASS_ID.test(req.params.bossId)) return reply.code(404).send({ error: 'not_found' });
    const r = await pool.query(
      `UPDATE class_bosses SET status = 'cancelled' WHERE id = $1 AND class_id = $2 AND status = 'open'
        AND (created_by = $3 OR $4) RETURNING *`,
      [req.params.bossId, cls.id, uidOf(req), cls.is_owner]
    );
    if (!r.rowCount) return reply.code(404).send({ error: 'not_found' });
    return { boss: await shapeBoss(pool, r.rows[0], uidOf(req)) };
  });

  /* ---------- clashes ---------- */

  async function shapeClash(c: Q, row: Record<string, any>, uid: number, withCards = false) {
    const [challenger, opponent, plays, share] = await Promise.all([
      c.query('SELECT id, name, avatar_etag FROM users WHERE id = $1', [row.challenger_id]),
      c.query('SELECT id, name, avatar_etag FROM users WHERE id = $1', [row.opponent_id]),
      c.query('SELECT user_id, correct, ms, finished_at FROM class_clash_plays WHERE clash_id = $1', [row.id]),
      c.query('SELECT id, name, card_count FROM class_shares WHERE id = $1', [row.share_id])
    ]);
    let status = row.status as string;
    if ((status === 'pending' || status === 'active') && new Date(row.expires_at).getTime() < Date.now()) status = 'expired';
    const playMap = new Map(plays.rows.map((p: any) => [Number(p.user_id), p]));
    const mine = playMap.get(uid);
    const theirs = [...playMap.values()].find((p: any) => Number(p.user_id) !== uid);
    const out: Record<string, unknown> = {
      id: row.id,
      shareId: row.share_id,
      shareName: share.rows[0]?.name || '',
      cards: Number(row.card_count),
      status,
      expiresAt: new Date(row.expires_at).toISOString(),
      createdAt: new Date(row.created_at).toISOString(),
      challenger: person(challenger.rows[0]),
      opponent: person(opponent.rows[0]),
      me: uid === Number(row.challenger_id) ? 'challenger' : uid === Number(row.opponent_id) ? 'opponent' : null,
      myPlay: mine ? { correct: Number(mine.correct), ms: Number(mine.ms), done: !!mine.finished_at } : null,
      theirPlay: theirs && (status === 'done' || mine?.finished_at) ? { correct: Number(theirs.correct), ms: Number(theirs.ms), done: !!theirs.finished_at } : null
    };
    if (withCards && (uid === Number(row.challenger_id) || uid === Number(row.opponent_id)) && (status === 'active' || status === 'done' || status === 'pending')) {
      const all = (await c.query(
        'SELECT position, type, term, meaning FROM class_share_cards WHERE share_id = $1 ORDER BY position',
        [row.share_id]
      )).rows;
      const positions = pickClashPositions(all.length, Number(row.card_count), row.seed as string);
      const byPos = new Map(all.map((x: any) => [Number(x.position), x]));
      out.prompts = positions.map(p => {
        const card = byPos.get(p)!;
        return { position: p, type: card.type, term: card.term, ...(status === 'done' || mine?.finished_at ? { meaning: card.meaning } : {}) };
      });
    }
    if (status === 'done') {
      const a = playMap.get(Number(row.challenger_id));
      const b = playMap.get(Number(row.opponent_id));
      if (a && b) {
        const ac = Number(a.correct), bc = Number(b.correct);
        const am = Number(a.ms), bm = Number(b.ms);
        out.winnerId = ac > bc ? String(row.challenger_id) : bc > ac ? String(row.opponent_id)
          : am < bm ? String(row.challenger_id) : bm < am ? String(row.opponent_id) : null;
      }
    }
    return out;
  }

  app.get<{ Params: { id: string } }>('/api/classes/:id/clashes', auth, async (req, reply) => {
    const cls = await membership(pool, uidOf(req), req.params.id);
    if (!cls) return reply.code(404).send({ error: 'not_found' });
    const uid = uidOf(req);
    const rows = (await pool.query(
      `SELECT * FROM class_clashes WHERE class_id = $1
        AND (challenger_id = $2 OR opponent_id = $2 OR status IN ('pending','active'))
        AND created_at > now() - interval '14 days'
       ORDER BY created_at DESC LIMIT 30`,
      [cls.id, uid]
    )).rows;
    const clashes = [];
    for (const r of rows) clashes.push(await shapeClash(pool, r, uid));
    return { clashes };
  });

  app.post<{ Params: { id: string } }>('/api/classes/:id/clashes', auth, async (req, reply) => {
    if (limited(reply, clashLimit(String(uidOf(req))))) return;
    const cls = await membership(pool, uidOf(req), req.params.id);
    if (!cls) return reply.code(404).send({ error: 'not_found' });
    const b = (req.body || {}) as Record<string, unknown>;
    const shareId = typeof b.shareId === 'string' && CLASS_ID.test(b.shareId) ? b.shareId : null;
    const opponentId = typeof b.opponentId === 'string' && /^\d{1,18}$/.test(b.opponentId) ? Number(b.opponentId) : NaN;
    const cardCount = Math.min(CLASH_CARDS_MAX, Math.max(CLASH_CARDS_MIN, Math.round(Number(b.cardCount) || CLASH_CARDS_DEFAULT)));
    if (!shareId || !Number.isFinite(opponentId)) return reply.code(400).send({ error: 'bad_clash' });
    if (opponentId === uidOf(req)) return reply.code(400).send({ error: 'bad_opponent' });
    const share = (await pool.query('SELECT id, card_count FROM class_shares WHERE id = $1 AND class_id = $2', [shareId, cls.id])).rows[0];
    if (!share) return reply.code(404).send({ error: 'not_found' });
    if (Number(share.card_count) < CLASH_CARDS_MIN) return reply.code(422).send({ error: 'too_few_cards' });
    const opp = (await pool.query('SELECT user_id FROM class_members WHERE class_id = $1 AND user_id = $2', [cls.id, opponentId])).rows[0];
    if (!opp) return reply.code(404).send({ error: 'not_member' });
    const open = (await pool.query(
      `SELECT id FROM class_clashes WHERE class_id = $1 AND status IN ('pending','active')
        AND ((challenger_id = $2 AND opponent_id = $3) OR (challenger_id = $3 AND opponent_id = $2))`,
      [cls.id, uidOf(req), opponentId]
    )).rows[0];
    if (open) return reply.code(409).send({ error: 'clash_open' });
    const id = newId();
    const seed = crypto.randomBytes(12).toString('base64url');
    const n = Math.min(cardCount, Number(share.card_count));
    const row = (await pool.query(
      `INSERT INTO class_clashes (id, class_id, share_id, challenger_id, opponent_id, card_count, seed, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7, now() + make_interval(hours => $8)) RETURNING *`,
      [id, cls.id, share.id, uidOf(req), opponentId, n, seed, CLASH_EXPIRE_HOURS]
    )).rows[0];
    return reply.code(201).send({ clash: await shapeClash(pool, row, uidOf(req)) });
  });

  app.post<{ Params: { id: string; clashId: string } }>('/api/classes/:id/clashes/:clashId/accept', auth, async (req, reply) => {
    const cls = await membership(pool, uidOf(req), req.params.id);
    if (!cls || !CLASS_ID.test(req.params.clashId)) return reply.code(404).send({ error: 'not_found' });
    const r = await pool.query(
      `UPDATE class_clashes SET status = 'active' WHERE id = $1 AND class_id = $2 AND opponent_id = $3
        AND status = 'pending' AND expires_at > now() RETURNING *`,
      [req.params.clashId, cls.id, uidOf(req)]
    );
    if (!r.rowCount) return reply.code(404).send({ error: 'not_found' });
    return { clash: await shapeClash(pool, r.rows[0], uidOf(req), true) };
  });

  app.post<{ Params: { id: string; clashId: string } }>('/api/classes/:id/clashes/:clashId/decline', auth, async (req, reply) => {
    const cls = await membership(pool, uidOf(req), req.params.id);
    if (!cls || !CLASS_ID.test(req.params.clashId)) return reply.code(404).send({ error: 'not_found' });
    const r = await pool.query(
      `UPDATE class_clashes SET status = 'declined' WHERE id = $1 AND class_id = $2 AND opponent_id = $3
        AND status = 'pending' RETURNING *`,
      [req.params.clashId, cls.id, uidOf(req)]
    );
    if (!r.rowCount) return reply.code(404).send({ error: 'not_found' });
    return { clash: await shapeClash(pool, r.rows[0], uidOf(req)) };
  });

  app.get<{ Params: { id: string; clashId: string } }>('/api/classes/:id/clashes/:clashId', auth, async (req, reply) => {
    const cls = await membership(pool, uidOf(req), req.params.id);
    if (!cls || !CLASS_ID.test(req.params.clashId)) return reply.code(404).send({ error: 'not_found' });
    const row = (await pool.query('SELECT * FROM class_clashes WHERE id = $1 AND class_id = $2', [req.params.clashId, cls.id])).rows[0];
    if (!row) return reply.code(404).send({ error: 'not_found' });
    const uid = uidOf(req);
    if (uid !== Number(row.challenger_id) && uid !== Number(row.opponent_id)) return reply.code(403).send({ error: 'not_player' });
    return { clash: await shapeClash(pool, row, uid, true) };
  });

  app.post<{ Params: { id: string; clashId: string } }>('/api/classes/:id/clashes/:clashId/submit', auth, async (req, reply) => {
    if (limited(reply, clashLimit(String(uidOf(req))))) return;
    const cls = await membership(pool, uidOf(req), req.params.id);
    if (!cls || !CLASS_ID.test(req.params.clashId)) return reply.code(404).send({ error: 'not_found' });
    const uid = uidOf(req);
    const b = (req.body || {}) as Record<string, unknown>;
    const answers = Array.isArray(b.answers) ? b.answers : null;
    const ms = Math.min(3_600_000, Math.max(0, Math.round(Number(b.ms) || 0)));
    if (!answers) return reply.code(400).send({ error: 'bad_answers' });
    try {
      const result = await tx(pool, async c => {
        const row = (await c.query(`SELECT * FROM class_clashes WHERE id = $1 AND class_id = $2 FOR UPDATE`, [req.params.clashId, cls.id])).rows[0];
        if (!row) return { error: 'not_found' as const };
        if (uid !== Number(row.challenger_id) && uid !== Number(row.opponent_id)) return { error: 'not_player' as const };
        if (row.status === 'pending') {
          if (uid !== Number(row.challenger_id)) return { error: 'not_active' as const };
          await c.query(`UPDATE class_clashes SET status = 'active' WHERE id = $1 AND status = 'pending'`, [row.id]);
          row.status = 'active';
        }
        if (row.status !== 'active') return { error: 'not_active' as const };
        if (new Date(row.expires_at).getTime() < Date.now()) {
          await c.query(`UPDATE class_clashes SET status = 'expired' WHERE id = $1`, [row.id]);
          return { error: 'expired' as const };
        }
        const existing = (await c.query('SELECT 1 FROM class_clash_plays WHERE clash_id = $1 AND user_id = $2 AND finished_at IS NOT NULL', [row.id, uid])).rows[0];
        if (existing) return { error: 'already_played' as const };
        const all = (await c.query('SELECT position, meaning FROM class_share_cards WHERE share_id = $1', [row.share_id])).rows;
        const byPos = new Map(all.map((x: any) => [Number(x.position), String(x.meaning)]));
        const positions = pickClashPositions(all.length, Number(row.card_count), row.seed as string);
        const want = new Set(positions);
        const graded: { position: number; value: string; ok: boolean }[] = [];
        let correct = 0;
        for (const a of answers.slice(0, CLASH_CARDS_MAX)) {
          if (!a || typeof a !== 'object') continue;
          const pos = Math.round(Number((a as { position?: unknown }).position));
          const value = typeof (a as { value?: unknown }).value === 'string' ? (a as { value: string }).value.slice(0, 400) : '';
          if (!want.has(pos) || graded.some(g => g.position === pos)) continue;
          const expected = byPos.get(pos) || '';
          const ok = clashAnswerOk(expected, value);
          if (ok) correct++;
          graded.push({ position: pos, value, ok });
        }
        await c.query(
          `INSERT INTO class_clash_plays (clash_id, user_id, correct, answers, ms, finished_at)
           VALUES ($1,$2,$3,$4::jsonb,$5, now())
           ON CONFLICT (clash_id, user_id) DO UPDATE SET correct = EXCLUDED.correct, answers = EXCLUDED.answers, ms = EXCLUDED.ms, finished_at = now()`,
          [row.id, uid, correct, JSON.stringify(graded), ms]
        );
        const both = Number((await c.query(
          `SELECT count(*) FROM class_clash_plays WHERE clash_id = $1 AND finished_at IS NOT NULL`, [row.id]
        )).rows[0].count);
        if (both >= 2) await c.query(`UPDATE class_clashes SET status = 'done' WHERE id = $1`, [row.id]);
        const fresh = (await c.query('SELECT * FROM class_clashes WHERE id = $1', [row.id])).rows[0];
        return { clash: await shapeClash(c, fresh, uid, true) };
      });
      if ('error' in result && typeof (result as { error?: unknown }).error === 'string') {
        const err = (result as { error: string }).error;
        const map: Record<string, number> = { not_found: 404, not_player: 403, not_active: 409, expired: 409, already_played: 409 };
        return reply.code(map[err] || 400).send({ error: err });
      }
      return result;
    } catch (e) {
      req.log.warn({ err: (e as Error).message }, 'clash submit failed');
      return reply.code(400).send({ error: 'bad_answers' });
    }
  });
}
