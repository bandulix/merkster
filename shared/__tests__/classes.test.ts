import { describe, expect, it } from 'vitest';
import {
  boardOrder, bossMaxHp, clashAnswerOk, cleanClassText, pickClashPositions,
  BOSS_HP_MIN, CLASS_MOTTO_MAX, CLASS_NAME_MAX, CLASH_CARDS_DEFAULT
} from '../classes';

describe('class text', () => {
  it('trims, strips markup and caps the length', () => {
    expect(cleanClassText('  8b <Bio>  ', CLASS_NAME_MAX)).toBe('8b Bio');
    expect(cleanClassText('a\nb', 10)).toBe('ab');
    expect(cleanClassText('x'.repeat(50), CLASS_NAME_MAX)).toHaveLength(CLASS_NAME_MAX);
    expect(cleanClassText(12, CLASS_MOTTO_MAX)).toBe('');
  });
});

describe('leaderboard order', () => {
  it('puts the higher XP first and breaks a tie by name', () => {
    const rows = boardOrder([
      { name: 'Mia', xp: 10 },
      { name: 'Anna', xp: 40 },
      { name: 'Ben', xp: 10 }
    ]);
    expect(rows.map(r => r.name)).toEqual(['Anna', 'Ben', 'Mia']);
  });
});

describe('boss HP', () => {
  it('scales with cards and stays in range', () => {
    expect(bossMaxHp(0)).toBe(BOSS_HP_MIN);
    expect(bossMaxHp(10)).toBe(30);
    expect(bossMaxHp(5)).toBe(BOSS_HP_MIN);
    expect(bossMaxHp(1000)).toBeLessThanOrEqual(600);
  });
});

describe('clash card pick', () => {
  it('is deterministic for the same seed', () => {
    const a = pickClashPositions(20, CLASH_CARDS_DEFAULT, 'seed-a');
    const b = pickClashPositions(20, CLASH_CARDS_DEFAULT, 'seed-a');
    const c = pickClashPositions(20, CLASH_CARDS_DEFAULT, 'seed-b');
    expect(a).toEqual(b);
    expect(a).toHaveLength(CLASH_CARDS_DEFAULT);
    expect(a).not.toEqual(c);
    expect(new Set(a).size).toBe(a.length);
  });
});

describe('clash answer check', () => {
  it('accepts case, articles and alternatives', () => {
    expect(clashAnswerOk('the house', 'House')).toBe(true);
    expect(clashAnswerOk('der Tisch', 'Tisch')).toBe(true);
    expect(clashAnswerOk('run; sprint', 'sprint')).toBe(true);
    expect(clashAnswerOk('cat', 'dog')).toBe(false);
    expect(clashAnswerOk('cat', '')).toBe(false);
  });
});
