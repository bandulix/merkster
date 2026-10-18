/* Class groups.
   The student who creates the class owns its name, motto and cover. Every member can invite
   classmates (unguessable link, same fragment style as supporter invites) and share one of
   their tests. A share is a snapshot of the cards – practice state stays with the author.
   The leaderboard recomputes XP with the same function the app uses. */
import crypto from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type pg from 'pg';
import type { Config } from './config';
import { tx } from './db';
import { avatarPath } from './avatars';
import { limiter } from './ratelimit';
import { loadStudent } from './supporters';
import { ID_RE } from './sanitize';
import { CARD_TYPES, FORMATS, LANG_CODES, SUBJECT_KEYS, type CardType, type Format, type Lang, type Subject } from '../../shared/types';
import {
  CLASS_CARDS_MAX, CLASS_COVER_MAX_BYTES, CLASS_INVITE_DAYS_DEFAULT, CLASS_INVITE_DAYS_MAX, CLASS_INVITE_USES_DEFAULT,
  CLASS_INVITE_USES_MAX, CLASS_MEMBERS_MAX, CLASS_MOTTO_MAX, CLASS_NAME_MAX, CLASS_OPEN_INVITES_MAX, CLASSES_PER_STUDENT,
  boardOrder, cleanClassText
} from '../../shared/classes';

type Q = pg.Pool | pg.PoolClient;
const TOKEN_RE = /^[A-Za-z0-9_-]{32}$/;
const CLASS_ID = /^[A-Za-z0-9_-]{8,16}$/;
const newId = () => crypto.randomBytes(9).toString('base64url');
const tokenHash = (secret: string, t: string) => crypto.createHmac('sha256', secret).update('class-invite:' + t).digest('hex');
const firstName = (n: string) => (n || '').trim().split(/\s+/)[0] || '';

let secret = '';
const coverSig = (id: string, etag: string) => crypto.createHmac('sha256', secret).update(`class-cover:${id}:${etag}`).digest('base64url').slice(0, 22);
export const classCoverPath = (id: string, etag: string | null | undefined) => (etag ? `/api/classes/${id}/cover?v=${etag}&s=${coverSig(id, etag)}` : null);

const sniff = (b: Buffer) => b[0] === 0x89 && b[1] === 0x50 ? 'image/png' : b[0] === 0xff && b[1] === 0xd8 ? 'image/jpeg'
  : b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP' ? 'image/webp' : null;

type InviteStatus = 'open' | 'used' | 'expired' | 'revoked';
const inviteStatus = (r: { revoked_at: Date | null; uses: number; max_uses: number; expires_at: Date }): InviteStatus =>
  r.revoked_at ? 'revoked' : r.uses >= r.max_uses ? 'used' : new Date(r.expires_at).getTime() < Date.now() ? 'expired' : 'open';

/** a class invite can stand in for the sign-up codeword, same as a supporter invite */
export async function classInviteIsOpen(q: Q, appSecret: string, token: unknown): Promise<boolean> {
  if (typeof token !== 'string' || !TOKEN_RE.test(token)) return false;
  const r = (await q.query('SELECT revoked_at, uses, max_uses, expires_at FROM class_invites WHERE token_hash = $1', [tokenHash(appSecret, token)])).rows[0];
  return !!r && inviteStatus(r) === 'open';
}

/** when an account goes away, hand the class to the earliest other member, or delete it */
export async function releaseOwnedClasses(q: Q, uid: number) {
  await q.query(`UPDATE classes c SET owner_id = next.user_id
    FROM (
      SELECT DISTINCT ON (m.class_id) m.class_id, m.user_id
      FROM class_members m
      JOIN classes c2 ON c2.id = m.class_id AND c2.owner_id = $1
      WHERE m.user_id <> $1
      ORDER BY m.class_id, m.joined_at, m.user_id
    ) next
    WHERE c.id = next.class_id AND c.owner_id = $1`, [uid]);
  await q.query('DELETE FROM classes WHERE owner_id = $1', [uid]);
}

export async function classesExport(q: Q, uid: number) {
  const [mine, shares] = await Promise.all([
    q.query(`SELECT c.id, c.name, c.motto, c.owner_id = $1 AS owner, m.joined_at FROM classes c JOIN class_members m ON m.class_id = c.id AND m.user_id = $1 ORDER BY m.joined_at`, [uid]),
    q.query(`SELECT s.id, s.class_id, s.name, s.subject, s.card_count, s.created_at FROM class_shares s WHERE s.author_id = $1 ORDER BY s.created_at`, [uid])
  ]);
  return {
    classes: mine.rows.map(r => ({ id: r.id, name: r.name, motto: r.motto, owner: !!r.owner, joinedAt: r.joined_at })),
    shares: shares.rows.map(r => ({ id: r.id, classId: r.class_id, name: r.name, subject: r.subject, cards: r.card_count, at: r.created_at }))
  };
}

async function mapLimit<T, R>(items: T[], n: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const idx = i++; out[idx] = await fn(items[idx]); }
  }));
  return out;
}

const oneOf = <T extends string>(v: unknown, allowed: readonly T[]): T | null => (allowed as readonly string[]).includes(v as string) ? v as T : null;
const clip = (v: unknown, max: number) => typeof v === 'string' ? v.replace(/[\u0000-\u001f]/g, '').trim().slice(0, max) : '';

export async function classesPlugin(app: FastifyInstance, { pool, config }: { pool: pg.Pool; config: Config }) {
  secret = config.appSecret;
  const auth = { preHandler: app.requireUser };
  const uidOf = (req: FastifyRequest) => req.user!.id;
  const createLimit = limiter(10, 60 * 60e3), inviteLimit = limiter(30, 10 * 60e3), joinLimit = limiter(30, 10 * 60e3);
  const limited = (reply: FastifyReply, r: { ok: boolean; retryAfter?: number }) => { if (!r.ok) { reply.header('Retry-After', String(r.retryAfter)).code(429).send({ error: 'rate_limited' }); return true; } return false; };
  const tokenOf = (req: FastifyRequest) => { const t = (req.body as { token?: unknown } | null)?.token; return typeof t === 'string' && TOKEN_RE.test(t) ? t : null; };

  const shape = (r: Record<string, any>) => ({
    id: r.id as string, name: r.name as string, motto: r.motto as string,
    cover: classCoverPath(r.id, r.cover_etag), owner: !!r.is_owner, ownerId: String(r.owner_id),
    members: Number(r.members || 0), createdAt: new Date(r.created_at).toISOString()
  });

  async function membership(uid: number, id: string) {
    if (!CLASS_ID.test(id)) return null;
    return (await pool.query(`SELECT c.*, (c.owner_id = $2) AS is_owner,
      (SELECT count(*) FROM class_members x WHERE x.class_id = c.id)::int AS members
      FROM classes c JOIN class_members m ON m.class_id = c.id AND m.user_id = $2 WHERE c.id = $1`, [id, uid])).rows[0] || null;
  }

  app.get('/api/classes', auth, async req => {
    const r = await pool.query(`SELECT c.*, (c.owner_id = $1) AS is_owner,
      (SELECT count(*) FROM class_members x WHERE x.class_id = c.id)::int AS members
      FROM classes c JOIN class_members m ON m.class_id = c.id AND m.user_id = $1 ORDER BY c.created_at`, [uidOf(req)]);
    return { classes: r.rows.map(shape) };
  });

  app.post('/api/classes', auth, async (req, reply) => {
    if (limited(reply, createLimit(String(uidOf(req))))) return;
    const b = (req.body || {}) as Record<string, unknown>;
    const name = cleanClassText(b.name, CLASS_NAME_MAX);
    if (!name) return reply.code(400).send({ error: 'name_required' });
    const motto = cleanClassText(b.motto, CLASS_MOTTO_MAX);
    const n = Number((await pool.query('SELECT count(*) FROM class_members WHERE user_id = $1', [uidOf(req)])).rows[0].count);
    if (n >= CLASSES_PER_STUDENT) return reply.code(409).send({ error: 'class_limit', max: CLASSES_PER_STUDENT });
    const id = newId();
    const row = await tx(pool, async c => {
      const ins = await c.query(`INSERT INTO classes (id, owner_id, name, motto) VALUES ($1,$2,$3,$4) RETURNING *`, [id, uidOf(req), name, motto]);
      await c.query('INSERT INTO class_members (class_id, user_id) VALUES ($1,$2)', [id, uidOf(req)]);
      return ins.rows[0];
    });
    return reply.code(201).send({ class: shape({ ...row, is_owner: true, members: 1 }) });
  });

  app.get<{ Params: { id: string } }>('/api/classes/:id', auth, async (req, reply) => {
    const cls = await membership(uidOf(req), req.params.id);
    if (!cls) return reply.code(404).send({ error: 'not_found' });
    const [people, shares, invites] = await Promise.all([
      pool.query(`SELECT u.id, u.name, u.avatar_etag, (c.owner_id = u.id) AS is_owner
        FROM class_members m JOIN users u ON u.id = m.user_id JOIN classes c ON c.id = m.class_id WHERE m.class_id = $1`, [cls.id]),
      pool.query(`SELECT s.*, u.name AS author_name, u.avatar_etag, t.test_id AS taken_test, t.taken_at
        FROM class_shares s JOIN users u ON u.id = s.author_id
        LEFT JOIN class_share_takes t ON t.share_id = s.id AND t.user_id = $2
        WHERE s.class_id = $1 ORDER BY s.updated_at DESC`, [cls.id, uidOf(req)]),
      pool.query(`SELECT id, created_by, max_uses, uses, expires_at, created_at FROM class_invites
        WHERE class_id = $1 AND revoked_at IS NULL AND uses < max_uses AND expires_at > now() ORDER BY created_at DESC`, [cls.id])
    ]);
    const board = boardOrder(await mapLimit(people.rows, 4, async p => {
      const { progress } = await loadStudent(pool, Number(p.id));
      return { id: String(p.id), name: p.name as string, avatar: avatarPath(p.id, p.avatar_etag), owner: !!p.is_owner, me: Number(p.id) === uidOf(req), xp: progress.xp, level: progress.level };
    }));
    return {
      class: shape(cls),
      board,
      shares: shares.rows.map(s => ({
        id: s.id, name: s.name, subject: s.subject, foreign: s.foreign_lang, native: s.native_lang, testDate: s.test_date,
        format: s.format, articles: !!s.articles, cards: s.card_count,
        author: { id: String(s.author_id), name: firstName(s.author_name), avatar: avatarPath(s.author_id, s.avatar_etag) },
        mine: Number(s.author_id) === uidOf(req), updatedAt: new Date(s.updated_at).toISOString(),
        takenTestId: s.taken_test || null,
        newer: !!(s.taken_at && new Date(s.updated_at).getTime() > new Date(s.taken_at).getTime())
      })),
      invites: invites.rows.map(i => ({ id: String(i.id), maxUses: i.max_uses, uses: i.uses, expiresAt: new Date(i.expires_at).toISOString(), mine: Number(i.created_by) === uidOf(req) }))
    };
  });

  app.patch<{ Params: { id: string } }>('/api/classes/:id', auth, async (req, reply) => {
    const cls = await membership(uidOf(req), req.params.id);
    if (!cls) return reply.code(404).send({ error: 'not_found' });
    if (!cls.is_owner) return reply.code(403).send({ error: 'not_owner' });
    const b = (req.body || {}) as Record<string, unknown>;
    const name = b.name === undefined ? cls.name : cleanClassText(b.name, CLASS_NAME_MAX);
    const motto = b.motto === undefined ? cls.motto : cleanClassText(b.motto, CLASS_MOTTO_MAX);
    if (!name) return reply.code(400).send({ error: 'name_required' });
    const r = await pool.query('UPDATE classes SET name = $2, motto = $3 WHERE id = $1 RETURNING *', [cls.id, name, motto]);
    return { class: shape({ ...r.rows[0], is_owner: true, members: cls.members }) };
  });

  app.delete<{ Params: { id: string } }>('/api/classes/:id', auth, async (req, reply) => {
    const cls = await membership(uidOf(req), req.params.id);
    if (!cls) return reply.code(404).send({ error: 'not_found' });
    if (!cls.is_owner) return reply.code(403).send({ error: 'not_owner' });
    await pool.query('DELETE FROM classes WHERE id = $1', [cls.id]);
    return { ok: true };
  });

  app.post<{ Params: { id: string } }>('/api/classes/:id/leave', auth, async (req, reply) => {
    const cls = await membership(uidOf(req), req.params.id);
    if (!cls) return reply.code(404).send({ error: 'not_found' });
    await tx(pool, async c => {
      if (cls.is_owner) await releaseOwnedClasses(c, uidOf(req));
      await c.query('DELETE FROM class_members WHERE class_id = $1 AND user_id = $2', [cls.id, uidOf(req)]);
    });
    return { ok: true };
  });

  app.post<{ Params: { id: string } }>('/api/classes/:id/cover', auth, async (req, reply) => {
    const cls = await membership(uidOf(req), req.params.id);
    if (!cls) return reply.code(404).send({ error: 'not_found' });
    if (!cls.is_owner) return reply.code(403).send({ error: 'not_owner' });
    if (!req.isMultipart()) return reply.code(415).send({ error: 'multipart_required' });
    let buf: Buffer | null = null;
    for await (const part of req.parts()) {
      if (part.type === 'file' && !buf) buf = await part.toBuffer();
    }
    const type = buf ? sniff(buf) : null;
    if (!buf || !type || buf.length < 32) return reply.code(400).send({ error: 'bad_image' });
    if (buf.length > CLASS_COVER_MAX_BYTES) return reply.code(413).send({ error: 'image_too_big' });
    const etag = crypto.createHash('sha256').update(buf).digest('hex').slice(0, 16);
    await pool.query('UPDATE classes SET cover_data = $2, cover_type = $3, cover_etag = $4 WHERE id = $1', [cls.id, buf, type, etag]);
    return { cover: classCoverPath(cls.id, etag) };
  });

  app.delete<{ Params: { id: string } }>('/api/classes/:id/cover', auth, async (req, reply) => {
    const cls = await membership(uidOf(req), req.params.id);
    if (!cls) return reply.code(404).send({ error: 'not_found' });
    if (!cls.is_owner) return reply.code(403).send({ error: 'not_owner' });
    await pool.query('UPDATE classes SET cover_data = NULL, cover_type = NULL, cover_etag = NULL WHERE id = $1', [cls.id]);
    return { ok: true };
  });

  app.get<{ Params: { id: string }; Querystring: { v?: string; s?: string } }>('/api/classes/:id/cover', async (req, reply) => {
    const { id } = req.params, { v = '', s = '' } = req.query;
    if (!CLASS_ID.test(id) || !/^[a-f0-9]{16}$/.test(v) || s.length !== 22) return reply.code(404).send({ error: 'not_found' });
    const want = Buffer.from(coverSig(id, v)), got = Buffer.from(s);
    if (want.length !== got.length || !crypto.timingSafeEqual(want, got)) return reply.code(404).send({ error: 'not_found' });
    const r = (await pool.query('SELECT cover_data, cover_type, cover_etag FROM classes WHERE id = $1', [id])).rows[0];
    if (!r?.cover_data) return reply.code(404).send({ error: 'not_found' });
    return reply.header('Content-Type', r.cover_type)
      .header('Cache-Control', r.cover_etag === v ? 'private, max-age=31536000, immutable' : 'private, max-age=300')
      .header('X-Content-Type-Options', 'nosniff')
      .header('Content-Security-Policy', "default-src 'none'")
      .header('Cross-Origin-Resource-Policy', 'same-origin')
      .send(r.cover_data);
  });

  app.post<{ Params: { id: string } }>('/api/classes/:id/invites', auth, async (req, reply) => {
    if (limited(reply, inviteLimit(String(uidOf(req))))) return;
    const cls = await membership(uidOf(req), req.params.id);
    if (!cls) return reply.code(404).send({ error: 'not_found' });
    const b = (req.body || {}) as Record<string, unknown>;
    const days = Math.min(CLASS_INVITE_DAYS_MAX, Math.max(1, Math.round(Number(b.days) || CLASS_INVITE_DAYS_DEFAULT)));
    const maxUses = Math.min(CLASS_INVITE_USES_MAX, Math.max(1, Math.round(Number(b.maxUses) || CLASS_INVITE_USES_DEFAULT)));
    const open = Number((await pool.query(`SELECT count(*) FROM class_invites WHERE class_id = $1 AND revoked_at IS NULL AND uses < max_uses AND expires_at > now()`, [cls.id])).rows[0].count);
    if (open >= CLASS_OPEN_INVITES_MAX) return reply.code(409).send({ error: 'too_many_invites' });
    const token = crypto.randomBytes(24).toString('base64url');
    await pool.query(`INSERT INTO class_invites (class_id, created_by, token_hash, max_uses, expires_at) VALUES ($1,$2,$3,$4, now() + make_interval(days => $5))`,
      [cls.id, uidOf(req), tokenHash(config.appSecret, token), maxUses, days]);
    return reply.code(201).send({ invite: { url: `${config.publicUrl}/class#${token}`, maxUses, days } });
  });

  app.delete<{ Params: { id: string; inviteId: string } }>('/api/classes/:id/invites/:inviteId', auth, async (req, reply) => {
    const cls = await membership(uidOf(req), req.params.id);
    if (!cls || !/^\d{1,18}$/.test(req.params.inviteId)) return reply.code(404).send({ error: 'not_found' });
    const r = await pool.query(`UPDATE class_invites SET revoked_at = coalesce(revoked_at, now())
      WHERE id = $1 AND class_id = $2 AND ($3 OR created_by = $4)`, [req.params.inviteId, cls.id, cls.is_owner, uidOf(req)]);
    return r.rowCount ? { ok: true } : reply.code(404).send({ error: 'not_found' });
  });

  app.post('/api/class/preview', async req => {
    const token = tokenOf(req);
    if (!token) return { valid: false, reason: 'not_found' };
    const r = (await pool.query(`SELECT i.*, c.name, c.motto, c.cover_etag, u.name AS inviter,
      (SELECT count(*) FROM class_members m WHERE m.class_id = c.id)::int AS members
      FROM class_invites i JOIN classes c ON c.id = i.class_id JOIN users u ON u.id = coalesce(i.created_by, c.owner_id)
      WHERE i.token_hash = $1`, [tokenHash(config.appSecret, token)])).rows[0];
    if (!r) return { valid: false, reason: 'not_found' };
    const status = inviteStatus(r);
    if (status !== 'open') return { valid: false, reason: status };
    return { valid: true, className: r.name, motto: r.motto, cover: classCoverPath(r.class_id, r.cover_etag), members: r.members, inviterName: firstName(r.inviter) };
  });

  app.post('/api/class/join', auth, async (req, reply) => {
    if (limited(reply, joinLimit(String(uidOf(req))))) return;
    const token = tokenOf(req);
    if (!token) return reply.code(404).send({ error: 'not_found' });
    try {
      const result = await tx(pool, async c => {
        const inv = (await c.query(`SELECT i.*, c.name FROM class_invites i JOIN classes c ON c.id = i.class_id WHERE i.token_hash = $1 FOR UPDATE OF i`, [tokenHash(config.appSecret, token)])).rows[0];
        if (!inv) return { error: 'not_found' as const };
        const status = inviteStatus(inv);
        if (status !== 'open') return { error: status };
        const already = (await c.query('SELECT 1 FROM class_members WHERE class_id = $1 AND user_id = $2', [inv.class_id, uidOf(req)])).rows[0];
        if (already) return { classId: inv.class_id as string, name: inv.name as string };
        const n = Number((await c.query('SELECT count(*) FROM class_members WHERE class_id = $1', [inv.class_id])).rows[0].count);
        if (n >= CLASS_MEMBERS_MAX) return { error: 'class_full' as const };
        await c.query('INSERT INTO class_members (class_id, user_id) VALUES ($1,$2)', [inv.class_id, uidOf(req)]);
        await c.query('UPDATE class_invites SET uses = uses + 1 WHERE id = $1', [inv.id]);
        return { classId: inv.class_id as string, name: inv.name as string };
      });
      if ('error' in result) return reply.code(result.error === 'class_full' ? 409 : 400).send({ error: result.error });
      return result;
    } catch (e) { req.log.warn({ err: (e as Error).message }, 'class join failed'); return reply.code(400).send({ error: 'not_found' }); }
  });

  app.post<{ Params: { id: string } }>('/api/classes/:id/shares', auth, async (req, reply) => {
    const cls = await membership(uidOf(req), req.params.id);
    if (!cls) return reply.code(404).send({ error: 'not_found' });
    const testId = (req.body as { testId?: unknown } | null)?.testId;
    if (typeof testId !== 'string' || !ID_RE.test(testId)) return reply.code(400).send({ error: 'bad_test' });
    const test = (await pool.query(`SELECT id, name, subject, foreign_lang, native_lang, test_date, format, articles FROM tests WHERE user_id = $1 AND id = $2 AND NOT deleted`, [uidOf(req), testId])).rows[0];
    if (!test) return reply.code(404).send({ error: 'not_found' });
    const subject = oneOf<Subject>(test.subject, SUBJECT_KEYS), format = oneOf<Format>(test.format, FORMATS), native = oneOf<Lang>(test.native_lang, LANG_CODES);
    const foreign = test.foreign_lang ? oneOf<Lang>(test.foreign_lang, LANG_CODES) : null;
    if (!subject || !format || !native) return reply.code(400).send({ error: 'bad_test' });
    const cards = (await pool.query(`SELECT type, term, meaning, example, distractors FROM cards WHERE user_id = $1 AND test_id = $2 AND NOT deleted ORDER BY position, id`, [uidOf(req), testId])).rows;
    if (!cards.length) return reply.code(422).send({ error: 'no_cards' });
    if (cards.length > CLASS_CARDS_MAX) return reply.code(422).send({ error: 'too_many_cards', max: CLASS_CARDS_MAX });
    const shareId = await tx(pool, async c => {
      const up = await c.query(`INSERT INTO class_shares (id, class_id, author_id, source_test_id, name, subject, foreign_lang, native_lang, test_date, format, articles, card_count)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
        ON CONFLICT (class_id, author_id, source_test_id) DO UPDATE SET name = EXCLUDED.name, subject = EXCLUDED.subject, foreign_lang = EXCLUDED.foreign_lang,
          native_lang = EXCLUDED.native_lang, test_date = EXCLUDED.test_date, format = EXCLUDED.format, articles = EXCLUDED.articles, card_count = EXCLUDED.card_count, updated_at = now()
        RETURNING id`, [newId(), cls.id, uidOf(req), testId, clip(test.name, 60), subject, foreign, native, test.test_date, format, !!test.articles, cards.length]);
      const id = up.rows[0].id as string;
      await c.query('DELETE FROM class_share_cards WHERE share_id = $1', [id]);
      for (let i = 0; i < cards.length; i++) {
        const card = cards[i];
        const type: CardType = oneOf<CardType>(card.type, CARD_TYPES) || 'pair';
        const distractors = Array.isArray(card.distractors) ? card.distractors.filter((x: unknown) => typeof x === 'string').slice(0, 4).map((x: string) => clip(x, 200)) : [];
        await c.query(`INSERT INTO class_share_cards (share_id, position, type, term, meaning, example, distractors) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)`,
          [id, i, type, clip(card.term, 400), clip(card.meaning, 400), clip(card.example, 400), JSON.stringify(distractors)]);
      }
      return id;
    });
    return reply.code(201).send({ shareId, cards: cards.length });
  });

  app.delete<{ Params: { id: string; shareId: string } }>('/api/classes/:id/shares/:shareId', auth, async (req, reply) => {
    const cls = await membership(uidOf(req), req.params.id);
    if (!cls || !CLASS_ID.test(req.params.shareId)) return reply.code(404).send({ error: 'not_found' });
    const r = await pool.query('DELETE FROM class_shares WHERE id = $1 AND class_id = $2 AND (author_id = $3 OR $4)', [req.params.shareId, cls.id, uidOf(req), cls.is_owner]);
    return r.rowCount ? { ok: true } : reply.code(404).send({ error: 'not_found' });
  });

  app.get<{ Params: { id: string; shareId: string } }>('/api/classes/:id/shares/:shareId', auth, async (req, reply) => {
    const cls = await membership(uidOf(req), req.params.id);
    if (!cls || !CLASS_ID.test(req.params.shareId)) return reply.code(404).send({ error: 'not_found' });
    const s = (await pool.query('SELECT * FROM class_shares WHERE id = $1 AND class_id = $2', [req.params.shareId, cls.id])).rows[0];
    if (!s) return reply.code(404).send({ error: 'not_found' });
    const cards = (await pool.query('SELECT type, term, meaning, example, distractors FROM class_share_cards WHERE share_id = $1 ORDER BY position', [s.id])).rows;
    const take = (await pool.query('SELECT test_id, taken_at FROM class_share_takes WHERE share_id = $1 AND user_id = $2', [s.id, uidOf(req)])).rows[0];
    return {
      id: s.id, name: s.name, subject: s.subject, foreign: s.foreign_lang, native: s.native_lang, testDate: s.test_date,
      format: s.format, articles: !!s.articles,
      cards: cards.map(c => ({ type: c.type, term: c.term, meaning: c.meaning, example: c.example, distractors: c.distractors || [] })),
      takenTestId: take?.test_id || null,
      newer: !!(take && new Date(s.updated_at).getTime() > new Date(take.taken_at).getTime())
    };
  });

  app.post<{ Params: { id: string; shareId: string } }>('/api/classes/:id/shares/:shareId/take', auth, async (req, reply) => {
    const cls = await membership(uidOf(req), req.params.id);
    if (!cls || !CLASS_ID.test(req.params.shareId)) return reply.code(404).send({ error: 'not_found' });
    const testId = (req.body as { testId?: unknown } | null)?.testId;
    if (typeof testId !== 'string' || !ID_RE.test(testId)) return reply.code(400).send({ error: 'bad_test' });
    const s = (await pool.query('SELECT id FROM class_shares WHERE id = $1 AND class_id = $2', [req.params.shareId, cls.id])).rows[0];
    if (!s) return reply.code(404).send({ error: 'not_found' });
    await pool.query(`INSERT INTO class_share_takes (share_id, user_id, test_id) VALUES ($1,$2,$3)
      ON CONFLICT (share_id, user_id) DO UPDATE SET test_id = EXCLUDED.test_id, taken_at = now()`, [s.id, uidOf(req), testId]);
    return { ok: true, testId };
  });
}
