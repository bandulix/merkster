/* Merkster – report cards (Zeugnisse). The student confirms every card (nothing is stored before that);
   AI extraction only proposes lines. Confirming a card evaluates the supporters' report-card reward rules. */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type pg from 'pg';
import { GRADE_SYSTEMS, type GradeSystem } from '../../shared/types';
import { validResult } from '../../shared/grades';
import { avgOf, canon, lineScore, TERM_KINDS, type ReportCard, type ReportLine, type TermKind } from '../../shared/reportcards';
import { tx } from './db';
import { evaluateRewards } from './rewards';
import { limiter } from './ratelimit';

type Q = pg.Pool | pg.PoolClient;
const ID_NUM = /^\d{1,18}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const SUBJ = /^(c_[a-z0-9-]{1,40}|[a-z]{1,20})$/;
const clean = (v: unknown, n: number) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, n) : '');
export const MAX_LINES = 30;
export const RC_PHOTO_MAX = 3 * 1024 * 1024;

export const cardRow = (r: Record<string, any>): ReportCard => ({
  id: String(r.id), schoolYear: r.school_year, term: r.term, termLabel: r.term_label, issuedOn: r.issued_on, system: r.system,
  lines: r.lines, avgScore: Number(r.avg_score), createdAt: new Date(r.created_at).getTime(), hasPhoto: !!r.has_photo
});
export async function loadCards(q: Q, userId: number | string) {
  const r = await q.query(`SELECT c.*, EXISTS (SELECT 1 FROM report_card_photos p WHERE p.card_id = c.id) AS has_photo FROM report_cards c WHERE c.user_id = $1 ORDER BY c.issued_on, c.created_at`, [userId]);
  return r.rows.map(cardRow);
}
/** strict validation of a report card sent by the client */
export function cleanCard(b: unknown): Omit<ReportCard, 'id' | 'createdAt'> | null {
  const o = (b || {}) as Record<string, unknown>;
  const system = GRADE_SYSTEMS.includes(o.system as GradeSystem) ? (o.system as GradeSystem) : null;
  const issuedOn = typeof o.issuedOn === 'string' && DAY.test(o.issuedOn) && !Number.isNaN(Date.parse(o.issuedOn)) ? o.issuedOn : null;
  if (!system || !issuedOn || !Array.isArray(o.lines)) return null;
  const term = (TERM_KINDS as readonly string[]).includes(o.term as string) ? (o.term as TermKind) : 'custom';
  const schoolYear = typeof o.schoolYear === 'string' && /^\d{4}\/\d{2}$/.test(o.schoolYear) ? o.schoolYear : '';
  const seen = new Set<string>(), lines: ReportLine[] = [];
  for (const x of o.lines.slice(0, MAX_LINES) as Record<string, unknown>[]) {
    const subjectId = typeof x?.subjectId === 'string' && SUBJ.test(x.subjectId) && (x.subjectId.startsWith('c_') || canon(x.subjectId)) ? x.subjectId : null;
    const value = typeof x?.value === 'number' ? x.value : NaN;
    if (!subjectId || seen.has(subjectId)) continue;
    if (!validResult({ system, value, enteredAt: 0, ...(system === 'xofy' ? { max: 100 } : {}) })) continue;
    seen.add(subjectId);
    lines.push({ subjectId, name: clean(x.name, 60) || canon(subjectId)?.name.de || subjectId, value, score: lineScore(system, value) });
  }
  if (!lines.length) return null;
  return { schoolYear, term, termLabel: clean(o.termLabel, 40), issuedOn, system, lines, avgScore: avgOf(lines) };
}
function sniffImage(b: Buffer): string | null {
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (b.length > 12 && b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  return null;
}
export function decodePhoto(d: unknown): { buf: Buffer; type: string } | null {
  const m = typeof d === 'string' ? d.match(/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/) : null;
  if (!m) return null;
  const buf = Buffer.from(m[2], 'base64'), type = sniffImage(buf);
  return type && buf.length <= RC_PHOTO_MAX ? { buf, type } : null;
}
const PHOTO_HEADERS = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'", 'Cross-Origin-Resource-Policy': 'same-origin' };

export async function reportCardsPlugin(app: FastifyInstance, { pool }: { pool: pg.Pool }) {
  const auth = { preHandler: app.requireUser };
  const uidOf = (req: FastifyRequest) => req.user!.id;
  const writeLimit = limiter(40, 60 * 60e3);
  const limited = (reply: FastifyReply, r: { ok: boolean; retryAfter?: number }) => { if (!r.ok) { reply.header('Retry-After', String(r.retryAfter)).code(429).send({ error: 'rate_limited' }); return true; } return false; };

  app.get('/api/report-cards', auth, async req => ({ cards: await loadCards(pool, uidOf(req)) }));

  /** confirm a report card (after review) → stored → supporters' report-card rules are evaluated right away */
  app.post('/api/report-cards', { ...auth, bodyLimit: 5 * 1024 * 1024 }, async (req, reply) => {
    if (limited(reply, writeLimit(String(uidOf(req))))) return;
    const body = (req.body || {}) as Record<string, unknown>;
    const card = cleanCard(body);
    if (!card) return reply.code(400).send({ error: 'invalid_report_card' });
    const photo = body.photo ? decodePhoto(body.photo) : null;
    if (body.photo && !photo) return reply.code(400).send({ error: 'invalid_photo' });
    const n = Number((await pool.query('SELECT count(*) FROM report_cards WHERE user_id = $1', [uidOf(req)])).rows[0].count);
    if (n >= 100) return reply.code(409).send({ error: 'too_many' });
    const id = await tx(pool, async c => {
      const r = await c.query(`INSERT INTO report_cards (user_id, school_year, term, term_label, issued_on, system, lines, avg_score) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
        [uidOf(req), card.schoolYear, card.term, card.termLabel, card.issuedOn, card.system, JSON.stringify(card.lines), card.avgScore]);
      if (photo) await c.query('INSERT INTO report_card_photos (card_id, data, type) VALUES ($1,$2,$3)', [r.rows[0].id, photo.buf, photo.type]);
      return String(r.rows[0].id);
    });
    let earned = 0;
    try { earned = await evaluateRewards(pool, uidOf(req)); } catch (e) { req.log.warn({ err: String((e as Error).message) }, 'reward evaluation failed'); }
    req.log.info({ userId: String(uidOf(req)), lines: card.lines.length, earned }, 'report card confirmed');
    const saved = (await loadCards(pool, uidOf(req))).find(c => c.id === id)!;
    return reply.code(201).send({ card: saved, earned });
  });
  app.delete<{ Params: { id: string } }>('/api/report-cards/:id', auth, async (req, reply) => {
    if (!ID_NUM.test(req.params.id)) return reply.code(404).send({ error: 'not_found' });
    const r = await pool.query('DELETE FROM report_cards WHERE id = $1 AND user_id = $2', [req.params.id, uidOf(req)]);
    if (!r.rowCount) return reply.code(404).send({ error: 'not_found' });
    await pool.query(`DELETE FROM reactions WHERE student_id = $1 AND target_kind = 'report' AND target_id = $2`, [uidOf(req), req.params.id]);
    await evaluateRewards(pool, uidOf(req)).catch(() => 0);    // open rewards for this card disappear
    return { ok: true };
  });
  app.put<{ Params: { id: string } }>('/api/report-cards/:id/photo', { ...auth, bodyLimit: 5 * 1024 * 1024 }, async (req, reply) => {
    if (!ID_NUM.test(req.params.id)) return reply.code(404).send({ error: 'not_found' });
    const photo = decodePhoto((req.body as { dataUrl?: unknown } | null)?.dataUrl);
    if (!photo) return reply.code(400).send({ error: 'invalid_photo' });
    const own = (await pool.query('SELECT 1 FROM report_cards WHERE id = $1 AND user_id = $2', [req.params.id, uidOf(req)])).rows[0];
    if (!own) return reply.code(404).send({ error: 'not_found' });
    await pool.query('INSERT INTO report_card_photos (card_id, data, type) VALUES ($1,$2,$3) ON CONFLICT (card_id) DO UPDATE SET data = EXCLUDED.data, type = EXCLUDED.type', [req.params.id, photo.buf, photo.type]);
    return { ok: true };
  });
  app.get<{ Params: { id: string } }>('/api/report-cards/:id/photo', auth, async (req, reply) => {
    if (!ID_NUM.test(req.params.id)) return reply.code(404).send({ error: 'not_found' });
    const p = (await pool.query('SELECT p.data, p.type FROM report_card_photos p JOIN report_cards c ON c.id = p.card_id WHERE c.id = $1 AND c.user_id = $2', [req.params.id, uidOf(req)])).rows[0];
    if (!p) return reply.code(404).send({ error: 'not_found' });
    return reply.headers({ ...PHOTO_HEADERS, 'Content-Type': p.type }).send(Buffer.from(p.data));
  });
  app.delete<{ Params: { id: string } }>('/api/report-cards/:id/photo', auth, async req => {
    if (ID_NUM.test(req.params.id)) await pool.query('DELETE FROM report_card_photos p USING report_cards c WHERE p.card_id = c.id AND c.id = $1 AND c.user_id = $2', [req.params.id, uidOf(req)]);
    return { ok: true };
  });

  /** supporter: photo of a report card – only with results AND photos shared */
  app.get<{ Params: { id: string; cid: string } }>('/api/kids/:id/report-cards/:cid/photo', auth, async (req, reply) => {
    if (!ID_NUM.test(req.params.id) || !ID_NUM.test(req.params.cid)) return reply.code(404).send({ error: 'not_found' });
    const link = (await pool.query('SELECT show_results, show_photos FROM supporter_links WHERE supporter_id = $1 AND student_id = $2', [uidOf(req), req.params.id])).rows[0];
    if (!link) return reply.code(403).send({ error: 'not_linked' });
    if (!link.show_results || !link.show_photos) return reply.code(403).send({ error: 'hidden' });
    const p = (await pool.query('SELECT p.data, p.type FROM report_card_photos p JOIN report_cards c ON c.id = p.card_id WHERE c.id = $1 AND c.user_id = $2', [req.params.cid, req.params.id])).rows[0];
    if (!p) return reply.code(404).send({ error: 'not_found' });
    return reply.headers({ ...PHOTO_HEADERS, 'Content-Type': p.type }).send(Buffer.from(p.data));
  });
}
export async function reportCardsExport(q: Q, uid: number) {
  const cards = await loadCards(q, uid);
  const photos = (await q.query('SELECT p.card_id, p.type, p.data FROM report_card_photos p JOIN report_cards c ON c.id = p.card_id WHERE c.user_id = $1', [uid])).rows;
  return cards.map(c => { const p = photos.find(x => String(x.card_id) === c.id); return { ...c, photo: p ? `data:${p.type};base64,${Buffer.from(p.data).toString('base64')}` : null }; });
}
