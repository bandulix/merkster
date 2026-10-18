import { describe, expect, it } from 'vitest';
import { GRADE_SPECS, families, familyRange, fmtPctIn, fmtResult, fromPct, nearestOption, scoreOf, toPct, validResult } from '../grades';
import { applyCap, fmtReward, gradeTrigger, matches, thresholdIn, totals, type EvalInput, type RewardRule } from '../rewards';
import { GRADE_SYSTEMS, type GradeSystem } from '../types';

const T0 = new Date('2026-03-01T10:00:00').getTime();
const H = 3600e3;
const input = (results: [string, string, number][], extra: Partial<EvalInput> = {}): EvalInput => ({
  results: results.map(([testId, subject, score], i) => ({ testId, subject: subject as never, score, testDate: `2026-03-${String(i + 2).padStart(2, '0')}`, enteredAt: T0 + (i + 1) * H })),
  practiceDays: [], levelUps: [], ...extra
});
const rule = (trigger: RewardRule['trigger'], createdAt = T0, validAsOf?: number): Pick<RewardRule, 'trigger' | 'createdAt' | 'validAsOf'> =>
  ({ trigger, createdAt, ...(validAsOf !== undefined ? { validAsOf } : {}) });

describe('grade conversion – all systems', () => {
  it('every system has a sane spec and every option round-trips', () => {
    for (const s of GRADE_SYSTEMS) {
      const spec = GRADE_SPECS[s];
      expect(spec.id).toBe(s);
      for (const o of spec.options || []) {
        const r = { system: s, value: o.value };
        expect(validResult({ ...r, enteredAt: 0 })).toBe(true);
        expect(toPct(r)).toBeCloseTo(o.pct, 5);
        expect(fmtResult(r)).toBe(o.label);
        expect(nearestOption(o.pct, s)!.label).toBe(o.label);
        expect(fmtPctIn(o.pct, s)).toBe(o.label);
        expect(fromPct(o.pct, s)).toBeCloseTo(o.value, 1);   // KMK rounding makes German grades slightly lossy
      }
    }
  });
  it('best option is 100-ish, worst is lowest; scores are monotone in quality', () => {
    for (const s of GRADE_SYSTEMS.filter(x => GRADE_SPECS[x].options)) {
      const pcts = GRADE_SPECS[s].options!.map(o => o.pct);          // best first
      for (let i = 1; i < pcts.length; i++) expect(pcts[i]).toBeLessThan(pcts[i - 1]);
      expect(pcts[0]).toBeGreaterThanOrEqual(94);
    }
  });
  it('German 1–6 with +/- (KMK)', () => {
    expect(toPct({ system: 'de_grade', value: 0.7 })).toBe(100);
    expect(toPct({ system: 'de_grade', value: 1 })).toBeCloseTo(93.33, 2);
    expect(toPct({ system: 'de_grade', value: 4 })).toBeCloseTo(33.33, 2);
    expect(toPct({ system: 'de_grade', value: 6 })).toBe(0);
    expect(fmtResult({ system: 'de_grade', value: 1.7 })).toBe('2+');
    expect(familyRange('de_grade', 2)).toEqual([toPct({ system: 'de_grade', value: 2.3 }), toPct({ system: 'de_grade', value: 1.7 })]);
    expect(families('de_grade').map(o => o.label)).toEqual(['1', '2', '3', '4', '5', '6']);
  });
  it('Oberstufe points, Austria, Switzerland, US, UK, percent, x of y', () => {
    expect(toPct({ system: 'points15', value: 15 })).toBe(100);
    expect(fmtResult({ system: 'points15', value: 11 })).toBe('11 P');
    expect(toPct({ system: 'at_grade', value: 1 })).toBe(94);
    expect(validResult({ system: 'at_grade', value: 6, enteredAt: 0 })).toBe(false);
    expect(toPct({ system: 'ch_grade', value: 6 })).toBe(100);
    expect(toPct({ system: 'ch_grade', value: 4 })).toBe(60);
    expect(validResult({ system: 'ch_grade', value: 4.5, enteredAt: 0 })).toBe(true);
    expect(validResult({ system: 'ch_grade', value: 4.25, enteredAt: 0 })).toBe(false);
    expect(fmtResult({ system: 'us_letter', value: 3.3 })).toBe('B+');
    expect(families('us_letter').map(o => o.label)).toEqual(['A', 'B', 'C', 'D', 'F']);
    expect(toPct({ system: 'uk_gcse', value: 9 })).toBe(95);
    expect(fmtResult({ system: 'uk_gcse', value: 4 })).toBe('4');
    expect(toPct({ system: 'percent', value: 73 })).toBe(73);
    expect(scoreOf({ system: 'xofy', value: 18, max: 24 })).toBe(75);
    expect(validResult({ system: 'xofy', value: 25, max: 24, enteredAt: 0 })).toBe(false);
  });
  it('converts between systems via the normalised score', () => {
    const one = toPct({ system: 'de_grade', value: 1 });
    expect(fmtPctIn(one, 'points15')).toBe('14 P');
    expect(fmtPctIn(one, 'us_letter')).toBe('A');
    expect(fmtPctIn(one, 'uk_gcse')).toBe('9');
    expect(fmtPctIn(one, 'at_grade')).toBe('1');
    expect(fmtPctIn(one, 'ch_grade')).toBe('5.5');
    expect(fmtPctIn(one, 'percent')).toBe('93 %');
  });
});

describe('reward rules', () => {
  const firstGrade: Record<GradeSystem, [number, number]> = {   // [value of a "top" grade, value of a mediocre grade]
    de_grade: [1, 3], points15: [14, 7], at_grade: [1, 3], ch_grade: [6, 4], us_letter: [4, 2], uk_gcse: [9, 5], percent: [90, 60], xofy: [90, 60]
  };
  it('"reward per top grade" works in every grading system', () => {
    for (const s of GRADE_SYSTEMS) {
      const [top, mid] = firstGrade[s];
      const tr = gradeTrigger(s, top, 'at_least')!;
      expect(tr).not.toBeNull();
      const max = s === 'xofy' ? 100 : undefined;
      const sc = (v: number) => scoreOf({ system: s, value: v, max });
      const m = matches(rule(tr), input([['a', 'biology', sc(top)], ['b', 'biology', sc(mid)], ['c', 'math', sc(top)]]));
      expect(m.map(x => x.key), s).toEqual(['result:a', 'result:c']);
    }
  });
  it('"1 or better" includes 1+ and 1-, "exactly 2" excludes 1 and 3', () => {
    const s = (v: number) => scoreOf({ system: 'de_grade', value: v });
    const atLeast1 = gradeTrigger('de_grade', 1, 'at_least')!;
    expect(matches(rule(atLeast1), input([['a', 'biology', s(0.7)], ['b', 'biology', s(1.3)], ['c', 'biology', s(1.7)]])).map(x => x.testId)).toEqual(['a', 'b']);
    const exactly2 = gradeTrigger('de_grade', 2, 'exactly')!;
    expect(matches(rule(exactly2), input([['a', 'biology', s(1)], ['b', 'biology', s(1.7)], ['c', 'biology', s(2.3)], ['d', 'biology', s(3)]])).map(x => x.testId)).toEqual(['b', 'c']);
  });
  it('subject filter, and only results entered after the rule was created count', () => {
    const tr = gradeTrigger('de_grade', 2, 'at_least', 'math')!;
    const inp = input([['a', 'math', 90], ['b', 'biology', 90], ['c', 'math', 90]]);
    expect(matches(rule(tr), inp).map(x => x.testId)).toEqual(['a', 'c']);
    expect(matches(rule(tr, T0 + 2.5 * H), inp).map(x => x.testId)).toEqual(['c']);
  });
  it('validAsOf gates past entries even when the rule was created earlier', () => {
    const tr = gradeTrigger('de_grade', 2, 'at_least')!;
    const inp = input([['a', 'math', 90], ['b', 'math', 90], ['c', 'math', 90]]);
    // created at T0, but only valid from the third entry onward
    expect(matches(rule(tr, T0, T0 + 2.5 * H), inp).map(x => x.testId)).toEqual(['c']);
    // validAsOf wins over a later createdAt when set earlier (school-year start)
    expect(matches(rule(tr, T0 + 10 * H, T0 + H), inp).map(x => x.testId)).toEqual(['a', 'b', 'c']);
    // report cards confirmed before validAsOf do not earn
    const cards = [
      { id: 'c1', issuedOn: '2026-01-30', createdAt: T0 - H, lines: [{ subjectId: 'math', score: 95 }], avgScore: 95, term: 'h1' as const },
      { id: 'c2', issuedOn: '2026-07-15', createdAt: T0 + H, lines: [{ subjectId: 'math', score: 95 }], avgScore: 95, term: 'final' as const }
    ];
    const rc = matches(rule({ kind: 'rc_avg', system: 'de_grade', value: 2, min: 70 }, T0 - 2 * H, T0), input([], { reportCards: cards }));
    expect(rc.map(x => x.cardId)).toEqual(['c2']);
  });
  it('thresholds survive a grading-system switch (converted + flagged)', () => {
    const tr = gradeTrigger('de_grade', 1, 'at_least')! as Extract<RewardRule['trigger'], { kind: 'grade' }>;
    expect(thresholdIn(tr, 'de_grade')).toEqual({ label: '1', converted: false });
    expect(thresholdIn(tr, 'points15')).toEqual({ label: '13 P', converted: true });
    expect(thresholdIn(tr, 'us_letter').converted).toBe(true);
    // a US "A" (95) still earns the German "1 or better" reward
    expect(matches(rule(tr), input([['a', 'biology', scoreOf({ system: 'us_letter', value: 4 })]])).length).toBe(1);
    expect(matches(rule(tr), input([['a', 'biology', scoreOf({ system: 'us_letter', value: 3 })]])).length).toBe(0);
  });
  it('personal best and improvement', () => {
    const inp = input([['a', 'biology', 60], ['b', 'math', 70], ['c', 'biology', 65], ['d', 'math', 80], ['e', 'biology', 75]]);
    expect(matches(rule({ kind: 'personal_best' }), inp).map(x => x.testId)).toEqual(['b', 'd']);
    expect(matches(rule({ kind: 'personal_best', subject: 'biology' }), inp).map(x => x.testId)).toEqual(['c', 'e']);
    expect(matches(rule({ kind: 'improvement', minDelta: 0 }), inp).map(x => x.testId)).toEqual(['c', 'd', 'e']);
    expect(matches(rule({ kind: 'improvement', minDelta: 10 }), inp).map(x => x.testId)).toEqual(['d', 'e']);
  });
  it('streak milestones and levels', () => {
    const days = ['2026-03-01', '2026-03-02', '2026-03-03', '2026-03-05', '2026-03-06', '2026-03-07', '2026-03-08'];
    const m = matches(rule({ kind: 'streak', days: 3 }), input([], { practiceDays: days }));
    expect(m.map(x => x.key)).toEqual(['streak:3:2026-03-01', 'streak:3:2026-03-05']);
    expect(matches(rule({ kind: 'streak', days: 7 }), input([], { practiceDays: days }))).toEqual([]);
    const lv = input([], { levelUps: [{ level: 2, at: T0 - H }, { level: 3, at: T0 + H }] });
    expect(matches(rule({ kind: 'level', level: 3 }), lv).map(x => x.key)).toEqual(['level:3']);
    expect(matches(rule({ kind: 'level', level: 2 }), lv)).toEqual([]);   // reached before the rule existed
  });
  it('monthly cap counts what was already earned', () => {
    const src = [1, 2, 3, 4].map(i => ({ key: 'result:' + i, at: T0 + i * H }));
    expect(applyCap(src, 2, []).map(s => s.key)).toEqual(['result:1', 'result:2']);
    expect(applyCap(src, 2, [{ key: 'result:1', at: T0 + H }]).map(s => s.key)).toEqual(['result:2']);
    expect(applyCap(src, null, [{ key: 'result:1', at: T0 + H }]).length).toBe(3);
  });
  it('formats rewards and totals', () => {
    expect(fmtReward({ type: 'money', amount: 5, currency: 'EUR' }, 'de-DE')).toMatch(/5\s?€/);
    expect(fmtReward({ type: 'other', text: 'Pizza night' }, 'en')).toBe('Pizza night');
    expect(totals([{ reward: { type: 'money', amount: 5, currency: 'EUR' } }, { reward: { type: 'money', amount: 2.5, currency: 'EUR' } }, { reward: { type: 'other', text: 'x' } }])).toEqual([{ type: 'money', currency: 'EUR', amount: 7.5 }]);
  });
});
