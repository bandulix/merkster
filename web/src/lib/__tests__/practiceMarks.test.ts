import { describe, expect, it } from 'vitest';
import type { CardState, Test } from '../../../../shared/types';
import { Practice } from '../practice';

const st = (): CardState => ({ introduced: false, sessions: 0, lapses: 0, dueAt: null, struggledLast: false });

function fixture(): Test {
  return {
    id: 't1', name: 'En', subject: 'languages', foreign: 'en', native: 'de',
    created: '2026-10-20', testDate: '2026-10-30', format: 'meaning', articles: false, days: [],
    items: [1, 2].map(i => ({ id: 'c' + i, type: 'pair' as const, term: 't' + i, meaning: 'm' + i, example: '', st: st() }))
  };
}

describe('practice segment marks', () => {
  it('marks study cards, correct answers, and a requeued miss', () => {
    const test = fixture();
    const p = new Practice(() => test, [
      { testId: 't1', itemId: 'c1', isNew: true, morning: false },
      { testId: 't1', itemId: 'c2', isNew: true, morning: false }
    ], Date.now(), () => {});
    expect(p.outcomes.length).toBe(p.queue.length);
    expect(p.current()?.kind).toBe('study');
    p.next();
    expect(p.outcomes[0]).toBe('study');
    while (p.current()?.kind === 'study') p.next();
    const card = p.current();
    expect(card?.key).toBeTruthy();
    const at = p.pos;
    p.answered(card!.key!, false);
    expect(p.outcomes[at]).toBe('bad');
    expect(p.outcomes.length).toBe(p.queue.length);
    expect(p.outcomes.filter(m => m === 'open').length).toBeGreaterThan(0);
    p.next();
    const again = p.current();
    expect(again?.key).toBeTruthy();
    const at2 = p.pos;
    p.answered(again!.key!, true);
    expect(p.outcomes[at2]).toBe('ok');
    expect(p.outcomes.length).toBe(p.queue.length);
  });
});
