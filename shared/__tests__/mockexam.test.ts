import { describe, expect, it } from 'vitest';
import { buildMock, canSeeMockSummary, extraSessions, gradeFromScore, gradeLocal, leadDays, mockOpen, publicQuestion, weakGoals, type MockQuestion } from '../mockexam';

describe('probe window', () => {
  it('defaults to 4 days and only accepts 3, 4 or 5', () => {
    expect(leadDays(undefined)).toBe(4);
    expect(leadDays(3)).toBe(3);
    expect(leadDays(9)).toBe(4);
  });
  it('opens a few days before the exam and stays shut afterwards', () => {
    expect(mockOpen(4, 4)).toBe(true);
    expect(mockOpen(5, 4)).toBe(false);
    expect(mockOpen(0, 4)).toBe(true);
    expect(mockOpen(-1, 4)).toBe(false);
  });
});

describe('probe paper', () => {
  const goals = [
    { id: 'g1', text: 'Zellkern', topic: 'enthält die DNA', kind: 'facts' },
    { id: 'g2', text: 'Osmose erklären', topic: 'Wasser folgt der Konzentration', kind: 'concepts' },
    { id: 'g3', text: 'Einen Versuch beschreiben', topic: 'Aufbau, Durchführung, Ergebnis', kind: 'essay' }
  ];
  it('mixes task types and hides the answer from the student', () => {
    const paper = buildMock(goals, [], 'de');
    expect(paper.map(q => q.kind)).toEqual(['mc', 'short', 'free']);
    expect(publicQuestion(paper[0])).not.toHaveProperty('answer');
    expect(paper[0].choices).toContain('enthält die DNA');
  });
  it('grades a choice and a short answer, and leaves free text for the model', () => {
    const mc: MockQuestion = { id: 'q', goalId: 'g1', prompt: 'p', kind: 'mc', choices: ['enthält die DNA', 'andere'], answer: 'enthält die DNA' };
    expect(gradeLocal(mc, 'enthält die DNA')!.score).toBe(1);
    expect(gradeLocal(mc, 'andere')!.score).toBe(0);
    const free: MockQuestion = { ...mc, kind: 'free' };
    expect(gradeLocal(free, 'Die DNA liegt im Kern und steuert die Zelle.')).toBeNull();
  });
  it('turns a score into a German grade and names the weak goals', () => {
    expect(gradeFromScore(0.92)).toBe('1');
    expect(gradeFromScore(0.7)).toBe('3');
    expect(gradeFromScore(0.2)).toBe('6');
    expect(weakGoals([{ goalId: 'g1', score: 1 }, { goalId: 'g2', score: 0 }, { goalId: 'g2', score: 0.4 }])).toEqual(['g2']);
    expect(extraSessions(['g2'], 2)).toEqual([{ goalId: 'g2', sessions: 1 }]);
    expect(extraSessions(['g2'], 0)).toEqual([]);
    expect(canSeeMockSummary(true, 'summary')).toBe(true);
    expect(canSeeMockSummary(true, 'hide')).toBe(false);
    expect(canSeeMockSummary(false, 'grades')).toBe(false);
  });
});
