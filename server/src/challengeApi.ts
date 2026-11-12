/* Cooperative weekly goal for a shared plan. Counts only. No ranking. */
import crypto from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { WEEKLY_TARGET, addUnits, contributionList, groupTotal, reached, weekKey } from '../../shared/challenge';

const newId = () => crypto.randomBytes(9).toString('base64url');

async function ensure(pool: pg.Pool, planId: string) {
  const week = weekKey();
  const id = newId();
  await pool.query(`INSERT INTO plan_challenges (id, plan_id, week, target, title)
    VALUES ($1,$2,$3,$4,$5) ON CONFLICT (plan_id, week) DO NOTHING`,
    [id, planId, week, WEEKLY_TARGET, 'Diese Woche schaffen wir zusammen 20 Einheiten']);
  return (await pool.query('SELECT * FROM plan_challenges WHERE plan_id = $1 AND week = $2', [planId, week])).rows[0];
}

async function view(pool: pg.Pool, challengeId: string, uid: number) {
  const rows = (await pool.query(`SELECT COALESCE(p.units, 0) AS units, COALESCE(p.opted_out, FALSE) AS opted_out, m.user_id, m.display_name
    FROM shared_plan_members m
    JOIN plan_challenges c ON c.id = $1 AND c.plan_id = m.plan_id
    LEFT JOIN challenge_progress p ON p.challenge_id = c.id AND p.user_id = m.user_id
    WHERE m.left_at IS NULL`, [challengeId])).rows;
  const people = contributionList(rows.map(r => ({
    name: String(r.display_name || ''),
    units: Number(r.units || 0),
    optedOut: !!r.opted_out,
    me: Number(r.user_id) === uid
  })));
  const total = groupTotal(people);
  const ch = (await pool.query('SELECT target, week, title FROM plan_challenges WHERE id = $1', [challengeId])).rows[0];
  const target = Number(ch.target);
  return { week: ch.week, title: ch.title, target, total, reached: reached(total, target), people };
}

export async function challengePlugin(app: FastifyInstance, { pool }: { pool: pg.Pool }) {
  const member = async (planId: string, uid: number) =>
    (await pool.query('SELECT 1 FROM shared_plan_members WHERE plan_id = $1 AND user_id = $2 AND left_at IS NULL', [planId, uid])).rowCount;

  app.get<{ Params: { id: string } }>('/api/plans/:id/challenge', { preHandler: app.requireUser }, async (req, reply) => {
    if (!(await member(req.params.id, req.user!.id))) return reply.code(404).send({ error: 'not_found' });
    const ch = await ensure(pool, req.params.id);
    return view(pool, ch.id, req.user!.id);
  });

  app.post<{ Params: { id: string } }>('/api/plans/:id/challenge', { preHandler: app.requireUser }, async (req, reply) => {
    const uid = req.user!.id;
    if (!(await member(req.params.id, uid))) return reply.code(404).send({ error: 'not_found' });
    const ch = await ensure(pool, req.params.id);
    const mine = (await pool.query('SELECT units, opted_out FROM challenge_progress WHERE challenge_id = $1 AND user_id = $2', [ch.id, uid])).rows[0];
    const units = addUnits(Number(mine?.units || 0), Number((req.body as { units?: unknown } | null)?.units), !!mine?.opted_out);
    await pool.query(`INSERT INTO challenge_progress (challenge_id, user_id, units) VALUES ($1,$2,$3)
      ON CONFLICT (challenge_id, user_id) DO UPDATE SET units = EXCLUDED.units`, [ch.id, uid, units]);
    return view(pool, ch.id, uid);
  });

  app.post<{ Params: { id: string } }>('/api/plans/:id/challenge/opt', { preHandler: app.requireUser }, async (req, reply) => {
    const uid = req.user!.id;
    if (!(await member(req.params.id, uid))) return reply.code(404).send({ error: 'not_found' });
    const ch = await ensure(pool, req.params.id);
    const out = (req.body as { out?: unknown } | null)?.out !== false;
    await pool.query(`INSERT INTO challenge_progress (challenge_id, user_id, units, opted_out) VALUES ($1,$2,0,$3)
      ON CONFLICT (challenge_id, user_id) DO UPDATE SET opted_out = EXCLUDED.opted_out`, [ch.id, uid, out]);
    return view(pool, ch.id, uid);
  });
}
