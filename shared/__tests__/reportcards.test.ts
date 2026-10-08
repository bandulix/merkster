import { describe, expect, it } from 'vitest';
import { avgOf, avgThreshold, avgValue, CANON_SUBJECTS, compareCards, customId, examAverages, gapKind, lineScore, matchSubject, parseGradeText, subjectOfTest, termOf, termOfCard } from '../reportcards';
import { evaluateRule, gradeTrigger, moneyIn, rcTrigger, simulateReportCard, SIM_CARD_ID, type EvalCard, type EvalInput, type RewardTrigger, type SimRule } from '../rewards';
import { GRADE_SYSTEMS, type GradeSystem } from '../types';

describe('subject matching (synonyms + fuzzy)', () => {
  const cases: [string, string][] = [
    ['Mathe', 'math'], ['Mathematik', 'math'], ['M', 'math'], ['Mathematik (Grundkurs)', 'math'],
    ['Bio', 'biology'], ['Biologie', 'biology'], ['Deutsch', 'german'], ['D', 'german'], ['Englisch', 'english'], ['E', 'english'], ['Englisch 1. FS', 'english'],
    ['Geschichte', 'history'], ['Ge', 'history'], ['Erdkunde', 'geography'], ['Geo', 'geography'], ['Geographie', 'geography'],
    ['Physik', 'physics'], ['Ph', 'physics'], ['Chemie', 'chemistry'], ['Ch', 'chemistry'], ['Informatik', 'cs'], ['Inf', 'cs'],
    ['Kunst', 'art'], ['Musik', 'music'], ['Sport', 'sport'], ['Religion', 'religion'], ['Ev. Religion', 'religion'], ['Ethik', 'religion'],
    ['Latein', 'latin'], ['Französisch', 'french'], ['Franzosisch', 'french'], ['Spanisch', 'spanish'], ['PoWi', 'politics'], ['Sozialkunde', 'politics'],
    ['Mathematick', 'math'], ['Biologe', 'biology'], ['Geschichtte', 'history'], ['Englich', 'english']   // OCR / typos → fuzzy
  ];
  for (const [raw, id] of cases) it(`${raw} → ${id}`, () => { const m = matchSubject(raw); expect(m.id).toBe(id); expect(m.ignore).toBe(false); expect(m.confidence).toBeGreaterThan(0.6); });
  it('exact synonyms are certain, fuzzy ones less so', () => {
    expect(matchSubject('Mathe').confidence).toBe(1);
    expect(matchSubject('Matematik')).toMatchObject({ id: 'math', via: 'fuzzy' });
    expect(matchSubject('Matematik').confidence).toBeLessThan(1);
  });
  it('conduct / remarks are suggested to be ignored', () => {
    for (const x of ['Verhalten', 'Mitarbeit', 'Arbeitsverhalten', 'Sozialverhalten', 'Bemerkungen', 'Fehltage']) expect(matchSubject(x).ignore, x).toBe(true);
  });
  it('unknown subjects stay unmatched; custom subjects of the student win', () => {
    expect(matchSubject('Darstellendes Spiel').id).toBeNull();
    const custom = [{ id: customId('Darstellendes Spiel'), name: 'Darstellendes Spiel' }];
    expect(matchSubject('Darstellendes Spiel', custom)).toMatchObject({ id: 'c_darstellendes-spiel', confidence: 1, via: 'custom' });
  });
  it('every canonical subject matches its own names', () => {
    for (const c of CANON_SUBJECTS) { expect(matchSubject(c.name.de).id).toBe(c.id); for (const s of c.syn) expect(matchSubject(s).id, s).toBe(c.id); }
  });
  it('tests map to report-card subjects', () => {
    expect(subjectOfTest({ subject: 'languages', foreign: 'en' })).toBe('english');
    expect(subjectOfTest({ subject: 'languages', foreign: 'fr' })).toBe('french');
    expect(subjectOfTest({ subject: 'biology', foreign: null })).toBe('biology');
    expect(subjectOfTest({ subject: 'other', foreign: null })).toBeNull();
  });
});

describe('terms', () => {
  it('default German terms: Aug–Jan and Feb–Jul', () => {
    expect(termOf('2025-08-20')).toMatchObject({ id: '2025-1', schoolYear: '2025/26', half: 1, start: '2025-08-01', end: '2026-01-31' });
    expect(termOf('2025-12-01').id).toBe('2025-1');
    expect(termOf('2026-01-31').id).toBe('2025-1');
    expect(termOf('2026-02-01')).toMatchObject({ id: '2025-2', half: 2, start: '2026-02-01', end: '2026-07-31' });
    expect(termOf('2026-07-15').id).toBe('2025-2');
    expect(termOf('2026-08-01').id).toBe('2026-1');
  });
  it('editable per student (e.g. Sep–Jan / Feb–Aug)', () => {
    expect(termOf('2025-08-20', [9, 2])).toMatchObject({ id: '2024-2', schoolYear: '2024/25' });
    expect(termOf('2025-09-01', [9, 2])).toMatchObject({ id: '2025-1', start: '2025-09-01', end: '2026-01-31' });
    expect(termOf('2026-02-10', [9, 2])).toMatchObject({ id: '2025-2', end: '2026-08-31' });
  });
  it('a report card closes its term', () => {
    expect(termOfCard({ schoolYear: '2025/26', term: 'h1', issuedOn: '2026-01-30' }).id).toBe('2025-1');
    expect(termOfCard({ schoolYear: '2025/26', term: 'final', issuedOn: '2026-07-10' }).id).toBe('2025-2');
    expect(termOfCard({ schoolYear: '', term: 'custom', issuedOn: '2026-03-20' }).id).toBe('2025-2');
  });
  it('exam averages per subject in a term', () => {
    const T = (subject: string, foreign: string | null, testDate: string, value: number) => ({ subject, foreign, testDate, result: { system: 'de_grade' as GradeSystem, value, enteredAt: 0 } }) as never;
    const av = examAverages([T('math', null, '2025-09-10', 2), T('math', null, '2025-11-10', 3), T('math', null, '2026-03-01', 1), T('languages', 'en', '2025-10-01', 1), T('other', null, '2025-10-01', 1)], termOf('2025-10-01'));
    expect(av.get('math')!.n).toBe(2);
    expect(av.get('math')!.avg).toBeCloseTo((lineScore('de_grade', 2) + lineScore('de_grade', 3)) / 2, 5);
    expect(av.get('english')!.n).toBe(1);
    expect(av.size).toBe(2);
    expect(gapKind(null, 80)).toBe('none'); expect(gapKind(60, 80)).toBe('better'); expect(gapKind(80, 60)).toBe('worse'); expect(gapKind(70, 73)).toBe('match');
  });
});

describe('grades as printed on report cards', () => {
  it('German', () => {
    expect(parseGradeText('2', 'de_grade')).toBe(2); expect(parseGradeText('2-', 'de_grade')).toBeCloseTo(2.3);
    expect(parseGradeText('gut', 'de_grade')).toBe(2); expect(parseGradeText('sehr gut', 'de_grade')).toBe(1);
    expect(parseGradeText('befriedigend (3)', 'de_grade')).toBe(3); expect(parseGradeText('ausreichend', 'de_grade')).toBe(4);
    expect(parseGradeText('13', 'de_grade')).toBeNull(); expect(parseGradeText('', 'de_grade')).toBeNull();
  });
  it('other systems', () => {
    expect(parseGradeText('13 P', 'points15')).toBe(13); expect(parseGradeText('B+', 'us_letter')).toBe(3.3); expect(parseGradeText('F', 'us_letter')).toBe(0);
    expect(parseGradeText('5,5', 'ch_grade')).toBe(5.5); expect(parseGradeText('7', 'uk_gcse')).toBe(7); expect(parseGradeText('2', 'at_grade')).toBe(2);
    expect(parseGradeText('87 %', 'percent')).toBe(87); expect(parseGradeText('5.25', 'ch_grade')).toBeNull();
  });
  it('averages: Ø 1.5 from a 1 and a 2; thresholds invert averages', () => {
    const avg = avgOf([{ score: lineScore('de_grade', 1) }, { score: lineScore('de_grade', 2) }]);
    expect(avgValue('de_grade', avg)).toBeCloseTo(1.5, 2);
    for (const s of GRADE_SYSTEMS) for (const pct of [40, 75]) expect(avgThreshold(s, avgValue(s, pct)), s).toBeCloseTo(pct, 1);
  });
});

/* ---------- report-card reward rules + simulator ---------- */
const T0 = new Date('2026-01-10T10:00:00').getTime();
const card = (id: string, issuedOn: string, createdAt: number, sys: GradeSystem, grades: Record<string, number>): EvalCard => {
  const lines = Object.entries(grades).map(([subjectId, v]) => ({ subjectId, score: lineScore(sys, v) }));
  return { id, issuedOn, createdAt, lines, avgScore: avgOf(lines) };
};
const inp = (cards: EvalCard[]): EvalInput => ({ results: [], practiceDays: [], levelUps: [], reportCards: cards });
const prevCard = card('p', '2025-07-10', T0 - 200 * 864e5, 'de_grade', { math: 3, german: 2, english: 2, biology: 3 });
const rc = (kind: string, o: Parameters<typeof rcTrigger>[1]) => rcTrigger(kind, o, avgThreshold)!;

describe('report-card rules', () => {
  it('per subject at/above a grade, specific subject, improved, average, average improved, floor', () => {
    const c = card('c', '2026-01-30', T0 + 864e5, 'de_grade', { math: 2, german: 1, english: 1.3, biology: 3, art: 1 });
    const keys = (tr: RewardTrigger) => evaluateRule({ trigger: tr, createdAt: T0, capPerMonth: null }, inp([prevCard, c])).map(s => s.key.replace('rc:c:', ''));
    expect(keys(rc('rc_each', { system: 'de_grade', value: 1, mode: 'at_least' }))).toEqual(['each:german', 'each:english', 'each:art']);   // 1- counts as a 1
    expect(keys(rc('rc_each', { system: 'de_grade', value: 2, mode: 'exactly' }))).toEqual(['each:math']);
    expect(keys(rc('rc_subject', { subjectId: 'math', system: 'de_grade', value: 2, mode: 'at_least' }))).toEqual(['subj:math']);
    expect(keys(rc('rc_subject', { subjectId: 'biology', system: 'de_grade', value: 2, mode: 'at_least' }))).toEqual([]);
    expect(keys(rc('rc_improved', {}))).toEqual(['imp:math', 'imp:german', 'imp:english']);
    expect(keys(rc('rc_improved', { subjectId: 'math' }))).toEqual(['imp:math']);
    expect(keys(rc('rc_avg', { system: 'de_grade', value: 2 }))).toEqual(['avg']);       // Ø 1.66
    expect(keys(rc('rc_avg', { system: 'de_grade', value: 1.5 }))).toEqual([]);
    expect(keys(rc('rc_avg_improved', { minDelta: 0 }))).toEqual(['avgimp']);
    expect(keys(rc('rc_floor', { system: 'de_grade', value: 3, mode: 'at_least' }))).toEqual(['floor']);
    expect(keys(rc('rc_floor', { system: 'de_grade', value: 2, mode: 'at_least' }))).toEqual([]);
  });
  it('cards confirmed before the rule existed do not count; caps apply', () => {
    const c = card('c', '2026-01-30', T0 - 864e5, 'de_grade', { math: 1 });
    expect(evaluateRule({ trigger: rc('rc_each', { system: 'de_grade', value: 1 }), createdAt: T0, capPerMonth: null }, inp([c]))).toEqual([]);
    const c2 = card('c2', '2026-01-30', T0 + 864e5, 'de_grade', { math: 1, german: 1, english: 1 });
    expect(evaluateRule({ trigger: rc('rc_each', { system: 'de_grade', value: 1 }), createdAt: T0, capPerMonth: 2 }, inp([c2]))).toHaveLength(2);
  });
  it('thresholds convert between grading systems via the normalised score', () => {
    const tr = rc('rc_each', { system: 'de_grade', value: 1, mode: 'at_least' });
    const us = card('u', '2026-01-30', T0 + 864e5, 'us_letter', { math: 4, german: 3.7, english: 3 });   // A, A-, B
    expect(evaluateRule({ trigger: tr, createdAt: T0, capPerMonth: null }, inp([us])).map(s => s.subjectId)).toEqual(['math', 'german']);
  });
  it('every grading system: "per top grade" works', () => {
    const top: Record<GradeSystem, number> = { de_grade: 1, points15: 14, at_grade: 1, ch_grade: 6, us_letter: 4, uk_gcse: 9, percent: 90, xofy: 90 };
    for (const s of GRADE_SYSTEMS) {
      const tr = rc('rc_each', { system: s, value: top[s] });
      expect(tr, s).not.toBeNull();
      const c = card('c', '2026-01-30', T0 + 864e5, s, { math: top[s] });
      expect(evaluateRule({ trigger: tr, createdAt: T0, capPerMonth: null }, inp([c])), s).toHaveLength(1);
    }
  });
});

describe('simulator == real evaluation', () => {
  type P = { name: string };
  const rules: SimRule<P>[] = [
    { id: 'r1', supporterId: 'oma', supporter: { name: 'Oma' }, trigger: rc('rc_each', { system: 'de_grade', value: 1 }), reward: { type: 'money', amount: 5, currency: 'EUR' }, capPerMonth: null },
    { id: 'r2', supporterId: 'oma', supporter: { name: 'Oma' }, trigger: rc('rc_avg', { system: 'de_grade', value: 2 }), reward: { type: 'other', text: 'Pizza night' }, capPerMonth: null },
    { id: 'r3', supporterId: 'opa', supporter: { name: 'Opa' }, trigger: rc('rc_improved', {}), reward: { type: 'money', amount: 2, currency: 'EUR' }, capPerMonth: 2 },
    { id: 'r4', supporterId: 'tante', supporter: { name: 'Tante' }, trigger: rc('rc_floor', { system: 'de_grade', value: 3 }), reward: { type: 'money', amount: 10, currency: 'CHF' }, capPerMonth: null },
    { id: 'r5', supporterId: 'opa', supporter: { name: 'Opa' }, trigger: gradeTrigger('de_grade', 1, 'at_least')!, reward: { type: 'money', amount: 99, currency: 'EUR' }, capPerMonth: null }   // exam rule: ignored
  ];
  const scenarios: Record<string, number>[] = [
    { math: 1, german: 1, english: 2, biology: 3 }, { math: 3, german: 3, english: 3, biology: 3 }, { math: 1, german: 1, english: 1, biology: 1 },
    { math: 4, german: 2, english: 1, biology: 2 }, { math: 2, german: 2.3, english: 1.7, biology: 0.7 }
  ];
  for (const [i, g] of scenarios.entries()) it('scenario ' + (i + 1), () => {
    const now = T0 + 10 * 864e5;
    const hypo = card('x', '2026-01-30', now, 'de_grade', g);
    const sim = simulateReportCard(rules, { issuedOn: hypo.issuedOn, lines: hypo.lines, avgScore: hypo.avgScore }, [prevCard], [], now);
    // the real engine: the same card, confirmed after the rules were created
    const real = new Map<string, number>(); const realOther: string[] = [];
    for (const r of rules) for (const s of evaluateRule({ trigger: r.trigger, createdAt: T0, capPerMonth: r.capPerMonth }, inp([prevCard, { ...hypo, id: 'real' }]))) {
      if (!s.key.startsWith('rc:real:')) continue;
      if (r.reward.type === 'money') real.set(r.reward.currency, (real.get(r.reward.currency) || 0) + r.reward.amount); else realOther.push(r.reward.text);
    }
    expect(moneyIn(sim, 'EUR')).toBe(real.get('EUR') || 0);
    expect(moneyIn(sim, 'CHF')).toBe(real.get('CHF') || 0);
    expect(sim.otherCount).toBe(realOther.length);
    // currencies are never mixed; per-supporter subtotals add up to the grand total
    for (const cur of ['EUR', 'CHF'] as const) expect(sim.perSupporter.reduce((a, s) => a + (s.money.find(m => m.currency === cur)?.amount || 0), 0)).toBeCloseTo(moneyIn(sim, cur), 5);
    expect(sim.perSupporter.every(s => s.items.every(it => it.sources.every(src => src.cardId === SIM_CARD_ID)))).toBe(true);
  });
  it('known totals: two 1s + Ø ≤ 2 + improvements', () => {
    const now = T0 + 864e5;
    const h = card('x', '2026-01-30', now, 'de_grade', { math: 1, german: 1, english: 2, biology: 3 });
    const sim = simulateReportCard(rules, h, [prevCard], [], now);
    const oma = sim.perSupporter.find(s => s.supporter.name === 'Oma')!;
    expect(oma.money).toEqual([{ currency: 'EUR', amount: 10 }]);
    expect(oma.other).toEqual(['Pizza night']);
    const opa = sim.perSupporter.find(s => s.supporter.name === 'Opa')!;
    expect(opa.money).toEqual([{ currency: 'EUR', amount: 4 }]);    // math + german improved (cap 2/month)
    expect(sim.grand).toEqual([{ currency: 'EUR', amount: 14 }, { currency: 'CHF', amount: 10 }]);
  });
  it('the simulator respects caps already used this month', () => {
    const now = T0 + 864e5;
    const h = card('x', '2026-01-30', now, 'de_grade', { math: 1, german: 1, english: 1, biology: 1 });
    const used = [{ ruleId: 'r3', key: 'rc:old:imp:math', at: now - 3600e3 }];
    expect(simulateReportCard(rules, h, [prevCard], used, now).perSupporter.find(s => s.supporter.name === 'Opa')!.money).toEqual([{ currency: 'EUR', amount: 2 }]);
  });
});
