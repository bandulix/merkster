import { describe, expect, it } from 'vitest';
import { boardOrder, cleanClassText, CLASS_MOTTO_MAX, CLASS_NAME_MAX } from '../classes';

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
