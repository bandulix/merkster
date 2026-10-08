import { describe, expect, it } from 'vitest';
import { computeProgress, levelInfo, rankFor, xpToReach, XP, practiceBefore } from '../gamification';
import { fmtDeGrade, fmtResult, fromPct, parseDeGrade, toPct, validResult } from '../grades';
import { rankSVG } from '../rankArt';
import { RANKS } from '../gamification';
import type { HistoryEntry, Test } from '../types';

const day = (iso: string, h = 15) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d, h).getTime(); };
const sess = (iso: string, n: number, extra: Partial<HistoryEntry> = {}): HistoryEntry => ({ id: 's' + iso + n + (extra.at || ''), day: iso, n, firstTry: n, correct: n, ms: 300000, activeMs: 240000, at: day(iso), tests: [], ...extra });
const test = (o: Partial<Test>): Test => ({ id: 'tst1', name: 'Bio', subject: 'biology', foreign: null, native: 'de', created: '2026-09-01', testDate: '2026-09-20', format: 'mixed', articles: false, items: [], days: [], ...o });

describe('levels', () => {
  it('is a smooth increasing curve', () => {
    expect(xpToReach(1)).toBe(0); expect(xpToReach(2)).toBe(40);
    for (let L = 2; L < 60; L++) expect(xpToReach(L + 1) - xpToReach(L)).toBeGreaterThanOrEqual(xpToReach(L) - xpToReach(L - 1));
    expect(levelInfo(0).level).toBe(1); expect(levelInfo(40).level).toBe(2); expect(levelInfo(39).level).toBe(1);
    expect(levelInfo(xpToReach(10)).level).toBe(10);
  });
  it('maps levels to ranks', () => {
    expect(rankFor(1).id).toBe('rookie'); expect(rankFor(3).id).toBe('spark'); expect(rankFor(49).id).toBe('galaxy'); expect(rankFor(80).id).toBe('legend');
  });
  it('renders a distinct SVG badge per rank', () => {
    const svgs = RANKS.map(r => rankSVG(r));
    expect(new Set(svgs).size).toBe(RANKS.length);
    svgs.forEach(s => expect(s.startsWith('<svg')).toBe(true));
  });
});

describe('XP', () => {
  it('rewards recalls, first tries, session completion and the streak', () => {
    const p = computeProgress([sess('2026-10-01', 10, { firstTry: 9 })], [], day('2026-10-01', 18));
    expect(p.xp).toBe(10 * XP.correct + 9 * XP.firstTry + XP.session + XP.streakPerDay + XP.badge /* first_session */);
    expect(p.badges.map(b => b.id)).toContain('first_session');
  });
  it('soft-caps retrieval XP per day (anti-farming)', () => {
    const many = Array.from({ length: 10 }, (_, i) => sess('2026-10-01', 50, { id: 'x' + i, at: day('2026-10-01', 8 + i) }));
    const p = computeProgress(many, [], day('2026-10-01', 22));
    const raw = 10 * 50 * (XP.correct + XP.firstTry);
    const sessionXp = p.events.filter(e => e.kind === 'session').reduce((n, e) => n + e.xp, 0) - 10 * XP.session;
    expect(sessionXp).toBe(XP.dailySoftCap + Math.floor((raw - XP.dailySoftCap) / 2));
  });
  it('gives results less XP than practice', () => {
    const t = test({ result: { system: 'de_grade', value: 2, enteredAt: day('2026-09-21') } });
    const p = computeProgress([], [t], day('2026-09-22'));
    expect(p.events.find(e => e.kind === 'result')!.xp).toBe(XP.result);
    expect(XP.result).toBeLessThan(XP.session + 10 * XP.correct);
  });
});

describe('streaks', () => {
  it('counts consecutive days and keeps today open', () => {
    const h = ['2026-10-01', '2026-10-02', '2026-10-03'].map(d => sess(d, 5));
    expect(computeProgress(h, [], day('2026-10-03', 20)).streak.current).toBe(3);
    expect(computeProgress(h, [], day('2026-10-04', 9)).streak.current).toBe(3); // not broken yet today
    expect(computeProgress(h, [], day('2026-10-05', 9)).streak.current).toBe(0); // missed the 4th, no freeze
  });
  it('earns a freeze after 7 days and uses it for a missed day', () => {
    const days = Array.from({ length: 7 }, (_, i) => `2026-10-0${i + 1}`);
    const h = [...days, '2026-10-09'].map(d => sess(d, 5));   // 8th missed
    const p = computeProgress(h, [], day('2026-10-09', 20));
    expect(p.streak.current).toBe(8); expect(p.streak.frozenDays).toEqual(['2026-10-08']); expect(p.streak.freezes).toBe(0);
    expect(p.badges.map(b => b.id)).toEqual(expect.arrayContaining(['streak_3', 'streak_7', 'freeze_saved']));
  });
});

describe('badges', () => {
  it('spaced_out needs 5 different days before a test, night_owl not the night before a test', () => {
    const t = test({ id: 'abcd', created: '2026-09-01', testDate: '2026-09-20' });
    const h = ['2026-09-02', '2026-09-05', '2026-09-08', '2026-09-12'].map(d => sess(d, 6, { tests: ['abcd'] }));
    expect(computeProgress(h, [t], day('2026-09-15')).badges.map(b => b.id)).not.toContain('spaced_out');
    h.push(sess('2026-09-19', 6, { tests: ['abcd'], at: day('2026-09-19', 22) }));
    const ids = computeProgress(h, [t], day('2026-09-19', 23)).badges.map(b => b.id);
    expect(ids).toContain('spaced_out'); expect(ids).toContain('planner');
    expect(ids).not.toContain('night_owl');   // 22:00 on the night before the test = no reward for cramming
  });
  it('personal best and comeback come from results', () => {
    const a = test({ id: 'aaaa', testDate: '2026-09-10', result: { system: 'de_grade', value: 3.3, enteredAt: day('2026-09-11') } });
    const b = test({ id: 'bbbb', testDate: '2026-09-20', result: { system: 'de_grade', value: 1.7, enteredAt: day('2026-09-21') } });
    const ids = computeProgress([], [a, b], day('2026-09-22')).badges.map(x => x.id);
    expect(ids).toEqual(expect.arrayContaining(['first_result', 'personal_best', 'comeback']));
  });
  it('practiceBefore sums active minutes per test', () => {
    const t = test({ id: 'abcd' });
    const h = [sess('2026-09-02', 5, { tests: ['abcd'], activeMs: 600000 }), sess('2026-09-03', 5, { tests: ['abcd', 'zzzz'], activeMs: 600000 }), sess('2026-09-25', 5, { tests: ['abcd'] })];
    expect(practiceBefore(t, h)).toEqual({ sessions: 2, days: 2, minutes: 15 });
  });
});

describe('grades', () => {
  it('parses and formats German grades with +/-', () => {
    expect(parseDeGrade('2+')).toBeCloseTo(1.7); expect(parseDeGrade('2-')).toBeCloseTo(2.3); expect(parseDeGrade('6-')).toBeNull(); expect(parseDeGrade('7')).toBeNull();
    for (const g of ['1+', '1', '1-', '3+', '4-', '6']) expect(fmtDeGrade(parseDeGrade(g)!)).toBe(g);
  });
  it('normalises every system to 0–100 and back', () => {
    expect(toPct({ system: 'de_grade', value: 0.7 })).toBeCloseTo(100, 0); expect(toPct({ system: 'de_grade', value: 6 })).toBe(0);
    expect(toPct({ system: 'points15', value: 15 })).toBe(100); expect(toPct({ system: 'xofy', value: 30, max: 40 })).toBe(75);
    expect(fmtDeGrade(fromPct(toPct({ system: 'points15', value: 11 }), 'de_grade'))).toBe('2');   // 11 P = 2
    expect(fmtResult({ system: 'xofy', value: 34.5, max: 40 })).toBe('34.5/40');
  });
  it('validates ranges', () => {
    expect(validResult({ system: 'points15', value: 16 })).toBe(false); expect(validResult({ system: 'xofy', value: 5, max: 4 })).toBe(false);
    expect(validResult({ system: 'percent', value: 88 })).toBe(true);
  });
});
