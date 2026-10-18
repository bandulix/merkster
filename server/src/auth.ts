/* Merkster – sign-in with Google only (OpenID Connect authorization-code flow with PKCE, state and nonce, via openid-client).
   - We store only Google's stable account id ("sub"), name, e-mail and profile picture (cached copy, see avatars.ts).
   - Session: random 256-bit token in an httpOnly, SameSite=Lax cookie (Secure on https). The DB stores only HMAC(APP_SECRET, token).
     SameSite=Lax + same-origin API means the cookie also works inside the installed PWA.
   - Admins come from ADMIN_EMAILS (verified e-mail). Optional ALLOWED_EMAIL_DOMAINS / ALLOWLIST restrict who may sign in.
   - Optional SIGNUP_CODE: a codeword needed to create a NEW account (see signup.ts for the exact precedence).
   - CSRF: state-changing /api calls must send `X-Merkster: 1` (custom header => CORS preflight; CORS is never enabled). */
import crypto from 'node:crypto';
import * as oidc from 'openid-client';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type pg from 'pg';
import type { Config } from './config';
import { limiter } from './ratelimit';
import { tx } from './db';
import { APP_COOKIE, APP_CSRF_HEADER } from '../../shared/brand';
import { avatarPath, refreshAvatar } from './avatars';
import { codeMatches, failureLimiter, signer, signupGate } from './signup';
import { inviteIsOpen } from './supporters';
import { classInviteIsOpen, releaseOwnedClasses } from './classes';

export const COOKIE = APP_COOKIE;
/** user columns we load per request (never the picture bytes) */
const USER_COLS = 'u.id, u.google_sub, u.email, u.name, u.avatar_url, u.avatar_etag, u.is_admin, u.is_supporter, u.created_at, u.last_login_at';
const FLOW_COOKIE = APP_COOKIE + '_oauth';
/** proof "entered the right codeword" / "came with a valid invite link" (signed, 15 min) */
const PASS_COOKIE = APP_COOKIE + '_signup';
/** a NEW Google account that still needs the codeword: verified identity parked for 10 min, no DB row yet */
const PENDING_COOKIE = APP_COOKIE + '_pending';
const PASS_TTL = 15 * 60e3, PENDING_TTL = 10 * 60e3;
interface Pending { sub: string; email: string | null; verified: boolean; name: string; picture: string | null; next: string }

export interface DbUser { id: number; google_sub: string; email: string | null; name: string; avatar_url: string | null; avatar_etag?: string | null; is_admin: boolean; is_supporter?: boolean; created_at: Date; last_login_at: Date | null; }
declare module 'fastify' {
  interface FastifyRequest { user: DbUser | null }
  interface FastifyInstance {
    requireUser: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireAdmin: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}
export const publicUser = (u: DbUser) => ({ id: String(u.id), name: u.name, email: u.email || null, avatar: avatarPath(u.id, u.avatar_etag), isAdmin: !!u.is_admin, createdAt: u.created_at });

/** only a relative in-app path is allowed as post-login target (no open redirects) */
const safeNext = (v: unknown) => (typeof v === 'string' && /^\/(?![/\\])[\w\-/?=&.%#]*$/.test(v) && v.length < 300 ? v : '/');
const safeAvatar = (v: unknown) => (typeof v === 'string' && /^https:\/\/[^\s"'<>]+$/.test(v) && v.length <= 500 ? v : null);

export function emailAllowed(config: Pick<Config, 'allowedDomains' | 'allowlist'>, email: string | null, verified: boolean): boolean {
  if (!config.allowedDomains.length && !config.allowlist.length) return true;   // empty = anyone with a Google account
  if (!email || !verified) return false;
  const e = email.toLowerCase();
  return config.allowlist.includes(e) || config.allowedDomains.includes(e.split('@')[1] || '');
}

export async function authPlugin(app: FastifyInstance, { pool, config }: { pool: pg.Pool; config: Config }) {
  const hmac = (t: string) => crypto.createHmac('sha256', config.appSecret).update(t).digest('base64url');
  const hashToken = (t: string) => crypto.createHmac('sha256', config.appSecret).update(t).digest('hex');
  const authLimit = limiter(config.authLimitPer10Min, 10 * 60 * 1000);
  const cookieBase = { path: '/', httpOnly: true, sameSite: 'lax' as const, secure: config.cookieSecure };

  /* ---- OpenID provider (Google; or the mock provider in tests) – discovered lazily, retried on failure ---- */
  let discovered: Promise<oidc.Configuration> | null = null;
  const provider = () => {
    if (!discovered) {
      const insecure = config.google.testIssuer && config.google.issuer.startsWith('http:');
      discovered = oidc.discovery(new URL(config.google.issuer), config.google.clientId, config.google.clientSecret, undefined,
        insecure ? { execute: [oidc.allowInsecureRequests] } : undefined).catch(e => { discovered = null; throw e; });
    }
    return discovered;
  };

  /* short-lived signed cookie carrying PKCE verifier + state + nonce between /google and /callback */
  const packFlow = (o: object) => { const b = Buffer.from(JSON.stringify(o)).toString('base64url'); return b + '.' + hmac(b); };
  const unpackFlow = (v: string | undefined): { v: string; s: string; n: string; next: string; exp: number } | null => {
    if (!v || v.length > 2000) return null;
    const [b, sig] = v.split('.');
    if (!b || !sig || sig.length !== hmac(b).length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(hmac(b)))) return null;
    try { const o = JSON.parse(Buffer.from(b, 'base64url').toString()); return o.exp > Date.now() ? o : null; } catch { return null; }
  };

  async function startSession(reply: FastifyReply, req: FastifyRequest, userId: number) {
    const token = crypto.randomBytes(32).toString('base64url');
    await pool.query('INSERT INTO auth_sessions (token_hash, user_id, expires_at, user_agent) VALUES ($1, $2, now() + make_interval(days => $3), $4)',
      [hashToken(token), userId, config.sessionDays, String(req.headers['user-agent'] || '').slice(0, 200)]);
    // Expired rows are invisible to the lookup above, but they still occupy the table.
    await pool.query('DELETE FROM auth_sessions WHERE expires_at < now()');
    reply.setCookie(COOKIE, token, { ...cookieBase, maxAge: config.sessionDays * 86400 });
  }

  const sign = signer(config.appSecret);
  const isAdminEmail = (email: string | null, verified: boolean) => !!email && verified && config.adminEmails.includes(email.toLowerCase());
  /** create or update the account from verified Google claims, refresh the avatar, start a session */
  async function signIn(req: FastifyRequest, reply: FastifyReply, c: Omit<Pending, 'next'>, existing: boolean, isAdmin: boolean) {
    const u: DbUser = (await pool.query(`INSERT INTO users (google_sub, email, name, avatar_url, is_admin, last_login_at) VALUES ($1,$2,$3,$4,$5, now())
      ON CONFLICT (google_sub) DO UPDATE SET email = EXCLUDED.email, name = EXCLUDED.name, avatar_url = EXCLUDED.avatar_url, is_admin = EXCLUDED.is_admin, last_login_at = now()
      RETURNING id, google_sub, email, name, avatar_url, avatar_etag, is_admin, is_supporter, created_at, last_login_at`, [c.sub, c.email, c.name, safeAvatar(c.picture), isAdmin])).rows[0];
    await refreshAvatar(pool, config, u.id, c.picture, req.log);   // skipped when the student chose or removed their own picture
    await startSession(reply, req, u.id);
    if (!existing) req.log.info({ userId: String(u.id), admin: isAdmin }, 'new user');
    reply.clearCookie(PASS_COOKIE, { path: '/api/auth/' }).clearCookie(PENDING_COOKIE, { path: '/api/auth/' });
  }

  app.decorateRequest('user', null);
  app.addHook('onRequest', async req => {
    // Static files, the service worker and fonts never read req.user. Looking the session up
    // for each of them turned every page load into a burst of identical database queries.
    if (!req.url.split('?')[0].startsWith('/api/')) return;
    const token = req.cookies?.[COOKIE];
    if (!token || token.length > 100) return;
    const r = await pool.query(`SELECT ${USER_COLS} FROM auth_sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = $1 AND s.expires_at > now()`, [hashToken(token)]);
    if (r.rows[0]) req.user = r.rows[0];
  });
  app.addHook('onRequest', async (req, reply) => {
    if (req.url.startsWith('/api/') && !['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.headers[APP_CSRF_HEADER] !== '1') {
      return reply.code(403).send({ error: 'csrf' });
    }
  });
  app.decorate('requireUser', async (req: FastifyRequest, reply: FastifyReply) => { if (!req.user) return reply.code(401).send({ error: 'unauthorized' }); });
  app.decorate('requireAdmin', async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.user) return reply.code(401).send({ error: 'unauthorized' });
    if (!req.user.is_admin) return reply.code(403).send({ error: 'forbidden' });
  });
  const fail = (reply: FastifyReply, code: string) => reply.clearCookie(FLOW_COOKIE, { path: '/api/auth/' }).redirect('/login?error=' + code, 302);

  /* 1) browser navigates here -> redirect to Google */
  app.get<{ Querystring: { next?: string } }>('/api/auth/google', async (req, reply) => {
    if (!config.googleConfigured) return fail(reply, 'not_configured');
    const rl = authLimit(req.ip);
    if (!rl.ok) return fail(reply, 'rate_limited');
    let conf: oidc.Configuration;
    try { conf = await provider(); } catch (e) { req.log.error({ err: (e as Error).message }, 'OIDC discovery failed'); return fail(reply, 'provider_unreachable'); }
    const verifier = oidc.randomPKCECodeVerifier(), state = oidc.randomState(), nonce = oidc.randomNonce();
    const url = oidc.buildAuthorizationUrl(conf, {
      redirect_uri: config.google.redirectUri, scope: 'openid email profile', response_type: 'code',
      code_challenge: await oidc.calculatePKCECodeChallenge(verifier), code_challenge_method: 'S256', state, nonce, prompt: 'select_account'
    });
    reply.setCookie(FLOW_COOKIE, packFlow({ v: verifier, s: state, n: nonce, next: safeNext(req.query.next), exp: Date.now() + 10 * 60e3 }), { ...cookieBase, path: '/api/auth/', maxAge: 600 });
    return reply.redirect(url.href, 302);
  });

  /* 2) Google redirects back here with ?code&state */
  app.get<{ Querystring: Record<string, string> }>('/api/auth/google/callback', async (req, reply) => {
    const flow = unpackFlow(req.cookies?.[FLOW_COOKIE]);
    if (req.query.error) return fail(reply, req.query.error === 'access_denied' ? 'cancelled' : 'failed');
    if (!flow) return fail(reply, 'expired');
    let claims: oidc.IDToken | undefined;
    try {
      const conf = await provider();
      const current = new URL(config.google.redirectUri);
      for (const [k, v] of Object.entries(req.query)) current.searchParams.set(k, String(v));
      const tokens = await oidc.authorizationCodeGrant(conf, current, { pkceCodeVerifier: flow.v, expectedState: flow.s, expectedNonce: flow.n, idTokenExpected: true });
      claims = tokens.claims();
    } catch (e) {
      req.log.warn({ err: (e as Error).message }, 'Google sign-in failed');
      return fail(reply, 'failed');
    }
    if (!claims?.sub) return fail(reply, 'failed');
    const email = typeof claims.email === 'string' ? claims.email.slice(0, 200) : null;
    const verified = claims.email_verified === true;
    const picture = typeof claims.picture === 'string' ? claims.picture.slice(0, 500) : null;
    const name = (typeof claims.name === 'string' ? claims.name : typeof claims.given_name === 'string' ? claims.given_name : '').slice(0, 100);
    const sub = String(claims.sub).slice(0, 255);
    const existing = !!(await pool.query('SELECT id FROM users WHERE google_sub = $1', [sub])).rows[0];
    const isAdmin = isAdminEmail(email, verified);
    const pass = sign.unpack<{ k: string }>('signup', req.cookies?.[PASS_COOKIE]);
    const gate = signupGate({ emailAllowed: emailAllowed(config, email, verified), existing, isAdmin, registrationOpen: config.registrationOpen,
      codeRequired: !!config.signupCode, hasCodePass: pass?.k === 'code', hasInvitePass: pass?.k === 'invite' });
    if (gate === 'code_required') {
      // no account is created: park the verified identity in a signed cookie and ask for the codeword
      reply.clearCookie(FLOW_COOKIE, { path: '/api/auth/' });
      reply.setCookie(PENDING_COOKIE, sign.pack('pending', { sub, email, verified, name, picture, next: flow.next } satisfies Pending, PENDING_TTL), { ...cookieBase, path: '/api/auth/', maxAge: PENDING_TTL / 1000 });
      return reply.redirect('/login?signup=code', 302);
    }
    if (gate !== 'allow') return fail(reply, gate);
    await signIn(req, reply, { sub, email, verified, name, picture }, existing, isAdmin);
    reply.clearCookie(FLOW_COOKIE, { path: '/api/auth/' });
    return reply.redirect(flow.next, 302);
  });

  /* ---- registration codeword (only when SIGNUP_CODE is set) ---- */
  const codeFail = failureLimiter(config.signupCodeMaxAttempts, 15 * 60e3), invitePassLimit = limiter(30, 10 * 60e3);
  /** checks a codeword from the body; replies itself (429 / 400) when it is not accepted */
  const checkCode = (req: FastifyRequest, reply: FastifyReply): boolean => {
    const b = codeFail.blocked(req.ip);
    if (b.blocked) { reply.header('Retry-After', String(b.retryAfter)).code(429).send({ error: 'rate_limited' }); return false; }
    if (!codeMatches(config.signupCode, (req.body as { code?: unknown } | null)?.code)) {
      codeFail.fail(req.ip);
      req.log.warn('wrong sign-up codeword');   // never log what was typed
      reply.code(400).send({ error: 'bad_code' }); return false;
    }
    return true;
  };
  const setPass = (reply: FastifyReply, k: 'code' | 'invite') =>
    reply.setCookie(PASS_COOKIE, sign.pack('signup', { k }, PASS_TTL), { ...cookieBase, path: '/api/auth/', maxAge: PASS_TTL / 1000 });

  /* a) typed on the login page BEFORE "Continue with Google" */
  app.post('/api/auth/signup-code', async (req, reply) => {
    if (!config.signupCode) return { ok: true, required: false };
    if (!checkCode(req, reply)) return;
    setPass(reply, 'code');
    return { ok: true };
  });
  /* b) the invite page: a valid invite link replaces the codeword (supporters) */
  app.post('/api/auth/invite-pass', async (req, reply) => {
    if (!config.signupCode) return { ok: true, required: false };
    const rl = invitePassLimit(req.ip);
    if (!rl.ok) return reply.header('Retry-After', String(rl.retryAfter)).code(429).send({ error: 'rate_limited' });
    const inviteToken = (req.body as { token?: unknown } | null)?.token;
    if (!(await inviteIsOpen(pool, config.appSecret, inviteToken)) && !(await classInviteIsOpen(pool, config.appSecret, inviteToken))) return reply.code(404).send({ error: 'not_found' });
    setPass(reply, 'invite');
    return { ok: true };
  });
  /* c) AFTER Google: a new account without a code was parked – show who it is and ask for the codeword */
  app.get('/api/auth/signup/pending', async req => {
    const p = sign.unpack<Pending>('pending', req.cookies?.[PENDING_COOKIE]);
    return p ? { pending: true, name: (p.name || '').trim().split(/\s+/)[0] || null, email: p.email } : { pending: false };
  });
  app.post('/api/auth/signup/complete', async (req, reply) => {
    const p = sign.unpack<Pending>('pending', req.cookies?.[PENDING_COOKIE]);
    if (!p) return reply.code(400).send({ error: 'expired' });
    if (config.signupCode && !checkCode(req, reply)) return;
    // re-check everything else – settings may have changed, or the account was created meanwhile
    const existing = !!(await pool.query('SELECT id FROM users WHERE google_sub = $1', [p.sub])).rows[0];
    const isAdmin = isAdminEmail(p.email, p.verified);
    const gate = signupGate({ emailAllowed: emailAllowed(config, p.email, p.verified), existing, isAdmin, registrationOpen: config.registrationOpen, codeRequired: false, hasCodePass: true, hasInvitePass: false });
    if (gate !== 'allow') { reply.clearCookie(PENDING_COOKIE, { path: '/api/auth/' }); return reply.code(403).send({ error: gate }); }
    await signIn(req, reply, p, existing, isAdmin);
    reply.clearCookie(PENDING_COOKIE, { path: '/api/auth/' });
    return { ok: true, next: safeNext(p.next) };
  });
  app.post('/api/auth/signup/cancel', async (_req, reply) => {
    reply.clearCookie(PENDING_COOKIE, { path: '/api/auth/' }).clearCookie(PASS_COOKIE, { path: '/api/auth/' });
    return { ok: true };
  });

  app.post('/api/auth/logout', async (req, reply) => {
    const token = req.cookies?.[COOKIE];
    if (token) await pool.query('DELETE FROM auth_sessions WHERE token_hash = $1', [hashToken(token)]);
    reply.clearCookie(COOKIE, { path: '/' });
    return { ok: true };
  });

  app.get('/api/me', { preHandler: app.requireUser }, async req => {
    const u = req.user as DbUser;
    const c = (await pool.query(`SELECT (SELECT count(*) FROM supporter_links WHERE supporter_id = $1)::int AS kids, (SELECT count(*) FROM supporter_links WHERE student_id = $1)::int AS supporters`, [u.id])).rows[0];
    return { user: { ...publicUser(u), isSupporter: !!u.is_supporter || c.kids > 0, kids: c.kids, supporters: c.supporters } };
  });

  /* delete my account and everything in it (GDPR Art. 17) */
  app.delete('/api/me', { preHandler: app.requireUser }, async (req, reply) => {
    await tx(pool, async c => {
      await releaseOwnedClasses(c, req.user!.id);
      await c.query('DELETE FROM users WHERE id = $1', [req.user!.id]);
    });
    req.log.info({ userId: String(req.user!.id) }, 'account deleted');
    reply.clearCookie(COOKIE, { path: '/' });
    return { ok: true };
  });

  /* ---- admin ---- */
  app.get('/api/admin/users', { preHandler: app.requireAdmin }, async () => {
    const r = await pool.query(`SELECT u.id, u.name, u.email, u.is_admin, u.created_at, u.last_login_at,
      (SELECT count(*) FROM tests t WHERE t.user_id = u.id AND NOT t.deleted) AS tests,
      (SELECT count(*) FROM ai_requests a WHERE a.user_id = u.id AND a.created_at > now() - interval '30 days') AS ai_30d
      FROM users u ORDER BY u.id`);
    return { users: r.rows.map(u => ({ id: String(u.id), name: u.name, email: u.email, isAdmin: u.is_admin, createdAt: u.created_at, lastLoginAt: u.last_login_at, tests: Number(u.tests), ai30d: Number(u.ai_30d) })) };
  });
  app.delete<{ Params: { id: string } }>('/api/admin/users/:id', { preHandler: app.requireAdmin }, async (req, reply) => {
    if (String(req.params.id) === String(req.user!.id)) return reply.code(400).send({ error: 'cannot_delete_self' });
    if (!/^\d+$/.test(req.params.id)) return reply.code(404).send({ error: 'not_found' });
    const r = await tx(pool, async c => {
      await releaseOwnedClasses(c, Number(req.params.id));
      return c.query('DELETE FROM users WHERE id = $1', [req.params.id]);
    });
    return r.rowCount ? { ok: true } : reply.code(404).send({ error: 'not_found' });
  });
}
