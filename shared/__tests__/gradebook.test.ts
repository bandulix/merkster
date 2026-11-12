import { describe, expect, it } from 'vitest';
import { adherenceBands, collectGrades, DEFAULT_TARGET_SCORE, erfolgsquote, meetsTarget, planEffect, presentGrades, scoreFor, trendOf, type GradeEntry } from '../gradebook';
import type { Test } from '../types';

const g = (patch: Partial<GradeEntry>): GradeEntry => {
  const system = patch.system || 'de_grade';
  const value = patch.value ?? 2;
  const { score: scorePatch, ...rest } = patch;
  return {
    id: 'g', testId: null, subject: 'biology', title: 'Bio', kind: 'klassenarbeit', date: '2026-03-01',
    mood: null, note: 'privat', adherence: null, withPlan: false, updatedAt: 1,
    ...rest, system, value, score: scorePatch ?? scoreFor(system, value)
  };
};

describe('grades', () => {
  it('normalises a German 2+ above the default target and a 4 below it', () => {
    const good = scoreFor('de_grade', 1.7);
    const weak = scoreFor('de_grade', 4);
    expect(meetsTarget(good, DEFAULT_TARGET_SCORE)).toBe(true);
    expect(meetsTarget(weak, DEFAULT_TARGET_SCORE)).toBe(false);
    expect(scoreFor('points15', 15)).toBe(100);
    expect(scoreFor('percent', 80)).toBe(80);
  });
  it('computes the success rate and a rising trend', () => {
    const grades = [g({ id: 'a', date: '2026-01-10', value: 4, score: scoreFor('de_grade', 4) }), g({ id: 'b', date: '2026-02-10', value: 3, score: scoreFor('de_grade', 3) }), g({ id: 'c', date: '2026-03-10', value: 2, score: scoreFor('de_grade', 2) })];
    expect(erfolgsquote(grades).hit).toBe(2);
    expect(trendOf(grades)).toBe('up');
  });
  it('separates plan-backed grades from grades without a plan and groups adherence', () => {
    const grades = [
      g({ id: 'p', withPlan: true, adherence: 80, score: 90, value: 1 }),
      g({ id: 'q', withPlan: false, score: 40, value: 5, date: '2026-04-01' })
    ];
    const effect = planEffect(grades);
    expect(effect.withPlan!.avg).toBeGreaterThan(effect.without!.avg);
    expect(adherenceBands(grades).map(b => b.id)).toEqual(['high']);
  });
  it('hides exact grades unless the student opted in, and never includes the note', () => {
    const grades = [g({ note: 'geheim', value: 1, score: 95 })];
    const summary = presentGrades('Lena', 'summary', grades);
    expect(summary.grades).toBeUndefined();
    expect(summary.summary?.n).toBe(1);
    expect(JSON.stringify(summary)).not.toContain('geheim');
    expect(presentGrades('Lena', 'hide', grades).summary).toBeUndefined();
    const open = presentGrades('Lena', 'grades', grades);
    expect(open.grades).toHaveLength(1);
    expect(JSON.stringify(open)).not.toContain('geheim');
  });
  it('keeps an older test result visible until it is saved as a grade', () => {
    const test = { id: 't1', name: 'Bio', subject: 'biology', foreign: null, native: 'de', created: '2026-03-01', testDate: '2026-03-20', format: 'mixed', articles: false, items: [{ id: 'c' }], days: [], result: { system: 'de_grade', value: 2, enteredAt: 5 } } as unknown as Test;
    const list = collectGrades([test], []);
    expect(list).toHaveLength(1);
    expect(list[0].title).toBe('Bio');
    expect(collectGrades([test], [g({ id: 'saved', testId: 't1' })])).toHaveLength(1);
  });
});
