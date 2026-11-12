import { describe, expect, it } from 'vitest';
import { buildTasks, fingerprint, jaccard, METHOD_OF, questionsFor, rankMatches, readyOn, similarity, templateTasks, validateGoalsExtract, type LearningGoal } from '../goals';
import * as S from '../../web/src/lib/schedule';

const goal = (id: string, kind: LearningGoal['kind'], text: string): LearningGoal => ({ id, text, topic: id, kind, method: METHOD_OF[kind] });

describe('method selection', () => {
  it('maps each knowledge kind to one evidence-based method', () => {
    expect(METHOD_OF.facts).toBe('retrieval');
    expect(METHOD_OF.procedures).toBe('worked');
    expect(METHOD_OF.concepts).toBe('elaboration');
    expect(METHOD_OF.essay).toBe('essay');
    expect(METHOD_OF.sequence).toBe('timeline');
    expect(METHOD_OF.transfer).toBe('mixed');
  });
});

describe('clarifying questions', () => {
  const goals = [goal('g-zelle', 'facts', 'Den Aufbau einer tierischen und einer pflanzlichen Zelle beschreiben und die Organellen benennen.')];
  it('asks for the exam format and daily minutes when those are missing on a long runway', () => {
    const qs = questionsFor({ goals, days: 14, level: 'Gymnasium Klasse 10' });
    expect(qs.map(q => q.kind)).toEqual(['exam', 'minutes']);
  });
  it('stays quiet when the sheet and the short runway already answer the plan', () => {
    expect(questionsFor({ goals, days: 3, level: 'Klasse 10', exam: 'written' })).toEqual([]);
  });
  it('asks which pages to use when the goal cites a textbook', () => {
    const qs = questionsFor({ goals: [goal('g', 'facts', 'Lernziel Seite 42 im Lehrbuch: die Osmose beschreiben und ein Beispiel nennen.')], days: 4, level: 'Klasse 10', exam: 'written' });
    expect(qs.map(q => q.kind)).toContain('material');
  });
});

describe('programme', () => {
  it('gives every goal learn tasks and a mock task, in the asked language', () => {
    const goals = [goal('a', 'facts', 'Organellen der Pflanzenzelle benennen und ihre Aufgabe nennen.'), goal('b', 'procedures', 'Die Schritte der Fotosynthese in der richtigen Reihenfolge erklären.')];
    const tasks = buildTasks(goals, null, 'de', 14, 20);
    expect(tasks.some(t => t.goalId === 'a' && t.phase === 'learn')).toBe(true);
    expect(tasks.some(t => t.goalId === 'b' && t.activity === 'worked')).toBe(true);
    expect(tasks.filter(t => t.phase === 'mock')).toHaveLength(2);
    expect(tasks.some(t => /Fotosynthese|Schritte|Organell/.test(t.front + t.back))).toBe(true);
  });
  it('holds the mock round until two days before a longer exam', () => {
    expect(readyOn('mock', '2026-11-01', '2026-11-20')).toBe('2026-11-18');
    expect(readyOn('learn', '2026-11-01', '2026-11-20')).toBeUndefined();
    expect(readyOn('mock', '2026-11-18', '2026-11-20')).toBeUndefined();
  });
  it('templates are real prompts, not empty titles', () => {
    const tasks = templateTasks([goal('a', 'essay', 'Eine These zur Funktion der Zellwand in drei Sätzen begründen.')], 'de');
    expect(tasks.every(t => t.front.length > 12 && t.back.length > 12)).toBe(true);
  });
});

describe('worksheet fingerprint', () => {
  const sheet = ['Den Aufbau einer pflanzlichen Zelle beschreiben.', 'Erklären, warum Mitochondrien Kraftwerke sind.'];
  it('matches a second photo of the same goals even when the exam date differs', () => {
    const a = fingerprint('biology', sheet);
    const b = fingerprint('Biologie', ['  den AUFBAU einer pflanzlichen Zelle beschreiben! ', 'Erklären warum Mitochondrien Kraftwerke sind']);
    expect(jaccard(a.tokens, b.tokens)).toBeGreaterThan(0.8);
    const ranked = rankMatches(a.tokens, [{ item: 'plan-1', tokens: b.tokens, examDate: '2026-12-01' }], '2026-11-20');
    expect(ranked?.band).toBe('strong');
    expect(ranked?.item).toBe('plan-1');
  });
  it('does not match a different subject sheet', () => {
    const a = fingerprint('biology', sheet);
    const b = fingerprint('history', ['Die Jahre 1918 und 1933 den Ereignissen der Weimarer Republik zuordnen.']);
    expect(similarity(a.tokens, b.tokens)).toBeLessThan(0.62);
    expect(rankMatches(a.tokens, [{ item: 'hist', tokens: b.tokens }])).toBeNull();
  });
  it('drops malformed goals and keeps the printed wording', () => {
    const parsed = validateGoalsExtract({ subject: 'Biologie', title: 'Zelle', gradeLevel: 'Klasse 10', goals: [{ id: 'g-zelle', text: 'Mitochondrien erklären.', kind: 'concepts' }, { text: 'kurz' }] });
    expect(parsed.subject).toBe('biology');
    expect(parsed.goals).toHaveLength(1);
    expect(parsed.goals[0].method).toBe('elaboration');
    expect(parsed.level).toBe('Klasse 10');
  });
});

describe('missed days', () => {
  it('raises the new-card quota when earlier days were skipped, and waits for mock cards', () => {
    const items = Array.from({ length: 12 }, (_, i) => ({ id: 'i' + i, type: 'qa' as const, term: 'q' + i, meaning: 'a' + i, example: '', st: { introduced: false, sessions: 0, lapses: 0, dueAt: null, struggledLast: false }, study: i >= 10 ? { goalId: 'g', method: 'retrieval' as const, activity: 'recall' as const, readyOn: '2026-11-18', phase: 'mock' as const } : { goalId: i % 2 ? 'b' : 'a', method: 'retrieval' as const, activity: 'recall' as const, phase: 'learn' as const } }));
    const test = { id: 't', created: '2026-11-12', testDate: '2026-11-18', items };
    const day1 = new Date(2026, 10, 12, 10).getTime();
    const later = new Date(2026, 10, 16, 10).getTime();
    const first = S.newQuota(test, day1);
    const caughtUp = S.newQuota(test, later);
    expect(caughtUp).toBeGreaterThan(first);
    expect(S.newItems(test, day1).every(c => c.study?.phase !== 'mock')).toBe(true);
    const order = S.newItems(test, day1).map(c => c.study?.goalId);
    expect(order[0]).not.toBe(order[1]);
  });
});
