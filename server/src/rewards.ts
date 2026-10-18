/* Merkster – supporter rewards. IMPORTANT: Merkster only keeps track of PROMISES ("Oma owes you 5 €").
   It never processes, holds or moves money. Results are self-reported by the student; a supporter may
   mark a result as "verified" (e.g. after seeing the test paper). All access is checked server-side:
   rules are created by a linked supporter. Parents, grandparents, an aunt and an uncle can share one rule,
   or share every rule so a new one stays on both sides. Any of them can edit a shared rule, and an invite
   link can add a relative to one rule or to the whole set. Evaluation uses what the
   student currently shares with the rule's owner. */
import crypto from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type pg from 'pg';
import type { Config } from './config';
import { GRADE_SYSTEMS, SUBJECT_KEYS, type GradeSystem, type Subject } from '../../shared/types';
import { scoreOf } from '../../shared/grades';
import {
  CURRENCIES, evaluateRule, gradeTrigger, isRcKind, rcTrigger, totals, MAX_RULES_PER_LINK, monthOf, REWARD_TEXT_MAX, STREAK_OPTIONS,
  type EarnedView, type EvalInput, type PersonLite, type Reward, type RewardTrigger, type RuleView
} from '../../shared/rewards';
import { tx } from './db';
import { avatarPath } from './avatars';
import { loadStudent, milestonesOf } from './supporters';
import { loadCards } from './reportcards';
import { avgThreshold } from '../../shared/reportcards';
import { limiter } from './ratelimit';
import { FAMILY_RELATIONS, INVITE_DAYS_DEFAULT, INVITE_DAYS_MAX, INVITE_USES_MAX, MAX_OPEN_INVITES, isFamilyRelation, MAX_JOINT_MEMBERS } from '../../shared/supporters';

type Q = pg.Pool | pg.PoolClient;
const ID_NUM = /^\d{1,18}$/;
const TEST_ID = /^[A-Za-z0-9_-]{4,64}$/;
const firstName = (n: string) => (n || '').trim().split(/\s+/)[0] || '';
const ms = (d: unknown) => (d ? new Date(d as string).getTime() : null);
const RESULT_KINDS = ['grade', 'personal_best', 'improvement'];
export const PHOTO_MAX = 2.5 * 1024 * 1024;

/** the student's grading system (profile setting), default German grades */
export async function gradingOf(q: Q, studentId: number | string): Promise<GradeSystem> {
  const r = (await q.query(`SELECT data->'settings'->>'grading' AS g FROM profiles WHERE user_id = $1`, [studentId])).rows[0];
  return GRADE_SYSTEMS.includes(r?.g) ? r.g : 'de_grade';
}

/* ---------- validation of what a supporter sends ---------- */
export function cleanTrigger(v: unknown): RewardTrigger | null {
  const o = (v || {}) as Record<string, unknown>;
  const subject = SUBJECT_KEYS.includes(o.subject as Subject) ? (o.subject as Subject) : null;
  switch (o.kind) {
    case 'grade': {
      if (!GRADE_SYSTEMS.includes(o.system as GradeSystem) || typeof o.value !== 'number') return null;
      return gradeTrigger(o.system as GradeSystem, o.value, o.mode === 'exactly' ? 'exactly' : 'at_least', subject);
    }
    case 'personal_best': return { kind: 'personal_best', subject };
    case 'improvement': { const d = Number(o.minDelta) || 0; return d >= 0 && d <= 50 ? { kind: 'improvement', subject, minDelta: Math.round(d) } : null; }
    case 'streak': return STREAK_OPTIONS.includes(Number(o.days)) ? { kind: 'streak', days: Number(o.days) } : null;
    case 'level': { const l = Math.round(Number(o.level)); return l >= 2 && l <= 200 ? { kind: 'level', level: l } : null; }
    default: {
      if (typeof o.kind !== 'string' || !isRcKind(o.kind)) return null;
      const subjectId = typeof o.subjectId === 'string' && /^(c_[a-z0-9-]{1,40}|[a-z]{1,20})$/.test(o.subjectId) ? o.subjectId : null;
      const system = GRADE_SYSTEMS.includes(o.system as GradeSystem) ? (o.system as GradeSystem) : undefined;
      const when = o.when === 'final' ? 'final' as const : 'any' as const;
      return rcTrigger(o.kind, { system, value: typeof o.value === 'number' ? o.value : undefined, mode: o.mode === 'exactly' ? 'exactly' : 'at_least', subjectId, minDelta: Number(o.minDelta) || 0, when }, avgThreshold);
    }
  }
}
export function cleanReward(v: unknown): Reward | null {
  const o = (v || {}) as Record<string, unknown>;
  if (o.type === 'money') {
    const amount = Math.round(Number(o.amount) * 100) / 100;
    if (!(amount >= 0.01 && amount <= 1000)) return null;
    return { type: 'money', amount, currency: (CURRENCIES as readonly string[]).includes(o.currency as string) ? (o.currency as (typeof CURRENCIES)[number]) : 'EUR' };
  }
  if (o.type === 'other') {
    const text = typeof o.text === 'string' ? o.text.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, REWARD_TEXT_MAX) : '';
    return text ? { type: 'other', text } : null;
  }
  return null;
}
const cleanCap = (v: unknown) => { const n = Math.round(Number(v)); return v === null || v === undefined || v === '' || !n ? null : n >= 1 && n <= 100 ? n : undefined; };
const MIN_VALID_AS_OF = Date.UTC(2000, 0, 1);
/** Earliest earnable moment. Accepts ms since epoch or `YYYY-MM-DD` (UTC midnight). Omitted → null (DB/now). Invalid → undefined. */
export function cleanValidAsOf(v: unknown, now = Date.now()): number | null | undefined {
  if (v === null || v === undefined || v === '') return null;
  let ts: number;
  if (typeof v === 'number') ts = v;
  else if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const [y, m, d] = v.split('-').map(Number);
    ts = Date.UTC(y, m - 1, d);
  } else if (typeof v === 'string' && v.trim()) ts = Date.parse(v);
  else return undefined;
  if (!Number.isFinite(ts)) return undefined;
  const max = now + 864e5; // allow "tomorrow" for timezone skew
  if (ts < MIN_VALID_AS_OF || ts > max) return undefined;
  return Math.round(ts);
}
/** ordered pair for reward_sync (the smaller id first). Same id, or anything that is not an id, is not a pair. */
export function syncPair(left: string, right: string): [string, string] | null {
  if (!ID_NUM.test(left) || !ID_NUM.test(right) || left === right) return null;
  return BigInt(left) < BigInt(right) ? [left, right] : [right, left];
}
/** extra family members a supporter asked to put on a new rule (the owner is added separately) */
export function cleanMemberIds(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const x of v) {
    if (typeof x === 'string' && ID_NUM.test(x) && !out.includes(x)) out.push(x);
    if (out.length >= MAX_JOINT_MEMBERS - 1) break;
  }
  return out;
}
async function membersOf(q: Q, ruleIds: string[]): Promise<Map<string, PersonLite[]>> {
  const map = new Map<string, PersonLite[]>();
  if (!ruleIds.length) return map;
  const r = await q.query(`SELECT m.rule_id, m.supporter_id, l.relation, l.label, u.name, u.avatar_etag
      FROM reward_rule_members m
      JOIN supporter_links l ON l.student_id = m.student_id AND l.supporter_id = m.supporter_id
      JOIN users u ON u.id = m.supporter_id
      WHERE m.rule_id = ANY($1::bigint[]) ORDER BY m.joined_at`, [ruleIds]);
  for (const row of r.rows) {
    const id = String(row.rule_id);
    const list = map.get(id) || [];
    list.push(person(row.supporter_id, row.name, row.avatar_etag, row.relation, row.label));
    map.set(id, list);
  }
  return map;
}
async function addFamilyMember(q: Q, ruleId: string, studentId: number, supporterId: string): Promise<boolean> {
  const link = (await q.query('SELECT relation FROM supporter_links WHERE student_id = $1 AND supporter_id = $2', [studentId, supporterId])).rows[0];
  if (!link || !isFamilyRelation(link.relation)) return false;
  const n = Number((await q.query('SELECT count(*)::int AS n FROM reward_rule_members WHERE rule_id = $1', [ruleId])).rows[0].n);
  const already = (await q.query('SELECT 1 FROM reward_rule_members WHERE rule_id = $1 AND supporter_id = $2', [ruleId, supporterId])).rows[0];
  if (!already && n >= MAX_JOINT_MEMBERS) return false;
  await q.query('INSERT INTO reward_rule_members (rule_id, student_id, supporter_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [ruleId, studentId, supporterId]);
  return true;
}
/** everyone whose rewards stay fully in sync with this person, including them */
async function syncComponent(q: Q, studentId: number, supporterId: number): Promise<number[]> {
  const edges = (await q.query('SELECT a, b FROM reward_sync WHERE student_id = $1', [studentId])).rows;
  const adj = new Map<number, number[]>();
  for (const e of edges) {
    const a = Number(e.a), b = Number(e.b);
    adj.set(a, [...(adj.get(a) || []), b]);
    adj.set(b, [...(adj.get(b) || []), a]);
  }
  const out: number[] = [], seen = new Set<number>(), stack = [supporterId];
  while (stack.length) {
    const id = stack.pop()!;
    if (seen.has(id)) continue;
    seen.add(id); out.push(id);
    for (const n of adj.get(id) || []) if (!seen.has(n)) stack.push(n);
  }
  return out;
}
/** put these people, and anyone they keep in sync, onto one rule */
export async function expandRewardSync(q: Q, ruleId: string, studentId: number, seeds: string[]) {
  const ids = new Set<number>();
  for (const seed of seeds) {
    if (!ID_NUM.test(seed)) continue;
    ids.add(Number(seed));
    for (const id of await syncComponent(q, studentId, Number(seed))) ids.add(id);
  }
  for (const id of ids) await addFamilyMember(q, ruleId, studentId, String(id));
}
/** from now on these two relatives share every reward either of them is part of, including ones added later */
export async function linkRewardSync(q: Q, studentId: number, left: string | number, right: string | number): Promise<boolean> {
  const pair = syncPair(String(left), String(right));
  if (!pair) return false;
  const links = (await q.query('SELECT supporter_id, relation FROM supporter_links WHERE student_id = $1 AND supporter_id = ANY($2::bigint[])', [studentId, pair])).rows;
  if (links.length !== 2 || links.some(l => !isFamilyRelation(l.relation))) return false;
  await q.query('INSERT INTO reward_sync (student_id, a, b) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [studentId, pair[0], pair[1]]);
  const ids = await syncComponent(q, studentId, Number(pair[0]));
  const rules = (await q.query('SELECT DISTINCT rule_id FROM reward_rule_members WHERE student_id = $1 AND supporter_id = ANY($2::bigint[])', [studentId, ids])).rows;
  for (const rule of rules) for (const id of ids) await addFamilyMember(q, String(rule.rule_id), studentId, String(id));
  return true;
}
export async function unlinkRewardSync(q: Q, studentId: number, left: string, right: string) {
  const pair = syncPair(left, right);
  if (!pair) return;
  await q.query('DELETE FROM reward_sync WHERE student_id = $1 AND a = $2 AND b = $3', [studentId, pair[0], pair[1]]);
}
/** an invite that shares every reward pairs the new relative with the inviter, or with the whole family when the student sent it */
export async function joinInvitedShare(q: Q, studentId: number, supporterId: number, inviterId: unknown) {
  if (inviterId != null && ID_NUM.test(String(inviterId))) {
    await linkRewardSync(q, studentId, supporterId, inviterId as string | number);
    return;
  }
  const peers = (await q.query('SELECT supporter_id FROM supporter_links WHERE student_id = $1 AND supporter_id <> $2 AND relation = ANY($3::text[])', [studentId, supporterId, [...FAMILY_RELATIONS]])).rows;
  for (const p of peers) await linkRewardSync(q, studentId, supporterId, p.supporter_id);
}

/* ---------- evaluation (after every sync / result change) ---------- */
export async function evaluateRewards(pool: pg.Pool, studentId: number): Promise<number> {
  const rules = (await pool.query(`SELECT r.*, l.show_results, l.show_practice FROM reward_rules r
      JOIN supporter_links l ON l.student_id = r.student_id AND l.supporter_id = r.supporter_id WHERE r.student_id = $1 AND r.active`, [studentId])).rows;
  if (!rules.length) return 0;
  const [{ tests, history, progress }, cards] = await Promise.all([loadStudent(pool, studentId), loadCards(pool, studentId)]);
  const input: EvalInput = {
    reportCards: cards.map(c => ({ id: c.id, issuedOn: c.issuedOn, createdAt: c.createdAt, term: c.term, lines: c.lines.map(l => ({ subjectId: l.subjectId, score: l.score })), avgScore: c.avgScore })),
    results: tests.filter(t => t.result).map(t => ({ testId: t.id, subject: t.subject, score: scoreOf(t.result!), testDate: t.testDate, enteredAt: t.result!.enteredAt })),
    practiceDays: history.map(h => h.day),
    levelUps: milestonesOf(progress).filter(m => m.kind === 'level').map(m => ({ level: Number(m.id), at: m.at }))
  };
  let added = 0;
  await tx(pool, async c => {
    await c.query(`SELECT pg_advisory_xact_lock(hashtext('merkster-rewards'), $1::int)`, [studentId % 2147483647]);
    const earned = (await c.query('SELECT id, rule_id, source_key, status, earned_at FROM rewards_earned WHERE student_id = $1 AND rule_id = ANY($2::bigint[])', [studentId, rules.map(r => r.id)])).rows;
    for (const r of rules) {
      const trigger = r.trigger as RewardTrigger;
      // only evaluate what the student currently shares with this supporter
      if (RESULT_KINDS.includes(trigger.kind) || isRcKind(trigger.kind) ? !r.show_results : !r.show_practice) continue;
      const rule = {
        trigger, createdAt: new Date(r.created_at).getTime(),
        validAsOf: r.valid_as_of ? new Date(r.valid_as_of).getTime() : undefined,
        capPerMonth: r.cap_per_month as number | null
      };
      const srcs = evaluateRule({ ...rule, capPerMonth: null }, input);
      const keys = new Set(srcs.map(s => s.key));
      const mine = earned.filter(e => String(e.rule_id) === String(r.id));
      // a result that was edited/removed no longer earns – drop OPEN entries only (paid stays history)
      const gone = mine.filter(e => e.status === 'open' && !keys.has(e.source_key));
      if (gone.length) await c.query('DELETE FROM rewards_earned WHERE id = ANY($1::bigint[])', [gone.map(g => g.id)]);
      const keep = mine.filter(e => !gone.includes(e)).map(e => ({ key: e.source_key, at: new Date(e.earned_at).getTime() }));
      // same engine as the simulator: matches → monthly cap (what is already earned counts)
      for (const s of evaluateRule(rule, input, keep)) {
        const ins = await c.query(`INSERT INTO rewards_earned (rule_id, student_id, supporter_id, source_key, test_id, card_id, subject_id, trigger, reward, earned_at)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, to_timestamp($10 / 1000.0)) ON CONFLICT (rule_id, source_key) DO NOTHING`,
          [r.id, studentId, r.supporter_id, s.key, s.testId || null, s.cardId || null, s.subjectId || null, JSON.stringify(trigger), JSON.stringify(r.reward), s.at]);
        added += ins.rowCount || 0;
      }
    }
  });
  return added;
}
/** fire-and-forget wrapper: rewards must never break a sync */
export function evaluateSoon(pool: pg.Pool, studentId: number, log: { warn: (o: object, m: string) => void }) {
  evaluateRewards(pool, studentId).catch(err => log.warn({ err: String(err?.message || err) }, 'reward evaluation failed'));
}

/* ---------- views ---------- */
const person = (id: unknown, name: string, etag: string | null, relation = '', label = ''): PersonLite => ({ id: String(id), name: firstName(name), avatar: avatarPath(id as string, etag), relation, label });
const ruleView = (r: Record<string, any>, monthCount = 0): RuleView => ({
  id: String(r.id), supporterId: String(r.supporter_id), trigger: r.trigger, reward: r.reward, capPerMonth: r.cap_per_month, active: r.active,
  createdAt: new Date(r.created_at).getTime(),
  validAsOf: r.valid_as_of ? new Date(r.valid_as_of).getTime() : new Date(r.created_at).getTime(),
  earnedThisMonth: monthCount
});
const earnedView = (r: Record<string, any>, showTest: boolean, seenCol: 'seen_student_at' | 'seen_supporter_at'): EarnedView => ({
  id: String(r.id), ruleId: r.rule_id ? String(r.rule_id) : null, trigger: r.trigger, reward: r.reward, status: r.status, earnedAt: ms(r.earned_at)!, paidAt: ms(r.paid_at),
  sourceKey: r.source_key, testId: r.test_id, seen: !!r[seenCol],
  test: showTest && r.t_name ? { name: r.t_name, subject: r.t_subject, result: r.t_result || null } : null,
  cardId: r.card_id ? String(r.card_id) : null, subjectId: r.subject_id || null,
  card: showTest && r.c_issued ? { schoolYear: r.c_year, term: r.c_term, termLabel: r.c_label, issuedOn: r.c_issued, system: r.c_system, line: (r.c_lines || []).find((l: { subjectId: string }) => l.subjectId === r.subject_id) || null, avgScore: r.c_avg != null ? Number(r.c_avg) : null } : null
});

export async function rewardsExport(q: Q, uid: number) {
  const [rulesMine, rulesGiven, earnedMine, earnedGiven, ver, photos] = await Promise.all([
    q.query('SELECT * FROM reward_rules WHERE student_id = $1 ORDER BY created_at', [uid]),
    q.query('SELECT * FROM reward_rules WHERE supporter_id = $1 ORDER BY created_at', [uid]),
    q.query('SELECT * FROM rewards_earned WHERE student_id = $1 ORDER BY earned_at', [uid]),
    q.query('SELECT * FROM rewards_earned WHERE supporter_id = $1 ORDER BY earned_at', [uid]),
    q.query('SELECT * FROM result_verifications WHERE student_id = $1 OR supporter_id = $1', [uid]),
    q.query('SELECT test_id, type, data, created_at FROM result_photos WHERE student_id = $1', [uid])
  ]);
  const e = (r: any) => ({ ...earnedView(r, false, 'seen_student_at'), studentId: String(r.student_id), supporterId: String(r.supporter_id) });
  return {
    note: 'Rewards are promises between you and your supporters. Merkster never processes payments.',
    rulesForMe: rulesMine.rows.map(r => ruleView(r)), rulesIMade: rulesGiven.rows.map(r => ({ ...ruleView(r), studentId: String(r.student_id) })),
    rewardsForMe: earnedMine.rows.map(e), rewardsIPromised: earnedGiven.rows.map(e),
    verifications: ver.rows.map(v => ({ studentId: String(v.student_id), supporterId: String(v.supporter_id), testId: v.test_id, at: v.verified_at })),
    testPhotos: photos.rows.map(p => ({ testId: p.test_id, createdAt: p.created_at, dataUrl: `data:${p.type};base64,${Buffer.from(p.data).toString('base64')}` }))
  };
}

function sniffImage(b: Buffer): string | null {
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (b.length > 12 && b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  return null;
}
const PHOTO_HEADERS = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'", 'Cross-Origin-Resource-Policy': 'same-origin' };

export async function rewardsPlugin(app: FastifyInstance, { pool, config }: { pool: pg.Pool; config: Config }) {
  const auth = { preHandler: app.requireUser };
  const uidOf = (req: FastifyRequest) => req.user!.id;
  const writeLimit = limiter(120, 10 * 60e3), photoLimit = limiter(30, 60 * 60e3);
  const limited = (reply: FastifyReply, r: { ok: boolean; retryAfter?: number }) => { if (!r.ok) { reply.header('Retry-After', String(r.retryAfter)).code(429).send({ error: 'rate_limited' }); return true; } return false; };
  async function linkFor(supporterId: number, studentId: string) {
    if (!ID_NUM.test(studentId)) return null;
    return (await pool.query('SELECT * FROM supporter_links WHERE supporter_id = $1 AND student_id = $2', [supporterId, studentId])).rows[0] || null;
  }
  const monthCounts = async (where: string, args: unknown[]) => {
    const r = await pool.query(`SELECT rule_id, count(*)::int AS n FROM rewards_earned WHERE ${where} AND to_char(earned_at, 'YYYY-MM') = $${args.length + 1} GROUP BY 1`, [...args, monthOf(Date.now())]);
    return new Map(r.rows.map(x => [String(x.rule_id), x.n as number]));
  };
  const EARNED_SQL = (who: 'student' | 'supporter') => `SELECT e.*, t.name AS t_name, t.subject AS t_subject, t.result AS t_result, u.name AS p_name, u.avatar_etag AS p_etag, l.relation, l.label, l.show_results
      FROM rewards_earned e JOIN supporter_links l ON l.student_id = e.student_id AND l.supporter_id = e.supporter_id
      JOIN users u ON u.id = e.${who === 'student' ? 'supporter_id' : 'student_id'}
      LEFT JOIN tests t ON t.user_id = e.student_id AND t.id = e.test_id AND NOT t.deleted
      LEFT JOIN LATERAL (SELECT school_year AS c_year, term AS c_term, term_label AS c_label, issued_on AS c_issued, system AS c_system, lines AS c_lines, avg_score AS c_avg FROM report_cards rc WHERE rc.id = e.card_id) rc ON TRUE`;

  /* ================= supporter: rules for one linked kid ================= */
  app.get<{ Params: { id: string } }>('/api/kids/:id/rewards', auth, async (req, reply) => {
    const link = await linkFor(uidOf(req), req.params.id);
    if (!link) return reply.code(403).send({ error: 'not_linked' });
    const me = uidOf(req), sid = link.student_id;
    const onIt = `r.student_id = $1 AND (r.supporter_id = $2 OR EXISTS (SELECT 1 FROM reward_rule_members m WHERE m.rule_id = r.id AND m.supporter_id = $2))`;
    const [rules, earned, mc, family, synced] = await Promise.all([
      pool.query(`SELECT r.* FROM reward_rules r WHERE ${onIt} ORDER BY r.created_at`, [sid, me]),
      pool.query(`${EARNED_SQL('supporter')} WHERE e.student_id = $1 AND (e.supporter_id = $2 OR EXISTS (SELECT 1 FROM reward_rule_members m WHERE m.rule_id = e.rule_id AND m.supporter_id = $2)) ORDER BY e.earned_at DESC LIMIT 200`, [sid, me]),
      monthCounts('student_id = $1', [sid]),
      pool.query(`SELECT l.supporter_id, l.relation, l.label, u.name, u.avatar_etag FROM supporter_links l JOIN users u ON u.id = l.supporter_id
          WHERE l.student_id = $1 AND l.supporter_id <> $2 AND l.relation = ANY($3::text[]) ORDER BY l.created_at`, [sid, me, [...FAMILY_RELATIONS]]),
      pool.query('SELECT a, b FROM reward_sync WHERE student_id = $1 AND (a = $2 OR b = $2)', [sid, me])
    ]);
    const mem = await membersOf(pool, rules.rows.map(r => String(r.id)));
    // privacy between relatives: other supporters' rules/amounts only if the student explicitly allows it.
    // a reward I already share is mine, not "someone else's".
    const seeEachOther = !!(await pool.query('SELECT supporters_see_each_other AS v FROM users WHERE id = $1', [sid])).rows[0]?.v;
    let others: { supporter: PersonLite; rules: RuleView[]; open: ReturnType<typeof totals>; paid: ReturnType<typeof totals>; otherOpen: number; otherPaid: number }[] | undefined;
    if (seeEachOther) {
      const [lr, orr, oe] = await Promise.all([
        pool.query(`SELECT l.supporter_id, l.relation, l.label, u.name, u.avatar_etag FROM supporter_links l JOIN users u ON u.id = l.supporter_id WHERE l.student_id = $1 AND l.supporter_id <> $2 ORDER BY l.created_at`, [sid, me]),
        pool.query(`SELECT * FROM reward_rules r WHERE r.student_id = $1 AND r.supporter_id <> $2 AND r.active
            AND NOT EXISTS (SELECT 1 FROM reward_rule_members m WHERE m.rule_id = r.id AND m.supporter_id = $2) ORDER BY r.created_at`, [sid, me]),
        pool.query(`SELECT supporter_id, reward, status, rule_id FROM rewards_earned e WHERE e.student_id = $1 AND e.supporter_id <> $2
            AND NOT EXISTS (SELECT 1 FROM reward_rule_members m WHERE m.rule_id = e.rule_id AND m.supporter_id = $2)`, [sid, me])
      ]);
      others = lr.rows.map(l => {
        const mine = oe.rows.filter(e => String(e.supporter_id) === String(l.supporter_id));
        const open = mine.filter(e => e.status === 'open'), paid = mine.filter(e => e.status === 'paid');
        return {
          supporter: person(l.supporter_id, l.name, l.avatar_etag, l.relation, l.label),
          rules: orr.rows.filter(r => String(r.supporter_id) === String(l.supporter_id)).map(r => ruleView(r)),
          open: totals(open), paid: totals(paid), otherOpen: open.filter(e => e.reward.type === 'other').length, otherPaid: paid.filter(e => e.reward.type === 'other').length
        };
      });
    }
    return {
      grading: await gradingOf(pool, sid), seeEachOther,
      family: family.rows.map(l => person(l.supporter_id, l.name, l.avatar_etag, l.relation, l.label)),
      syncWith: synced.rows.map(r => String(Number(r.a) === Number(me) ? r.b : r.a)),
      rules: rules.rows.map(r => ({ ...ruleView(r, mc.get(String(r.id)) || 0), members: mem.get(String(r.id)) || [] })),
      earned: earned.rows.map(r => ({ ...earnedView(r, r.show_results, 'seen_supporter_at'), members: r.rule_id ? mem.get(String(r.rule_id)) : undefined })),
      ...(others ? { others } : {})
    };
  });
  app.post<{ Params: { id: string } }>('/api/kids/:id/rules', auth, async (req, reply) => {
    if (limited(reply, writeLimit(String(uidOf(req))))) return;
    const link = await linkFor(uidOf(req), req.params.id);
    if (!link) return reply.code(403).send({ error: 'not_linked' });
    const b = (req.body || {}) as Record<string, unknown>;
    const trigger = cleanTrigger(b.trigger), reward = cleanReward(b.reward), cap = cleanCap(b.capPerMonth);
    const validAsOf = cleanValidAsOf(b.validAsOf);
    if (!trigger || !reward || cap === undefined || validAsOf === undefined) return reply.code(400).send({ error: 'invalid' });
    const n = Number((await pool.query('SELECT count(*) FROM reward_rules WHERE student_id = $1 AND supporter_id = $2', [link.student_id, uidOf(req)])).rows[0].count);
    if (n >= MAX_RULES_PER_LINK) return reply.code(409).send({ error: 'too_many_rules' });
    const row = await tx(pool, async c => {
      const r = await c.query(
        `INSERT INTO reward_rules (student_id, supporter_id, trigger, reward, cap_per_month, valid_as_of)
         VALUES ($1,$2,$3,$4,$5, coalesce(to_timestamp($6::double precision / 1000.0), now())) RETURNING *`,
        [link.student_id, uidOf(req), JSON.stringify(trigger), JSON.stringify(reward), cap, validAsOf]);
      const rule = r.rows[0];
      await c.query('INSERT INTO reward_rule_members (rule_id, student_id, supporter_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [rule.id, link.student_id, uidOf(req)]);
      await expandRewardSync(c, String(rule.id), link.student_id, [String(uidOf(req)), ...cleanMemberIds(b.memberIds)]);
      return rule;
    });
    const mem = await membersOf(pool, [String(row.id)]);
    return reply.code(201).send({ rule: { ...ruleView(row), members: mem.get(String(row.id)) || [] } });
  });
  /** a member invites a parent, grandparent, aunt or uncle onto this one reward */
  app.post<{ Params: { id: string; rid: string } }>('/api/kids/:id/rules/:rid/invite', auth, async (req, reply) => {
    if (limited(reply, writeLimit(String(uidOf(req))))) return;
    const link = await linkFor(uidOf(req), req.params.id);
    if (!link || !ID_NUM.test(req.params.rid)) return reply.code(link ? 404 : 403).send({ error: link ? 'not_found' : 'not_linked' });
    const owns = (await pool.query(`SELECT 1 FROM reward_rules r WHERE r.id = $1 AND r.student_id = $2 AND r.active AND (r.supporter_id = $3 OR EXISTS (SELECT 1 FROM reward_rule_members m WHERE m.rule_id = r.id AND m.supporter_id = $3))`, [req.params.rid, link.student_id, uidOf(req)])).rows[0];
    if (!owns) return reply.code(404).send({ error: 'not_found' });
    const b = (req.body || {}) as Record<string, unknown>;
    if (!isFamilyRelation(typeof b.relation === 'string' ? b.relation : '')) return reply.code(400).send({ error: 'not_family' });
    const shareAll = b.shareAll === true;
    if (shareAll && !isFamilyRelation(link.relation)) return reply.code(400).send({ error: 'not_family' });
    const days = Math.min(INVITE_DAYS_MAX, Math.max(1, Math.round(Number(b.days) || INVITE_DAYS_DEFAULT)));
    const maxUses = Math.min(INVITE_USES_MAX, Math.max(1, Math.round(Number(b.maxUses) || 1)));
    const open = Number((await pool.query(`SELECT count(*) FROM invites WHERE student_id = $1 AND revoked_at IS NULL AND uses < max_uses AND expires_at > now()`, [link.student_id])).rows[0].count);
    if (open >= MAX_OPEN_INVITES) return reply.code(409).send({ error: 'too_many_invites' });
    const token = crypto.randomBytes(24).toString('base64url');
    const label = typeof b.label === 'string' ? b.label.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 40) : '';
    const r = await pool.query(`INSERT INTO invites (student_id, token_hash, relation, label, max_uses, expires_at, rule_id, share_all, inviter_id) VALUES ($1,$2,$3,$4,$5, now() + make_interval(days => $6), $7, $8, $9) RETURNING id, relation`,
      [link.student_id, crypto.createHmac('sha256', config.appSecret).update('invite:' + token).digest('hex'), b.relation, label, maxUses, days, shareAll ? null : req.params.rid, shareAll, shareAll ? uidOf(req) : null]);
    return reply.code(201).send({ invite: { id: String(r.rows[0].id), relation: r.rows[0].relation, token, url: `${config.publicUrl}/join#${token}`, ...(shareAll ? { shareAll: true } : { ruleId: req.params.rid }) } });
  });
  /** invite a relative onto every reward this supporter shares, including ones added later */
  app.post<{ Params: { id: string } }>('/api/kids/:id/rewards/invite', auth, async (req, reply) => {
    if (limited(reply, writeLimit(String(uidOf(req))))) return;
    const link = await linkFor(uidOf(req), req.params.id);
    if (!link) return reply.code(403).send({ error: 'not_linked' });
    if (!isFamilyRelation(link.relation)) return reply.code(400).send({ error: 'not_family' });
    const b = (req.body || {}) as Record<string, unknown>;
    if (!isFamilyRelation(typeof b.relation === 'string' ? b.relation : '')) return reply.code(400).send({ error: 'not_family' });
    const days = Math.min(INVITE_DAYS_MAX, Math.max(1, Math.round(Number(b.days) || INVITE_DAYS_DEFAULT)));
    const maxUses = Math.min(INVITE_USES_MAX, Math.max(1, Math.round(Number(b.maxUses) || 1)));
    const open = Number((await pool.query(`SELECT count(*) FROM invites WHERE student_id = $1 AND revoked_at IS NULL AND uses < max_uses AND expires_at > now()`, [link.student_id])).rows[0].count);
    if (open >= MAX_OPEN_INVITES) return reply.code(409).send({ error: 'too_many_invites' });
    const token = crypto.randomBytes(24).toString('base64url');
    const label = typeof b.label === 'string' ? b.label.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 40) : '';
    const r = await pool.query(`INSERT INTO invites (student_id, token_hash, relation, label, max_uses, expires_at, share_all, inviter_id) VALUES ($1,$2,$3,$4,$5, now() + make_interval(days => $6), TRUE, $7) RETURNING id, relation`,
      [link.student_id, crypto.createHmac('sha256', config.appSecret).update('invite:' + token).digest('hex'), b.relation, label, maxUses, days, uidOf(req)]);
    return reply.code(201).send({ invite: { id: String(r.rows[0].id), relation: r.rows[0].relation, token, url: `${config.publicUrl}/join#${token}`, shareAll: true } });
  });
  /** keep every reward in sync with one relative who is already in the family */
  app.post<{ Params: { id: string } }>('/api/kids/:id/rewards/sync', auth, async (req, reply) => {
    if (limited(reply, writeLimit(String(uidOf(req))))) return;
    const link = await linkFor(uidOf(req), req.params.id);
    if (!link) return reply.code(403).send({ error: 'not_linked' });
    const b = (req.body || {}) as Record<string, unknown>;
    const peerId = typeof b.peerId === 'string' ? b.peerId : '';
    if (!syncPair(String(uidOf(req)), peerId)) return reply.code(400).send({ error: 'invalid' });
    const on = b.on === true;
    const ok = on ? await tx(pool, c => linkRewardSync(c, link.student_id, uidOf(req), peerId)) : (await unlinkRewardSync(pool, link.student_id, String(uidOf(req)), peerId), true);
    if (!ok) return reply.code(400).send({ error: 'not_family' });
    const synced = (await pool.query('SELECT a, b FROM reward_sync WHERE student_id = $1 AND (a = $2 OR b = $2)', [link.student_id, uidOf(req)])).rows;
    return { syncWith: synced.map(r => String(Number(r.a) === Number(uidOf(req)) ? r.b : r.a)) };
  });
  app.patch<{ Params: { id: string; rid: string } }>('/api/kids/:id/rules/:rid', auth, async (req, reply) => {
    const link = await linkFor(uidOf(req), req.params.id);
    if (!link) return reply.code(403).send({ error: 'not_linked' });
    if (!ID_NUM.test(req.params.rid)) return reply.code(404).send({ error: 'not_found' });
    const b = (req.body || {}) as Record<string, unknown>;
    const reward = b.reward !== undefined ? cleanReward(b.reward) : null, cap = b.capPerMonth !== undefined ? cleanCap(b.capPerMonth) : null;
    const validAsOf = b.validAsOf !== undefined ? cleanValidAsOf(b.validAsOf) : null;
    if ((b.reward !== undefined && !reward) || cap === undefined || (b.validAsOf !== undefined && (validAsOf === undefined || validAsOf === null))) return reply.code(400).send({ error: 'invalid' });
    const r = await pool.query(`UPDATE reward_rules r SET active = coalesce($4, active), reward = coalesce($5, reward),
        cap_per_month = CASE WHEN $6 THEN $7 ELSE cap_per_month END,
        valid_as_of = CASE WHEN $8 THEN to_timestamp($9::double precision / 1000.0) ELSE valid_as_of END
        WHERE r.id = $1 AND r.student_id = $2 AND (r.supporter_id = $3 OR EXISTS (SELECT 1 FROM reward_rule_members m WHERE m.rule_id = r.id AND m.supporter_id = $3)) RETURNING *`,
      [req.params.rid, link.student_id, uidOf(req), typeof b.active === 'boolean' ? b.active : null, reward ? JSON.stringify(reward) : null, b.capPerMonth !== undefined, cap, b.validAsOf !== undefined, validAsOf]);
    if (!r.rowCount) return reply.code(404).send({ error: 'not_found' });
    const mem = await membersOf(pool, [req.params.rid]);
    return { rule: { ...ruleView(r.rows[0]), members: mem.get(req.params.rid) || [] } };
  });
  app.delete<{ Params: { id: string; rid: string } }>('/api/kids/:id/rules/:rid', auth, async (req, reply) => {
    const link = await linkFor(uidOf(req), req.params.id);
    if (!link) return reply.code(403).send({ error: 'not_linked' });
    if (!ID_NUM.test(req.params.rid)) return reply.code(404).send({ error: 'not_found' });
    // what was already earned stays (rule_id → NULL) – a promise is a promise
    const r = await pool.query(`DELETE FROM reward_rules r WHERE r.id = $1 AND r.student_id = $2 AND (r.supporter_id = $3 OR EXISTS (SELECT 1 FROM reward_rule_members m WHERE m.rule_id = r.id AND m.supporter_id = $3))`, [req.params.rid, link.student_id, uidOf(req)]);
    return r.rowCount ? { ok: true } : reply.code(404).send({ error: 'not_found' });
  });
  /** "I saw the test paper" */
  app.post<{ Params: { id: string } }>('/api/kids/:id/verify', auth, async (req, reply) => {
    if (limited(reply, writeLimit(String(uidOf(req))))) return;
    const link = await linkFor(uidOf(req), req.params.id);
    if (!link) return reply.code(403).send({ error: 'not_linked' });
    if (!link.show_results) return reply.code(403).send({ error: 'hidden' });
    const b = (req.body || {}) as Record<string, unknown>;
    const testId = typeof b.testId === 'string' && TEST_ID.test(b.testId) ? b.testId : null;
    if (!testId) return reply.code(400).send({ error: 'invalid' });
    const t = (await pool.query('SELECT 1 FROM tests WHERE user_id = $1 AND id = $2 AND NOT deleted AND result IS NOT NULL', [link.student_id, testId])).rows[0];
    if (!t) return reply.code(404).send({ error: 'not_found' });
    if (b.verified === false) await pool.query('DELETE FROM result_verifications WHERE student_id = $1 AND supporter_id = $2 AND test_id = $3', [link.student_id, uidOf(req), testId]);
    else await pool.query('INSERT INTO result_verifications (student_id, supporter_id, test_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [link.student_id, uidOf(req), testId]);
    return { ok: true, verified: b.verified !== false };
  });
  /** photo of a graded test – only if the student shares results AND photos with me */
  app.get<{ Params: { id: string; testId: string } }>('/api/kids/:id/photo/:testId', auth, async (req, reply) => {
    const link = await linkFor(uidOf(req), req.params.id);
    if (!link) return reply.code(403).send({ error: 'not_linked' });
    if (!link.show_results || !link.show_photos) return reply.code(403).send({ error: 'hidden' });
    if (!TEST_ID.test(req.params.testId)) return reply.code(404).send({ error: 'not_found' });
    const p = (await pool.query(`SELECT p.data, p.type FROM result_photos p JOIN tests t ON t.user_id = p.student_id AND t.id = p.test_id AND NOT t.deleted
        WHERE p.student_id = $1 AND p.test_id = $2`, [link.student_id, req.params.testId])).rows[0];
    if (!p) return reply.code(404).send({ error: 'not_found' });
    return reply.headers({ ...PHOTO_HEADERS, 'Content-Type': p.type }).send(Buffer.from(p.data));
  });

  /* ================= supporter: everything I promised (across kids) ================= */
  app.get('/api/rewards/given', auth, async req => {
    const r = await pool.query(`${EARNED_SQL('supporter')} WHERE e.supporter_id = $1 OR EXISTS (SELECT 1 FROM reward_rule_members m WHERE m.rule_id = e.rule_id AND m.supporter_id = $1) ORDER BY (e.status = 'open') DESC, e.earned_at DESC LIMIT 300`, [uidOf(req)]);
    const rewards = r.rows.map(x => ({ ...earnedView(x, x.show_results, 'seen_supporter_at'), kid: person(x.student_id, x.p_name, x.p_etag) }));   // the KID's own name – l.relation/l.label describe the supporter ("Mama"), never the kid
    return { rewards, unseen: rewards.filter(x => !x.seen).length, open: rewards.filter(x => x.status === 'open').length };
  });
  app.post('/api/rewards/given/seen', auth, async req => {
    await pool.query(`UPDATE rewards_earned SET seen_supporter_at = now() WHERE seen_supporter_at IS NULL AND (supporter_id = $1 OR EXISTS (SELECT 1 FROM reward_rule_members m WHERE m.rule_id = rewards_earned.rule_id AND m.supporter_id = $1))`, [uidOf(req)]);
    return { ok: true };
  });
  /** the supporter marks a promise as kept ("paid" / "redeemed") – or re-opens it */
  app.post<{ Params: { rid: string } }>('/api/rewards/:rid/status', auth, async (req, reply) => {
    if (!ID_NUM.test(req.params.rid)) return reply.code(404).send({ error: 'not_found' });
    const status = (req.body as { status?: unknown } | null)?.status;
    if (status !== 'paid' && status !== 'open') return reply.code(400).send({ error: 'invalid' });
    const r = await pool.query(`UPDATE rewards_earned SET status = $3, paid_at = CASE WHEN $3 = 'paid' THEN now() ELSE NULL END, seen_student_at = CASE WHEN $3 = 'paid' THEN NULL ELSE seen_student_at END
        WHERE id = $1 AND (supporter_id = $2 OR EXISTS (SELECT 1 FROM reward_rule_members m WHERE m.rule_id = rewards_earned.rule_id AND m.supporter_id = $2)) RETURNING id`, [req.params.rid, uidOf(req), status]);
    return r.rowCount ? { ok: true, status } : reply.code(404).send({ error: 'not_found' });
  });

  /* ================= student: what can I earn, what did I earn ================= */
  app.get('/api/rewards', auth, async req => {
    const me = uidOf(req);
    const [rules, earned, ver, photos, mc] = await Promise.all([
      pool.query(`SELECT r.*, u.name AS p_name, u.avatar_etag AS p_etag, l.relation, l.label FROM reward_rules r
          JOIN supporter_links l ON l.student_id = r.student_id AND l.supporter_id = r.supporter_id JOIN users u ON u.id = r.supporter_id
          WHERE r.student_id = $1 AND r.active ORDER BY r.created_at`, [me]),
      pool.query(`${EARNED_SQL('student')} WHERE e.student_id = $1 ORDER BY e.earned_at DESC LIMIT 500`, [me]),
      pool.query(`SELECT v.test_id, v.supporter_id, u.name, u.avatar_etag FROM result_verifications v JOIN users u ON u.id = v.supporter_id WHERE v.student_id = $1`, [me]),
      pool.query('SELECT test_id FROM result_photos WHERE student_id = $1', [me]),
      monthCounts('student_id = $1', [me])
    ]);
    const mem = await membersOf(pool, [...new Set([...rules.rows.map(r => String(r.id)), ...earned.rows.map(r => r.rule_id ? String(r.rule_id) : '').filter(Boolean)])]);
    return {
      rules: rules.rows.map(r => ({ ...ruleView(r, mc.get(String(r.id)) || 0), supporter: person(r.supporter_id, r.p_name, r.p_etag, r.relation, r.label), members: mem.get(String(r.id)) || [] })),
      earned: earned.rows.map(r => ({ ...earnedView(r, true, 'seen_student_at'), supporter: person(r.supporter_id, r.p_name, r.p_etag, r.relation, r.label), members: r.rule_id ? mem.get(String(r.rule_id)) : undefined })),
      verifications: ver.rows.map(v => ({ testId: v.test_id, by: person(v.supporter_id, v.name, v.avatar_etag) })),
      photos: photos.rows.map(p => p.test_id as string)
    };
  });
  app.post('/api/rewards/seen', auth, async req => {
    await pool.query('UPDATE rewards_earned SET seen_student_at = now() WHERE student_id = $1 AND seen_student_at IS NULL', [uidOf(req)]);
    return { ok: true };
  });
  /** re-run evaluation now (the app calls this right after saving a result) */
  app.post('/api/rewards/evaluate', auth, async (req, reply) => {
    if (limited(reply, writeLimit('ev:' + uidOf(req)))) return;
    return { added: await evaluateRewards(pool, uidOf(req)) };
  });

  /* ---- the student's own photo of a graded test (resized in the browser, ≤ 2.5 MB) ---- */
  app.put<{ Params: { id: string } }>('/api/tests/:id/photo', { ...auth, bodyLimit: 4 * 1024 * 1024 }, async (req, reply) => {
    if (limited(reply, photoLimit(String(uidOf(req))))) return;
    if (!TEST_ID.test(req.params.id)) return reply.code(404).send({ error: 'not_found' });
    const d = (req.body as { dataUrl?: unknown } | null)?.dataUrl;
    const m = typeof d === 'string' ? d.match(/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/) : null;
    if (!m) return reply.code(400).send({ error: 'invalid' });
    const buf = Buffer.from(m[2], 'base64'), type = sniffImage(buf);
    if (!type || buf.length > PHOTO_MAX) return reply.code(400).send({ error: 'invalid' });
    const t = (await pool.query('SELECT 1 FROM tests WHERE user_id = $1 AND id = $2 AND NOT deleted', [uidOf(req), req.params.id])).rows[0];
    if (!t) return reply.code(404).send({ error: 'not_found' });
    await pool.query(`INSERT INTO result_photos (student_id, test_id, data, type) VALUES ($1,$2,$3,$4)
        ON CONFLICT (student_id, test_id) DO UPDATE SET data = EXCLUDED.data, type = EXCLUDED.type, created_at = now()`, [uidOf(req), req.params.id, buf, type]);
    return { ok: true };
  });
  app.get<{ Params: { id: string } }>('/api/tests/:id/photo', auth, async (req, reply) => {
    const p = (await pool.query('SELECT data, type FROM result_photos WHERE student_id = $1 AND test_id = $2', [uidOf(req), req.params.id])).rows[0];
    if (!p) return reply.code(404).send({ error: 'not_found' });
    return reply.headers({ ...PHOTO_HEADERS, 'Content-Type': p.type }).send(Buffer.from(p.data));
  });
  app.delete<{ Params: { id: string } }>('/api/tests/:id/photo', auth, async req => {
    await pool.query('DELETE FROM result_photos WHERE student_id = $1 AND test_id = $2', [uidOf(req), req.params.id]);
    return { ok: true };
  });
}
