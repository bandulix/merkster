import { describe, expect, it } from 'vitest';
import { DAY_MS, PICTURES_PER_TEST, TESTS_PER_24H, acceptPictures, createdWithin24h, recentTestCount } from '../limits';

describe('picture slots', () => {
  it('fills only the slots that are left', () => {
    expect(PICTURES_PER_TEST).toBe(10);
    expect(acceptPictures(0, 10)).toBe(10);
    expect(acceptPictures(7, 5)).toBe(3);
    expect(acceptPictures(10, 1)).toBe(0);
    expect(acceptPictures(0, 0)).toBe(0);
    expect(acceptPictures(-3, 4.9)).toBe(4);
    expect(acceptPictures(9, 30)).toBe(1);
  });
});

describe('tests per 24 hours', () => {
  const now = Date.parse('2026-10-18T12:00:00Z');
  it('uses a rolling day', () => {
    expect(TESTS_PER_24H).toBe(3);
    expect(createdWithin24h(now - DAY_MS + 1, now)).toBe(true);
    expect(createdWithin24h(now - DAY_MS, now)).toBe(false);
    expect(createdWithin24h(now + 1, now)).toBe(false);
    expect(createdWithin24h(Number.NaN, now)).toBe(false);
  });
  it('counts a timestamp when it has one, otherwise the calendar day', () => {
    const n = recentTestCount([
      { createdAt: now - 1000 },
      { createdAt: now - DAY_MS - 1 },
      { created: '2026-10-18' },
      { created: '2026-10-16' },
      {}
    ], now);
    expect(n).toBe(2);
  });
  it('does not let a calendar day override an older timestamp', () => {
    expect(recentTestCount([{ createdAt: now - DAY_MS - 5, created: '2026-10-18' }], now)).toBe(0);
  });
});
