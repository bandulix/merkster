import { describe, expect, it } from 'vitest';
import { WEEKLY_TARGET, addUnits, contributionList, groupTotal, reached, weekKey } from '../challenge';

describe('weekly challenge', () => {
  it('names an ISO week and a shared target of 20', () => {
    expect(weekKey(new Date(Date.UTC(2026, 10, 12)))).toMatch(/^2026-W\d{2}$/);
    expect(WEEKLY_TARGET).toBe(20);
  });
  it('adds units only for people who are in, and celebrates the group', () => {
    expect(addUnits(4, 3, false)).toBe(7);
    expect(addUnits(4, 3, true)).toBe(4);
    const rows = [{ units: 12, optedOut: false }, { units: 9, optedOut: false }, { units: 5, optedOut: true }];
    expect(groupTotal(rows)).toBe(21);
    expect(reached(groupTotal(rows))).toBe(true);
    expect(reached(19)).toBe(false);
  });
  it('lists names alphabetically and does not sort by who did less', () => {
    const list = contributionList([
      { name: 'Noa', units: 2, optedOut: false },
      { name: 'Lena', units: 15, optedOut: false }
    ]);
    expect(list.map(r => r.name)).toEqual(['Lena', 'Noa']);
  });
});
