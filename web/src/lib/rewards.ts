/* Supporter rewards – client hooks + texts. Merkster only tracks promises; no money moves through the app. */
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { GradeSystem } from '../../../shared/types';
import { fmtResult, GRADE_SPECS } from '../../../shared/grades';
import { fmtReward, monthOf, thresholdIn, totals, type EarnedView, type PersonLite, type Reward, type RewardTrigger, type RuleView } from '../../../shared/rewards';
import { api } from './api';
import { runSync } from './sync';
import { store } from './store';
import { subjectName, t, tp, uiLang, type Key } from '../i18n';
import { whoName } from './supporters';
import { fmtAvg } from '../../../shared/reportcards';
import { fmtGrade, LOCALE, subjName, termName } from './reportcards';

export interface MyRewards { rules: (RuleView & { supporter: PersonLite })[]; earned: (EarnedView & { supporter: PersonLite })[]; verifications: { testId: string; by: PersonLite }[]; photos: string[] }
export const useMyRewards = (enabled = true) => useQuery({ queryKey: ['rewards'], queryFn: () => api<MyRewards>('/api/rewards'), enabled, refetchInterval: 60_000, refetchOnWindowFocus: true, retry: 0, staleTime: 10_000 });
export interface GivenRewards { rewards: (EarnedView & { kid: PersonLite })[]; unseen: number; open: number }
export const useGivenRewards = (enabled = true) => useQuery({ queryKey: ['rewards-given'], queryFn: () => api<GivenRewards>('/api/rewards/given'), enabled, refetchInterval: 60_000, refetchOnWindowFocus: true, retry: 0, staleTime: 10_000 });
export interface OtherSupporter { supporter: PersonLite; rules: RuleView[]; open: { type: 'money'; currency: string; amount: number }[]; paid: { type: 'money'; currency: string; amount: number }[]; otherOpen: number; otherPaid: number }
export interface KidRewards { grading: GradeSystem; seeEachOther: boolean; family: PersonLite[]; syncWith: string[]; rules: RuleView[]; earned: EarnedView[]; others?: OtherSupporter[] }
export const useKidRewards = (id: string) => useQuery({ queryKey: ['kid-rewards', id], queryFn: () => api<KidRewards>(`/api/kids/${id}/rewards`), retry: 0 });

/** after the student saved a result: push it now, let the server evaluate the rules, refresh the rewards */
export async function afterResultSaved(qc: QueryClient) {
  if (!store.userId) return;
  try { await runSync(); await api('/api/rewards/evaluate', { body: {} }); } catch { /* offline – the next sync evaluates */ }
  await qc.invalidateQueries({ queryKey: ['rewards'] });
}
export const useAfterResult = () => { const qc = useQueryClient(); return () => afterResultSaved(qc); };

export const rewardText = (r: Reward) => fmtReward(r, uiLang() === 'de' ? 'de-DE' : 'en-GB');
const sysName = (s: GradeSystem) => t(('gs_' + s) as Key);
/** "for every 1 or better in Biology" – shown in the student's (current) grading system */
export function ruleWhen(tr: RewardTrigger, kidSystem: GradeSystem): string {
  const subj = 'subject' in tr && tr.subject ? ' ' + t('rule_in_subject', { subject: subjectName(tr.subject) }) : '';
  const scope = 'when' in tr && tr.when === 'final' ? t('rule_rc_only_final') : '';
  switch (tr.kind) {
    case 'grade': { const th = thresholdIn(tr, kidSystem); return t(tr.mode === 'exactly' ? 'rule_grade_exactly' : 'rule_grade_atleast', { grade: th.label }) + subj; }
    case 'personal_best': return t('rule_personal_best') + subj;
    case 'improvement': return (tr.minDelta ? t('rule_improvement_n', { n: tr.minDelta }) : t('rule_improvement')) + subj;
    case 'streak': return tp('rule_streak', tr.days);
    case 'level': return t('rule_level', { n: tr.level });
    case 'rc_each': return t(tr.mode === 'exactly' ? 'rule_rc_each_exactly' : 'rule_rc_each', { grade: thresholdIn({ ...tr, kind: 'grade' }, kidSystem).label }) + scope;
    case 'rc_subject': return t('rule_rc_subject', { grade: thresholdIn({ ...tr, kind: 'grade' }, kidSystem).label, subject: subjName(tr.subjectId) }) + scope;
    case 'rc_improved': return (tr.subjectId ? t('rule_rc_improved_subj', { subject: subjName(tr.subjectId) }) : t('rule_rc_improved')) + scope;
    case 'rc_avg': return t('rule_rc_avg', { grade: tr.system === kidSystem ? fmtAvg(kidSystem, tr.min, LOCALE()) : '≈ ' + fmtAvg(kidSystem, tr.min, LOCALE()) }) + scope;
    case 'rc_avg_improved': return t('rule_rc_avg_improved') + scope;
    case 'rc_floor': return t('rule_rc_floor', { grade: thresholdIn({ kind: 'grade', system: tr.system, value: tr.value, mode: 'at_least', min: tr.min, max: 100 }, kidSystem).label }) + scope;
  }
}
/** a converted grade threshold needs a hint for the supporter */
export function ruleConverted(tr: RewardTrigger, kidSystem: GradeSystem, kidName: string): string | null {
  if (!('system' in tr) || tr.system === kidSystem) return null;
  const orig = tr.kind === 'rc_avg' ? fmtAvg(tr.system, tr.min, LOCALE()) : thresholdIn({ kind: 'grade', system: tr.system, value: tr.value, mode: 'at_least', min: tr.min, max: 100 }, tr.system).label;
  return t('rule_converted', { orig, sys: sysName(tr.system), name: kidName, cur: sysName(kidSystem) });
}
/** one person, or "Mum & Grandma" when several relatives share the promise */
export function peopleNames(members: PersonLite[] | undefined): string {
  return (members || []).map(m => whoName(m)).filter(Boolean).join(' & ');
}
/** the line a student sees: a joint reward stays one person-shaped row, named for everyone on it */
export function rewardPeople(e: { supporter: PersonLite; members?: PersonLite[] }): PersonLite {
  const members = (e.members || []).filter(m => m.id);
  if (members.length < 2) return e.supporter;
  const names = peopleNames(members);
  return { ...members[0], id: members.map(m => m.id).sort().join('+'), name: names, label: names, relation: '' };
}
export function earnedLine(e: EarnedView & { supporter: PersonLite }) {
  const name = whoName(rewardPeople(e)), reward = rewardText(e.reward);
  if (e.status === 'paid') return t('paid_you', { name, reward });
  return t(e.reward.type === 'money' ? 'owes_you' : 'promised_you', { name, reward });
}
/** what an earned reward was for (student or supporter view) */
export function earnedWhat(e: EarnedView): string {
  if (e.sourceKey.startsWith('streak:')) return tp('what_streak', Number(e.sourceKey.split(':')[1]) || 0);
  if (e.sourceKey.startsWith('level:')) return t('what_level', { n: e.sourceKey.split(':')[1] });
  if (e.test) return e.test.result ? t('what_result', { test: e.test.name, grade: fmtResult(e.test.result) }) : e.test.name;
  if (e.card) {
    const term = termName(e.card as never);
    if (e.card.line) return t('rc_for', { term }) + ' · ' + t('rc_line', { subject: subjName(e.card.line.subjectId, e.card.line.name), grade: fmtGrade(e.card.system, e.card.line.value) });
    if (e.sourceKey.endsWith(':avg') || e.sourceKey.endsWith(':avgimp')) return t('rc_for', { term }) + (e.card.avgScore != null ? ' · ' + t('rc_avg_line', { g: fmtAvg(e.card.system, e.card.avgScore, LOCALE()) }) : '');
    return t('rc_for', { term });
  }
  return '…';
}
/** totals for a period: { open: [...money], paid: [...money], otherOpen, otherPaid } */
export function periodTotals(list: EarnedView[], period: 'month' | 'year', nowTs = Date.now()) {
  const key = (ts: number) => (period === 'month' ? monthOf(ts) : monthOf(ts).slice(0, 4));
  const inP = list.filter(e => key(e.earnedAt) === key(nowTs));
  const open = inP.filter(e => e.status === 'open'), paid = inP.filter(e => e.status === 'paid');
  return { open: totals(open), paid: totals(paid), otherOpen: open.filter(e => e.reward.type === 'other').length, otherPaid: paid.filter(e => e.reward.type === 'other').length, n: inP.length };
}
export const moneyList = (m: { amount: number; currency: string }[]) => m.map(x => rewardText({ type: 'money', amount: x.amount, currency: x.currency as 'EUR' })).join(' + ');
export const isDiscreteSys = (s: GradeSystem) => !!GRADE_SPECS[s].options;
