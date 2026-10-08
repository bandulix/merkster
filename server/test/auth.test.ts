import { describe, expect, it } from 'vitest';
import { emailAllowed } from '../src/auth';
import { cleanResult, cleanSession, cleanProfile } from '../src/sanitize';

describe('sign-in allowlist', () => {
  const open = { allowedDomains: [], allowlist: [] };
  it('empty lists = anyone with a Google account', () => { expect(emailAllowed(open, null, false)).toBe(true); });
  it('domains and allowlist need a verified e-mail', () => {
    const c = { allowedDomains: ['schule.de'], allowlist: ['friend@gmail.com'] };
    expect(emailAllowed(c, 'Anna@Schule.de', true)).toBe(true);
    expect(emailAllowed(c, 'anna@schule.de', false)).toBe(false);
    expect(emailAllowed(c, 'friend@gmail.com', true)).toBe(true);
    expect(emailAllowed(c, 'evil@schule.de.evil.com', true)).toBe(false);
    expect(emailAllowed(c, 'x@gmail.com', true)).toBe(false);
  });
});
describe('sanitizing new fields', () => {
  it('accepts valid results only', () => {
    expect(cleanResult({ system: 'de_grade', value: 2.3, enteredAt: 1 })).toMatchObject({ system: 'de_grade', value: 2.3 });
    expect(cleanResult({ system: 'percent', value: 120 })).toBeNull();
    expect(cleanResult({ system: 'xofy', value: 3 })).toBeNull();
    expect(cleanResult('<script>')).toBeNull();
  });
  it('keeps active time and recall counts of sessions bounded', () => {
    const s = cleanSession({ id: 'abcd1234', day: '2026-10-01', n: 5, firstTry: 4, ms: 1e12, activeMs: 9e9, correct: -3, at: 123 })!;
    expect(s.ms).toBe(864e5); expect(s.activeMs).toBe(864e5); expect(s.correct).toBe(0); expect(s.at).toBe(123);
  });
  it('profile settings: grading, sound default off, ack lists filtered', () => {
    const p = cleanProfile({ data: { settings: { grading: 'nope', ackBadges: ['ok_1', '<x>', 5], ackLevel: 1e9 } }, updatedAt: 1 })!;
    expect(p.data.settings).toMatchObject({ grading: 'de_grade', sound: false, ackBadges: ['ok_1'], ackLevel: 1000 });
  });
});
