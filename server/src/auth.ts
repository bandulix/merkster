/* Snapwise – accounts & sessions.
   - argon2id password hashes (@node-rs/argon2)
   - random 256-bit session token in an httpOnly, SameSite=Lax cookie; the DB only stores HMAC(APP_SECRET, token)
   - the very first account becomes admin; REGISTRATION_OPEN=false closes sign-up (admins can still add accounts)
   - CSRF: state-changing /api calls must send `X-Snapwise: 1` (a custom header forces a CORS preflight, and CORS is never enabled) */
import crypto from 'node:crypto';
import { hash as argonHash, verify as argonVerify } from '@node-rs/argon2';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type pg from 'pg';
import type { Config } from './config';
import { tx } from './db';
import { limiter } from './ratelimit';

export const COOKIE = 'sw_sid';
const LOGIN_RE = /^[a-z0-9._@+-]{3,100}$/;

export interface DbUser { id: number; login: string; email: string | null; password_hash: string; is_admin: boolean; created_at: Date; last_login_at: Date | null; }
declare module 'fastify' {
  interface FastifyRequest { user: DbUser | null }
  interface FastifyInstance {
    requireUser: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireAdmin: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}
export const publicUser = (u: DbUser) => ({ id: String(u.id), login: u.login, email: u.email || null, isAdmin: !!u.is_admin, createdAt: u.created_at });

export async function authPlugin(app: FastifyInstance, { pool, config }: { pool: pg.Pool; config: Config }) {
  const hashToken = (t: string) => crypto.createHmac('sha256', config.appSecret).update(t).digest('hex');
  const authLimit = limiter(config.authLimitPer10Min, 10 * 60 * 1000);
  const dummyHash = await argonHash(crypto.randomBytes(16).toString('hex'));
  const cookieOpts = () => ({ path: '/', httpOnly: true, sameSite: 'lax' as const, secure: config.cookieSecure, maxAge: config.sessionDays * 86400 });

  function checkCreds(body: unknown): { error: string } | { login: string; password: string } {
    const b = (body || {}) as Record<string, unknown>;
    const login = String(b.login || '').trim().toLowerCase();
    const password = String(b.password || '');
    if (!LOGIN_RE.test(login)) return { error: 'invalid_login' };
    if (password.length < 8 || password.length > 200) return { error: 'weak_password' };
    return { login, password };
  }
  async function startSession(reply: FastifyReply, req: FastifyRequest, userId: number) {
    const token = crypto.randomBytes(32).toString('base64url');
    await pool.query('INSERT INTO auth_sessions (token_hash, user_id, expires_at, user_agent) VALUES ($1, $2, now() + make_interval(days => $3), $4)',
      [hashToken(token), userId, config.sessionDays, String(req.headers['user-agent'] || '').slice(0, 200)]);
    await pool.query('UPDATE users SET last_login_at = now() WHERE id = $1', [userId]);
    reply.setCookie(COOKIE, token, cookieOpts());
  }
  async function createUser(client: pg.Pool | pg.PoolClient, login: string, password: string, isAdmin: boolean): Promise<DbUser> {
    const r = await client.query('INSERT INTO users (login, email, password_hash, is_admin) VALUES ($1, $2, $3, $4) RETURNING *',
      [login, login.includes('@') ? login : null, await argonHash(password), isAdmin]);
    return r.rows[0];
  }

  app.decorateRequest('user', null);
  app.addHook('onRequest', async req => {
    const token = req.cookies?.[COOKIE];
    if (!token || token.length > 100) return;
    const r = await pool.query(`SELECT u.* FROM auth_sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = $1 AND s.expires_at > now()`, [hashToken(token)]);
    if (r.rows[0]) req.user = r.rows[0];
  });
  app.addHook('onRequest', async (req, reply) => {
    if (req.url.startsWith('/api/') && !['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.headers['x-snapwise'] !== '1') {
      return reply.code(403).send({ error: 'csrf' });
    }
  });
  app.decorate('requireUser', async (req: FastifyRequest, reply: FastifyReply) => { if (!req.user) return reply.code(401).send({ error: 'unauthorized' }); });
  app.decorate('requireAdmin', async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.user) return reply.code(401).send({ error: 'unauthorized' });
    if (!req.user.is_admin) return reply.code(403).send({ error: 'forbidden' });
  });
  const rateOk = (req: FastifyRequest, reply: FastifyReply) => {
    const r = authLimit(req.ip);
    if (!r.ok) { reply.header('Retry-After', r.retryAfter).code(429).send({ error: 'rate_limited', retryAfter: r.retryAfter }); return false; }
    return true;
  };

  app.post('/api/auth/register', async (req, reply) => {
    if (!rateOk(req, reply)) return reply;
    const c = checkCreds(req.body);
    if ('error' in c) return reply.code(400).send({ error: c.error });
    try {
      const user = await tx(pool, async client => {
        await client.query('SELECT pg_advisory_xact_lock(424242)');
        const n = Number((await client.query('SELECT count(*) AS n FROM users')).rows[0].n);
        if (n > 0 && !config.registrationOpen) throw Object.assign(new Error('closed'), { code: 'closed' });
        return createUser(client, c.login, c.password, n === 0);
      });
      await startSession(reply, req, user.id);
      req.log.info({ userId: String(user.id), admin: user.is_admin }, 'user registered');
      return reply.code(201).send({ user: publicUser(user) });
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code === 'closed') return reply.code(403).send({ error: 'registration_closed' });
      if (code === '23505') return reply.code(409).send({ error: 'login_taken' });
      throw e;
    }
  });

  app.post('/api/auth/login', async (req, reply) => {
    if (!rateOk(req, reply)) return reply;
    const b = (req.body || {}) as Record<string, unknown>;
    const login = String(b.login || '').trim().toLowerCase(), password = String(b.password || '').slice(0, 200);
    const u: DbUser | undefined = login && login.length <= 100 ? (await pool.query('SELECT * FROM users WHERE lower(login) = $1', [login])).rows[0] : undefined;
    const ok = await argonVerify(u ? u.password_hash : dummyHash, password).catch(() => false);
    if (!u || !ok) return reply.code(401).send({ error: 'bad_credentials' });
    await startSession(reply, req, u.id);
    return { user: publicUser(u) };
  });

  app.post('/api/auth/logout', async (req, reply) => {
    const token = req.cookies?.[COOKIE];
    if (token) await pool.query('DELETE FROM auth_sessions WHERE token_hash = $1', [hashToken(token)]);
    reply.clearCookie(COOKIE, { path: '/' });
    return { ok: true };
  });

  app.get('/api/me', { preHandler: app.requireUser }, async req => ({ user: publicUser(req.user as DbUser) }));

  app.post('/api/me/password', { preHandler: app.requireUser }, async (req, reply) => {
    const b = (req.body || {}) as Record<string, unknown>, u = req.user as DbUser;
    if (!(await argonVerify(u.password_hash, String(b.current || '')).catch(() => false))) return reply.code(401).send({ error: 'bad_credentials' });
    const next = String(b.next || '');
    if (next.length < 8 || next.length > 200) return reply.code(400).send({ error: 'weak_password' });
    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [await argonHash(next), u.id]);
    return { ok: true };
  });

  /* ---- admin ---- */
  app.get('/api/admin/users', { preHandler: app.requireAdmin }, async () => {
    const r = await pool.query(`SELECT u.id, u.login, u.is_admin, u.created_at, u.last_login_at,
      (SELECT count(*) FROM tests t WHERE t.user_id = u.id AND NOT t.deleted) AS tests,
      (SELECT count(*) FROM ai_requests a WHERE a.user_id = u.id AND a.created_at > now() - interval '30 days') AS ai_30d
      FROM users u ORDER BY u.id`);
    return { users: r.rows.map(u => ({ id: String(u.id), login: u.login, isAdmin: u.is_admin, createdAt: u.created_at, lastLoginAt: u.last_login_at, tests: Number(u.tests), ai30d: Number(u.ai_30d) })) };
  });
  app.post('/api/admin/users', { preHandler: app.requireAdmin }, async (req, reply) => {
    const c = checkCreds(req.body);
    if ('error' in c) return reply.code(400).send({ error: c.error });
    try { const u = await createUser(pool, c.login, c.password, !!((req.body || {}) as Record<string, unknown>).isAdmin); return reply.code(201).send({ user: publicUser(u) }); }
    catch (e) { if ((e as { code?: string }).code === '23505') return reply.code(409).send({ error: 'login_taken' }); throw e; }
  });
  app.delete<{ Params: { id: string } }>('/api/admin/users/:id', { preHandler: app.requireAdmin }, async (req, reply) => {
    if (String(req.params.id) === String(req.user!.id)) return reply.code(400).send({ error: 'cannot_delete_self' });
    if (!/^\d+$/.test(req.params.id)) return reply.code(404).send({ error: 'not_found' });
    const r = await pool.query('DELETE FROM users WHERE id = $1', [req.params.id]);
    return r.rowCount ? { ok: true } : reply.code(404).send({ error: 'not_found' });
  });
}
