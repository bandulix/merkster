/* Report cards – client hooks and helpers. */
import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { GradeSystem, Test } from '../../../shared/types';
import { fmtResult, GRADE_SPECS } from '../../../shared/grades';
import { canon, cardsLite, DEFAULT_TERM_STARTS, isCustomSubject, subjectOfTest, type ReportCard, type SubjectChoice } from '../../../shared/reportcards';
import { api } from './api';
import { store } from './store';
import { t, uiLang } from '../i18n';

export function useReportCards(enabled = true) {
  const q = useQuery({ queryKey: ['report-cards'], queryFn: () => api<{ cards: ReportCard[] }>('/api/report-cards').then(r => r.cards), enabled, retry: 0, staleTime: 30_000 });
  useEffect(() => { if (q.data) store.setCards(cardsLite(q.data)); }, [q.data]);
  return q;
}
export const termStarts = () => (store.data.settings.termStarts || DEFAULT_TERM_STARTS) as [number, number];
/** display name of a report-card subject (canonical in the UI language, custom as typed) */
export function subjName(id: string, fallback?: string) {
  const c = canon(id); if (c) return c.name[uiLang()];
  return fallback || id.replace(/^c_/, '').replace(/-/g, ' ');
}
export const subjIcon = (id: string) => canon(id)?.icon || '📘';
/** the student's own (custom) subjects, from earlier report cards */
export function customSubjects(cards: ReportCard[] = []): SubjectChoice[] {
  const m = new Map<string, string>();
  for (const c of cards) for (const l of c.lines) if (isCustomSubject(l.subjectId)) m.set(l.subjectId, l.name);
  return [...m.entries()].map(([id, name]) => ({ id, name }));
}
/** subjects the student has (tests + report cards), in a stable order */
export function mySubjects(tests: Test[], cards: ReportCard[] = []): string[] {
  const s = new Set<string>();
  for (const c of cards) for (const l of c.lines) s.add(l.subjectId);
  for (const x of tests) { const id = subjectOfTest(x); if (id) s.add(id); }
  return [...s];
}
export const fmtGrade = (system: GradeSystem, value: number) => fmtResult({ system, value, max: system === 'xofy' ? 100 : undefined });
export const termName = (c: Pick<ReportCard, 'term' | 'termLabel' | 'schoolYear'>) =>
  (c.term === 'h1' ? t('rc_term_h1') : c.term === 'final' ? t('rc_term_final') : c.termLabel || t('rc_term_custom')) + (c.schoolYear ? ' ' + c.schoolYear : '');
export const LOCALE = () => (uiLang() === 'de' ? 'de-DE' : 'en-GB');

/** grades offered for report-card lines (best first). German report cards use whole grades. */
export function rcOptions(system: GradeSystem): { label: string; value: number; pct: number }[] {
  const o = GRADE_SPECS[system].options;
  if (system === 'de_grade') return o!.filter(x => x.label.length === 1);
  if (o) return o;
  return Array.from({ length: 21 }, (_, i) => ({ label: `${100 - i * 5} %`, value: 100 - i * 5, pct: 100 - i * 5 }));
}
/** nearest offered grade for a score */
export function rcNearest(system: GradeSystem, pct: number) {
  const o = rcOptions(system);
  return o.reduce((a, b) => (Math.abs(b.pct - pct) < Math.abs(a.pct - pct) ? b : a), o[0]);
}
