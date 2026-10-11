/* Merkster – registration codeword (SIGNUP_CODE).
   - Only gates FIRST-TIME account creation through Google sign-in. Existing accounts, ADMIN_EMAILS and supporters
     who arrive with a valid invite link never need it.
   - The code itself never leaves the server: the browser only learns *whether* one is required (/api/config).
   - Compared in constant time (HMAC of both sides, then timingSafeEqual) after a forgiving normalisation
     (trimmed, Unicode NFC, case-insensitive) so "Merkster-Demo " typed on a phone still matches.
   - Proof of a correct code / a valid invite travels as a short-lived HMAC-signed cookie (no server state). */
import crypto from 'node:crypto';

export const normaliseCode = (v: unknown) => (typeof v === 'string' ? v.normalize('NFC').trim().toLowerCase() : '');

/** constant-time comparison; an empty expected code never matches anything */
export function codeMatches(expected: string, given: unknown): boolean {
  const e = normaliseCode(expected), g = normaliseCode(given);
  if (!e || !g || g.length > 200) return false;
  const key = crypto.randomBytes(32);   // fixed-length digests => timingSafeEqual never leaks the length
  const h = (s: string) => crypto.createHmac('sha256', key).update(s).digest();
  return crypto.timingSafeEqual(h(e), h(g));
}

export type GateResult = 'allow' | 'not_allowed' | 'closed' | 'code_required';
/** Who may sign in / sign up – in this order:
 *  1. ALLOWED_EMAIL_DOMAINS / ALLOWLIST (if set) apply to everyone, existing accounts included → 'not_allowed'
 *  2. an existing account always gets in (no code)
 *  3. ADMIN_EMAILS may always create their account (no code, even when registration is closed)
 *  4. REGISTRATION_OPEN=false blocks every other new account → 'closed'
 *  5. SIGNUP_CODE (if set): a new account needs a proof of the code OR of a valid invite link → 'code_required' */
export function signupGate(o: { emailAllowed: boolean; existing: boolean; isAdmin: boolean; registrationOpen: boolean; codeRequired: boolean; hasCodePass: boolean; hasInvitePass: boolean }): GateResult {
  if (!o.emailAllowed) return 'not_allowed';
  if (o.existing || o.isAdmin) return 'allow';
  if (!o.registrationOpen) return 'closed';
  if (o.codeRequired && !o.hasCodePass && !o.hasInvitePass) return 'code_required';
  return 'allow';
}

/** HMAC-signed, expiring, purpose-bound token (cookie value): base64url(json).sig */
export function signer(secret: string) {
  const mac = (purpose: string, b: string) => crypto.createHmac('sha256', secret).update(purpose + ':' + b).digest('base64url');
  return {
    pack(purpose: string, o: Record<string, unknown>, ttlMs: number) {
      const b = Buffer.from(JSON.stringify({ ...o, exp: Date.now() + ttlMs })).toString('base64url');
      return b + '.' + mac(purpose, b);
    },
    unpack<T = Record<string, unknown>>(purpose: string, v: string | undefined, now = Date.now()): (T & { exp: number }) | null {
      if (!v || v.length > 4000) return null;
      const [b, sig] = v.split('.');
      if (!b || !sig) return null;
      const want = Buffer.from(mac(purpose, b)), got = Buffer.from(sig);
      if (want.length !== got.length || !crypto.timingSafeEqual(want, got)) return null;
      try { const o = JSON.parse(Buffer.from(b, 'base64url').toString()); return o && typeof o.exp === 'number' && o.exp > now ? o : null; } catch { return null; }
    }
  };
}

/** per-key counter of FAILED attempts (successful ones don't count) */
export function failureLimiter(max: number, windowMs: number) {
  const hits = new Map<string, number[]>();
  const live = (k: string, now: number) => (hits.get(k) || []).filter(t => now - t < windowMs);
  setInterval(() => { const now = Date.now(); for (const k of [...hits.keys()]) { const a = live(k, now); if (a.length) hits.set(k, a); else hits.delete(k); } }, windowMs).unref();
  return {
    blocked(k: string, now = Date.now()): { blocked: false } | { blocked: true; retryAfter: number } {
      const a = live(k, now); hits.set(k, a);
      return a.length >= max ? { blocked: true, retryAfter: Math.max(1, Math.ceil((windowMs - (now - a[0])) / 1000)) } : { blocked: false };
    },
    fail(k: string, now = Date.now()) { const a = live(k, now); a.push(now); hits.set(k, a); }
  };
}
