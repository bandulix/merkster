import { describe, expect, it } from 'vitest';
import { codeMatches, failureLimiter, normaliseCode, signer, signupGate } from '../src/signup';

describe('sign-up codeword: comparison', () => {
  it('matches trimmed, case-insensitive, NFC-normalised', () => {
    expect(codeMatches('Merkster-Demo', 'merkster-demo')).toBe(true);
    expect(codeMatches('merkster-demo', '  MERKSTER-DEMO \n')).toBe(true);
    expect(codeMatches('Schüler', 'Schu\u0308ler')).toBe(true);   // ü typed as u + combining diaeresis
    expect(normaliseCode(42)).toBe('');
  });
  it('rejects wrong, partial, longer, empty and non-string input', () => {
    expect(codeMatches('merkster-demo', 'merkster')).toBe(false);
    expect(codeMatches('merkster-demo', 'merkster-demo2')).toBe(false);
    expect(codeMatches('merkster-demo', '')).toBe(false);
    expect(codeMatches('merkster-demo', undefined)).toBe(false);
    expect(codeMatches('merkster-demo', ['merkster-demo'])).toBe(false);
    expect(codeMatches('merkster-demo', 'x'.repeat(5000))).toBe(false);
  });
  it('an empty configured code never matches (gate is off instead)', () => {
    expect(codeMatches('', '')).toBe(false);
    expect(codeMatches('', 'anything')).toBe(false);
  });
});

describe('sign-up gate precedence', () => {
  const base = { emailAllowed: true, existing: false, isAdmin: false, registrationOpen: true, codeRequired: true, hasCodePass: false, hasInvitePass: false };
  it('new user without code or invite is stopped', () => { expect(signupGate(base)).toBe('code_required'); });
  it('a code pass or an invite pass lets a new user in', () => {
    expect(signupGate({ ...base, hasCodePass: true })).toBe('allow');
    expect(signupGate({ ...base, hasInvitePass: true })).toBe('allow');
  });
  it('existing accounts and admins never need the code', () => {
    expect(signupGate({ ...base, existing: true })).toBe('allow');
    expect(signupGate({ ...base, isAdmin: true })).toBe('allow');
  });
  it('no SIGNUP_CODE = normal open sign-up', () => { expect(signupGate({ ...base, codeRequired: false })).toBe('allow'); });
  it('REGISTRATION_OPEN=false wins over a correct code or invite (admins excepted)', () => {
    expect(signupGate({ ...base, registrationOpen: false, hasCodePass: true })).toBe('closed');
    expect(signupGate({ ...base, registrationOpen: false, hasInvitePass: true })).toBe('closed');
    expect(signupGate({ ...base, registrationOpen: false, isAdmin: true })).toBe('allow');
    expect(signupGate({ ...base, registrationOpen: false, existing: true })).toBe('allow');
  });
  it('domain / allowlist restrictions apply first – to everyone', () => {
    expect(signupGate({ ...base, emailAllowed: false, hasCodePass: true })).toBe('not_allowed');
    expect(signupGate({ ...base, emailAllowed: false, existing: true })).toBe('not_allowed');
    expect(signupGate({ ...base, emailAllowed: false, isAdmin: true })).toBe('not_allowed');
  });
});

describe('signed passes', () => {
  const s = signer('x'.repeat(40));
  it('round-trips and expires', () => {
    const v = s.pack('signup', { k: 'code' }, 1000);
    expect(s.unpack<{ k: string }>('signup', v)?.k).toBe('code');
    expect(s.unpack('signup', v, Date.now() + 2000)).toBeNull();
  });
  it('is bound to its purpose and to the secret', () => {
    const v = s.pack('signup', { k: 'code' }, 60e3);
    expect(s.unpack('pending', v)).toBeNull();
    expect(signer('y'.repeat(40)).unpack('signup', v)).toBeNull();
  });
  it('rejects tampering and junk', () => {
    const v = s.pack('signup', { k: 'invite' }, 60e3), [b, sig] = v.split('.');
    const forged = Buffer.from(JSON.stringify({ k: 'code', exp: Date.now() + 60e3 })).toString('base64url') + '.' + sig;
    expect(s.unpack('signup', forged)).toBeNull();
    expect(s.unpack('signup', b + '.')).toBeNull();
    expect(s.unpack('signup', 'garbage')).toBeNull();
    expect(s.unpack('signup', undefined)).toBeNull();
  });
});

describe('wrong-code limiter', () => {
  it('blocks after N failures per key, only counts failures, recovers after the window', () => {
    const l = failureLimiter(3, 1000), t0 = 1_000_000;
    for (let i = 0; i < 3; i++) { expect(l.blocked('ip1', t0).blocked).toBe(false); l.fail('ip1', t0); }
    const b = l.blocked('ip1', t0 + 10);
    expect(b.blocked).toBe(true);
    expect(b.blocked && b.retryAfter).toBeGreaterThan(0);
    expect(l.blocked('ip2', t0).blocked).toBe(false);
    expect(l.blocked('ip1', t0 + 1001).blocked).toBe(false);
  });
});
