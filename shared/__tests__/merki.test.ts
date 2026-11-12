import { describe, expect, it } from 'vitest';
import { ageBand, cleanContext, fallbackLine, pickTrigger, validateLine } from '../merki';

describe('Merki age band', () => {
  it('uses Klassenstufe before birth year', () => {
    expect(ageBand({ schoolYear: 3, birthYear: 2008, nowYear: 2026 })).toBe('young');
    expect(ageBand({ schoolYear: 6, nowYear: 2026 })).toBe('mid');
    expect(ageBand({ schoolYear: 10, nowYear: 2026 })).toBe('teen');
  });
  it('derives a band from birth year and stays unset when nothing is known', () => {
    expect(ageBand({ birthYear: 2018, nowYear: 2026 })).toBe('young');
    expect(ageBand({ birthYear: 2013, nowYear: 2026 })).toBe('mid');
    expect(ageBand({ birthYear: 2010, nowYear: 2026 })).toBe('teen');
    expect(ageBand({ nowYear: 2026 })).toBeNull();
  });
});

describe('Merki safety', () => {
  it('keeps a short kind line and drops links, shame, and essays', () => {
    expect(validateLine('Hi Mia. Eine Karte, dann Pause.')).toBe('Hi Mia. Eine Karte, dann Pause.');
    expect(validateLine('Schau mal https://evil.example')).toBeNull();
    expect(validateLine('Du bist dumm.')).toBeNull();
    expect(validateLine('Du musst jetzt lernen.')).toBeNull();
    expect(validateLine('Eins. Zwei. Drei.')).toBeNull();
    expect(validateLine('   ')).toBeNull();
  });
  it('strips notes and uses only a first name', () => {
    const ctx = cleanContext({ band: 'teen', lang: 'de', streak: 4, dueToday: 3, plan: 'Die Zelle', friend: 'Lena', note: 'geheim', name: 'Hacker' }, 'Mia Schmidt');
    expect(ctx.name).toBe('Mia');
    expect(ctx.band).toBe('teen');
    expect(JSON.stringify(ctx)).not.toContain('geheim');
    expect(JSON.stringify(ctx)).not.toContain('Hacker');
  });
  it('fallback tone changes with the age band and never shames', () => {
    const young = fallbackLine(cleanContext({ band: 'young', lang: 'de', streak: 2 }, 'Lea'), 'nudge');
    const teen = fallbackLine(cleanContext({ band: 'teen', lang: 'de', streak: 2 }, 'Lea'), 'nudge');
    expect(young.line).not.toBe(teen.line);
    expect(young.line.toLowerCase()).toMatch(/lernen|karten/);
    expect(validateLine(young.line)).toBeTruthy();
    expect(validateLine(teen.line)).toBeTruthy();
    expect(teen.line).not.toMatch(/Juhu|Star/);
  });
  it('picks one trigger, with the exam and a missed day ahead of a hello', () => {
    expect(pickTrigger({ dueToday: 4, examIn: 1, behind: true, friend: true, hasTests: true })).toBe('exam_soon');
    expect(pickTrigger({ dueToday: 4, examIn: 10, behind: true, friend: true, hasTests: true })).toBe('behind');
    expect(pickTrigger({ dueToday: 4, examIn: 10, behind: false, friend: true, hasTests: true })).toBe('nudge');
    expect(pickTrigger({ dueToday: 0, examIn: null, behind: false, friend: true, hasTests: true })).toBe('friend');
    expect(pickTrigger({ dueToday: 0, examIn: null, behind: false, friend: false, hasTests: false })).toBe('nudge');
  });
});
