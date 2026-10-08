/* Server-side sanitising of reward rules: what the client sends is never trusted. */
import { describe, expect, it } from 'vitest';
import { cleanReward, cleanTrigger } from '../src/rewards';
import { cleanCard } from '../src/reportcards';

describe('cleanReward', () => {
  it('keeps the chosen currency', () => {
    for (const c of ['EUR', 'CHF', 'USD', 'GBP']) expect(cleanReward({ type: 'money', amount: 5, currency: c })).toEqual({ type: 'money', amount: 5, currency: c });
  });
  it('defaults unknown currencies to EUR and rounds to cents', () => {
    expect(cleanReward({ type: 'money', amount: 2.345, currency: 'BTC' })).toEqual({ type: 'money', amount: 2.35, currency: 'EUR' });
  });
  it('rejects silly amounts and empty texts; strips markup from text', () => {
    expect(cleanReward({ type: 'money', amount: 0 })).toBeNull();
    expect(cleanReward({ type: 'money', amount: 5000 })).toBeNull();
    expect(cleanReward({ type: 'other', text: '   ' })).toBeNull();
    expect(cleanReward({ type: 'other', text: '<b>Pizza</b> night' })).toEqual({ type: 'other', text: 'bPizza/b night' });
  });
});
describe('cleanTrigger', () => {
  it('rebuilds report-card thresholds on the server', () => {
    const t = cleanTrigger({ kind: 'rc_avg', system: 'de_grade', value: 2, min: 0 });
    expect(t).toMatchObject({ kind: 'rc_avg', system: 'de_grade', value: 2 });
    expect((t as { min: number }).min).toBeCloseTo(73.33, 1);
    expect(cleanTrigger({ kind: 'rc_subject', subjectId: 'math', system: 'de_grade', value: 1, mode: 'at_least' })).toMatchObject({ kind: 'rc_subject', subjectId: 'math' });
    expect(cleanTrigger({ kind: 'nope' })).toBeNull();
  });
});
describe('cleanCard', () => {
  it('validates subjects, grades, duplicates and computes scores itself', () => {
    const c = cleanCard({ system: 'de_grade', issuedOn: '2026-01-30', term: 'h1', schoolYear: '2025/26', lines: [
      { subjectId: 'math', value: 1, score: 0 }, { subjectId: 'math', value: 3 }, { subjectId: 'evil', value: 1 }, { subjectId: 'c_theater', name: 'Theater', value: 2 }, { subjectId: 'german', value: 9 }] });
    expect(c!.lines.map(l => l.subjectId)).toEqual(['math', 'c_theater']);
    expect(c!.lines[0].score).toBeGreaterThan(90);
    expect(cleanCard({ system: 'de_grade', issuedOn: 'yesterday', lines: [] })).toBeNull();
  });
});
