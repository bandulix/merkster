import { describe, expect, it } from 'vitest';
import { inOfflineWindow, mayNotify, mergeCardState, reminderText, DEFAULT_PUSH } from '../offline';
import type { CardState } from '../types';

const st = (p: Partial<CardState> = {}): CardState => ({ introduced: false, sessions: 0, lapses: 0, dueAt: null, struggledLast: false, ...p });

describe('offline merge', () => {
  it('keeps the card that was practised further', () => {
    const local = st({ introduced: true, sessions: 3, lapses: 1, dueAt: 50, struggledLast: true });
    const remote = st({ introduced: false, sessions: 1, dueAt: 10 });
    const m = mergeCardState(local, remote);
    expect(m.sessions).toBe(3);
    expect(m.introduced).toBe(true);
    expect(m.lapses).toBe(1);
    expect(m.dueAt).toBe(50);
  });
  it('takes a later due date from the other side', () => {
    expect(mergeCardState(st({ sessions: 2, dueAt: 5 }), st({ sessions: 2, dueAt: 9 })).dueAt).toBe(9);
  });
  it('includes today and the next two days', () => {
    expect(inOfflineWindow('2026-11-12', '2026-11-12')).toBe(true);
    expect(inOfflineWindow('2026-11-14', '2026-11-12')).toBe(true);
    expect(inOfflineWindow('2026-11-15', '2026-11-12')).toBe(false);
  });
});

describe('push reminders', () => {
  const day = '2026-11-12';
  it('stays quiet until opt-in, after 20:00, and after one send', () => {
    const at = (h: number) => new Date(2026, 10, 12, h, 0, 0);
    expect(mayNotify(at(16), DEFAULT_PUSH, day)).toBe(false);
    expect(mayNotify(at(16), { ...DEFAULT_PUSH, enabled: true }, day)).toBe(true);
    expect(mayNotify(at(20), { ...DEFAULT_PUSH, enabled: true, hour: 20 }, day)).toBe(false);
    expect(mayNotify(at(6), { ...DEFAULT_PUSH, enabled: true, hour: 6 }, day)).toBe(false);
    expect(mayNotify(at(16), { ...DEFAULT_PUSH, enabled: true, lastDay: day }, day)).toBe(false);
  });
  it('names the companion and stays short', () => {
    const line = reminderText('Lumo', 4, 'de');
    expect(line).toContain('Lumo');
    expect(line).toContain('4');
    expect(line.length).toBeLessThan(140);
  });
});
