/* Supporter rewards: rules ("5 € for every 1", "Pizza night for a personal best") and their evaluation.
   Merkster only TRACKS promises – no payments are processed. Results are self-reported by the student.
   Grade thresholds are stored as a normalised score range (0–100) plus the original grade, so a rule keeps
   working when the student switches grading systems (it is then shown converted, with a warning). */
import type { ExamResult, GradeSystem, Subject } from './types';
import { familyRange, fmtPctIn, GRADE_SPECS, nearestOption, optionFor } from './grades';

export const CURRENCIES = ['EUR', 'CHF', 'USD', 'GBP'] as const;
export type Currency = (typeof CURRENCIES)[number];
export const TRIGGER_KINDS = ['grade', 'personal_best', 'improvement', 'streak', 'level', 'rc_each', 'rc_subject', 'rc_improved', 'rc_avg', 'rc_avg_improved', 'rc_floor'] as const;
/** triggers that fire on a confirmed report card (Zeugnis) */
export const RC_KINDS = ['rc_each', 'rc_subject', 'rc_improved', 'rc_avg', 'rc_avg_improved', 'rc_floor'] as const;
export const isRcKind = (k: string) => (RC_KINDS as readonly string[]).includes(k);
export type TriggerKind = (typeof TRIGGER_KINDS)[number];
export const STREAK_OPTIONS = [3, 7, 14, 30, 50, 100];

export type RewardTrigger =
  | { kind: 'grade'; system: GradeSystem; value: number; mode: 'at_least' | 'exactly'; min: number; max: number; subject?: Subject | null }
  | { kind: 'personal_best'; subject?: Subject | null }
  | { kind: 'improvement'; subject?: Subject | null; minDelta: number }
  | { kind: 'streak'; days: number }
  | { kind: 'level'; level: number }
  // report cards: EXTRA rewards, never a substitute for an exam grade. `when: 'final'` pays only the
  // end-of-year report (Schuljahresende). Omitted = every confirmed report card.
  | { kind: 'rc_each'; system: GradeSystem; value: number; mode: 'at_least' | 'exactly'; min: number; max: number; when?: 'final' }
  | { kind: 'rc_subject'; subjectId: string; system: GradeSystem; value: number; mode: 'at_least' | 'exactly'; min: number; max: number; when?: 'final' }
  | { kind: 'rc_improved'; subjectId?: string | null; when?: 'final' }
  | { kind: 'rc_avg'; system: GradeSystem; value: number; min: number; when?: 'final' }
  | { kind: 'rc_avg_improved'; minDelta: number; when?: 'final' }
  | { kind: 'rc_floor'; system: GradeSystem; value: number; min: number; when?: 'final' };
export type Reward = { type: 'money'; amount: number; currency: Currency } | { type: 'other'; text: string };
export interface RewardRule {
  id: string; supporterId: string; trigger: RewardTrigger; reward: Reward; capPerMonth: number | null; active: boolean;
  createdAt: number;
  /** Earliest event time that may earn. Defaults to createdAt when omitted (legacy rules). */
  validAsOf?: number;
  members?: PersonLite[];
}
/** Effective gate for earning: validAsOf if set, otherwise createdAt. */
export const effectiveFrom = (rule: Pick<RewardRule, 'createdAt' | 'validAsOf'>) =>
  (typeof rule.validAsOf === 'number' && Number.isFinite(rule.validAsOf) ? rule.validAsOf : rule.createdAt);

/** input for evaluation: all results of the student + practice facts */
export interface EvalResult { testId: string; subject: Subject; score: number; testDate: string; enteredAt: number }
export interface EvalCard { id: string; issuedOn: string; createdAt: number; lines: { subjectId: string; score: number }[]; avgScore: number; term?: 'h1' | 'final' | 'custom' }
export interface EvalInput { results: EvalResult[]; practiceDays: string[]; levelUps: { level: number; at: number }[]; reportCards?: EvalCard[] }
export interface EarnSource { key: string; at: number; testId?: string; cardId?: string; subjectId?: string }

/** build a grade trigger from a grade picked in some system ("1 or better", "exactly a 2") */
export function gradeTrigger(system: GradeSystem, value: number, mode: 'at_least' | 'exactly', subject?: Subject | null): RewardTrigger | null {
  const spec = GRADE_SPECS[system];
  if (!spec) return null;
  if (spec.options && !optionFor(system, value)) return null;
  if (!spec.options && !(value >= 0 && value <= 100)) return null;   // percent / x-of-y: threshold in percent
  const [lo, hi] = spec.options ? familyRange(system, value) : [value, value];
  return { kind: 'grade', system, value, mode, min: lo, max: mode === 'at_least' ? 100 : hi, subject: subject || null };
}
const EPS = 0.01;
const dayOf = (ts: number) => { const d = new Date(ts); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const addDays = (iso: string, n: number) => { const [y, m, d] = iso.split('-').map(Number); return dayOf(new Date(y, m - 1, d + n).getTime()); };
const byTime = (a: EvalResult, b: EvalResult) => a.testDate.localeCompare(b.testDate) || a.enteredAt - b.enteredAt;

/** every source that satisfies a rule (uncapped). Only events on/after validAsOf (or createdAt) count. */
export function matches(rule: Pick<RewardRule, 'trigger' | 'createdAt' | 'validAsOf'>, input: EvalInput): EarnSource[] {
  const tr = rule.trigger, out: EarnSource[] = [];
  const from = effectiveFrom(rule);
  const results = [...input.results].sort(byTime);
  const fresh = (r: EvalResult) => r.enteredAt >= from - 1000;
  const subjOk = (r: EvalResult, s?: Subject | null) => !s || r.subject === s;
  switch (tr.kind) {
    case 'grade':
      for (const r of results) if (fresh(r) && subjOk(r, tr.subject) && r.score >= tr.min - EPS && r.score <= tr.max + EPS) out.push({ key: 'result:' + r.testId, at: r.enteredAt, testId: r.testId });
      break;
    case 'personal_best':
      results.forEach((r, i) => {
        const prev = results.slice(0, i).filter(p => subjOk(p, tr.subject));
        if (fresh(r) && subjOk(r, tr.subject) && prev.length && r.score > Math.max(...prev.map(p => p.score)) + EPS) out.push({ key: 'result:' + r.testId, at: r.enteredAt, testId: r.testId });
      });
      break;
    case 'improvement':
      results.forEach((r, i) => {
        if (!fresh(r) || !subjOk(r, tr.subject)) return;
        const prev = results.slice(0, i).filter(p => p.subject === r.subject).pop();
        if (prev && r.score >= prev.score + Math.max(EPS, tr.minDelta || 0)) out.push({ key: 'result:' + r.testId, at: r.enteredAt, testId: r.testId });
      });
      break;
    case 'streak': {
      const days = [...new Set(input.practiceDays)].sort(), startDay = dayOf(from);
      let start = '', prev = '', len = 0;
      for (const d of days) {
        if (prev && addDays(prev, 1) === d) len++; else { start = d; len = 1; }
        prev = d;
        if (len === tr.days && d >= startDay) out.push({ key: `streak:${tr.days}:${start}`, at: new Date(d + 'T18:00:00').getTime() });
      }
      break;
    }
    case 'level':
      for (const l of input.levelUps) if (l.level === tr.level && l.at >= from - 1000) out.push({ key: 'level:' + l.level, at: l.at });
      break;
    default: {
      // report cards – only cards confirmed on/after validAsOf
      const cards = [...(input.reportCards || [])].sort((a, b) => a.issuedOn.localeCompare(b.issuedOn) || a.createdAt - b.createdAt);
      cards.forEach((c, i) => {
        if (c.createdAt < from - 1000) return;
        if ('when' in tr && tr.when === 'final' && c.term !== 'final') return;   // extra reward: end-of-year report only
        const prev = i > 0 ? cards[i - 1] : null;
        const src = (suffix: string, subjectId?: string): EarnSource => ({ key: `rc:${c.id}:${suffix}`, at: c.createdAt, cardId: c.id, ...(subjectId ? { subjectId } : {}) });
        const inBand = (score: number, min: number, max = 100) => score >= min - EPS && score <= max + EPS;
        switch (tr.kind) {
          case 'rc_each': for (const l of c.lines) if (inBand(l.score, tr.min, tr.max)) out.push(src('each:' + l.subjectId, l.subjectId)); break;
          case 'rc_subject': for (const l of c.lines) if (l.subjectId === tr.subjectId && inBand(l.score, tr.min, tr.max)) out.push(src('subj:' + l.subjectId, l.subjectId)); break;
          case 'rc_improved':
            if (prev) for (const l of c.lines) {
              if (tr.subjectId && l.subjectId !== tr.subjectId) continue;
              const p = prev.lines.find(x => x.subjectId === l.subjectId);
              if (p && l.score > p.score + 0.5) out.push(src('imp:' + l.subjectId, l.subjectId));
            }
            break;
          case 'rc_avg': if (c.lines.length && c.avgScore >= tr.min - EPS) out.push(src('avg')); break;
          case 'rc_avg_improved': if (prev && c.avgScore >= prev.avgScore + Math.max(0.5, tr.minDelta || 0)) out.push(src('avgimp')); break;
          case 'rc_floor': if (c.lines.length && c.lines.every(l => l.score >= tr.min - EPS)) out.push(src('floor')); break;
        }
      });
    }
  }
  return out;
}
/** month bucket for caps */
export const monthOf = (ts: number) => dayOf(ts).slice(0, 7);
/** apply "max N per month": sources already earned count against the cap */
export function applyCap(sources: EarnSource[], cap: number | null, earned: { key: string; at: number }[]): EarnSource[] {
  const have = new Set(earned.map(e => e.key));
  const perMonth = new Map<string, number>();
  for (const e of earned) perMonth.set(monthOf(e.at), (perMonth.get(monthOf(e.at)) || 0) + 1);
  const out: EarnSource[] = [];
  for (const s of [...sources].sort((a, b) => a.at - b.at)) {
    if (have.has(s.key)) continue;
    const m = monthOf(s.at), n = perMonth.get(m) || 0;
    if (cap && n >= cap) continue;
    perMonth.set(m, n + 1); out.push(s);
  }
  return out;
}

/** how a grade threshold reads in the student's CURRENT system (+ whether it had to be converted) */
export function thresholdIn(tr: Extract<RewardTrigger, { kind: 'grade' }>, system: GradeSystem): { label: string; converted: boolean } {
  if (tr.system === system) {
    const o = optionFor(system, tr.value);
    return { label: o ? (o.family !== o.label && GRADE_SPECS[system].options!.some(x => x.label === o.family) ? o.family : o.label) : system === 'percent' || system === 'xofy' ? `${tr.value} %` : String(tr.value), converted: false };
  }
  // converted via the normalised score: the lowest score that still counts
  const label = GRADE_SPECS[system].options ? (nearestOption(tr.min, system)?.family ?? fmtPctIn(tr.min, system)) : fmtPctIn(tr.min, system);
  return { label, converted: true };
}
export function fmtReward(r: Reward, locale: string) {
  if (r.type === 'other') return r.text;
  try { return new Intl.NumberFormat(locale, { style: 'currency', currency: r.currency, maximumFractionDigits: r.amount % 1 ? 2 : 0 }).format(r.amount); } catch { return `${r.amount} ${r.currency}`; }
}
/** totals of money rewards per currency */
export function totals(list: { reward: Reward }[]) {
  const t = new Map<string, number>();
  for (const x of list) if (x.reward.type === 'money') t.set(x.reward.currency, (t.get(x.reward.currency) || 0) + x.reward.amount);
  return [...t.entries()].map(([currency, amount]) => ({ type: 'money' as const, currency: currency as Currency, amount: Math.round(amount * 100) / 100 }));
}

/* ---- API views ---- */
export interface PersonLite { id: string; name: string; avatar: string | null; relation: string; label: string }
export interface RuleView extends RewardRule { earnedThisMonth: number; supporter?: PersonLite }
export interface EarnedView {
  id: string; ruleId: string | null; trigger: RewardTrigger; reward: Reward; status: 'open' | 'paid'; earnedAt: number; paidAt: number | null;
  sourceKey: string; testId: string | null; test?: { name: string; subject: Subject; result: ExamResult | null } | null;
  cardId?: string | null; subjectId?: string | null;
  card?: { schoolYear: string; term: string; termLabel: string; issuedOn: string; system: GradeSystem; line: { subjectId: string; name: string; value: number; score: number } | null; avgScore: number | null } | null;
  seen: boolean; supporter?: PersonLite; kid?: PersonLite; members?: PersonLite[];
}
export const MAX_RULES_PER_LINK = 20;
export const REWARD_TEXT_MAX = 60;

/** one rule against an input: everything it earns, after the monthly cap (already-earned entries count) */
export function evaluateRule(rule: Pick<RewardRule, 'trigger' | 'createdAt' | 'validAsOf' | 'capPerMonth'>, input: EvalInput, earned: { key: string; at: number }[] = []): EarnSource[] {
  return applyCap(matches(rule, input), rule.capPerMonth, earned);
}

/* ---------------- report-card triggers ---------------- */
/** build a report-card trigger from what a supporter picked (thresholds as normalised scores) */
export function rcTrigger(kind: string, o: { system?: GradeSystem; value?: number; mode?: 'at_least' | 'exactly'; subjectId?: string | null; minDelta?: number; when?: 'final' | 'any' | null }, avgThreshold: (s: GradeSystem, v: number) => number): RewardTrigger | null {
  const g = o.system && typeof o.value === 'number' ? gradeTrigger(o.system, o.value, o.mode === 'exactly' ? 'exactly' : 'at_least') : null;
  const gg = g && g.kind === 'grade' ? g : null;
  const when = o.when === 'final' ? { when: 'final' as const } : {};
  switch (kind) {
    case 'rc_each': return gg ? { kind: 'rc_each', system: gg.system, value: gg.value, mode: gg.mode, min: gg.min, max: gg.max, ...when } : null;
    case 'rc_subject': return gg && o.subjectId ? { kind: 'rc_subject', subjectId: o.subjectId, system: gg.system, value: gg.value, mode: gg.mode, min: gg.min, max: gg.max, ...when } : null;
    case 'rc_improved': return { kind: 'rc_improved', subjectId: o.subjectId || null, ...when };
    case 'rc_avg': return o.system && typeof o.value === 'number' && GRADE_SPECS[o.system] ? { kind: 'rc_avg', system: o.system, value: o.value, min: Math.round(avgThreshold(o.system, o.value) * 100) / 100, ...when } : null;
    case 'rc_avg_improved': { const d = Number(o.minDelta) || 0; return d >= 0 && d <= 50 ? { kind: 'rc_avg_improved', minDelta: d, ...when } : null; }
    case 'rc_floor': return gg ? { kind: 'rc_floor', system: gg.system, value: gg.value, min: gg.min, ...when } : null;
    default: return null;
  }
}

/* ---------------- breakdown + simulator ---------------- */
export interface MoneyTotal { currency: Currency; amount: number }
export interface SupporterBreakdown<P = unknown> {
  supporter: P; money: MoneyTotal[]; other: string[];
  items: { ruleId: string; trigger: RewardTrigger; reward: Reward; count: number; money: MoneyTotal | null; sources: EarnSource[] }[];
}
export interface Breakdown<P = unknown> { grand: MoneyTotal[]; otherCount: number; perSupporter: SupporterBreakdown<P>[] }
const addMoney = (list: MoneyTotal[], currency: Currency, amount: number) => {
  const x = list.find(m => m.currency === currency);
  if (x) x.amount = Math.round((x.amount + amount) * 100) / 100; else list.push({ currency, amount: Math.round(amount * 100) / 100 });
};
/** group earned (or simulated) items per supporter; money totals per CURRENCY (EUR is never added to CHF) */
export function breakdown<P>(entries: { supporterId: string; supporter: P; ruleId: string; trigger: RewardTrigger; reward: Reward; source?: EarnSource }[]): Breakdown<P> {
  const per = new Map<string, SupporterBreakdown<P>>();
  const grand: MoneyTotal[] = []; let otherCount = 0;
  for (const e of entries) {
    const sb = per.get(e.supporterId) || { supporter: e.supporter, money: [], other: [], items: [] };
    per.set(e.supporterId, sb);
    let it = sb.items.find(i => i.ruleId === e.ruleId && JSON.stringify(i.reward) === JSON.stringify(e.reward));
    if (!it) { it = { ruleId: e.ruleId, trigger: e.trigger, reward: e.reward, count: 0, money: e.reward.type === 'money' ? { currency: e.reward.currency, amount: 0 } : null, sources: [] }; sb.items.push(it); }
    it.count++; if (e.source) it.sources.push(e.source);
    if (e.reward.type === 'money') { it.money!.amount = Math.round((it.money!.amount + e.reward.amount) * 100) / 100; addMoney(sb.money, e.reward.currency, e.reward.amount); addMoney(grand, e.reward.currency, e.reward.amount); }
    else { sb.other.push(e.reward.text); otherCount++; }
  }
  return { grand, otherCount, perSupporter: [...per.values()] };
}
export interface SimRule<P = unknown> extends Pick<RewardRule, 'id' | 'trigger' | 'reward' | 'capPerMonth'> { supporterId: string; supporter: P }
export const SIM_CARD_ID = '__simulation__';
/** "What could I earn?" – evaluate a HYPOTHETICAL report card against all report-card rules.
    Uses exactly the same engine (matches + caps) as the server; never creates anything. */
export function simulateReportCard<P>(rules: SimRule<P>[], card: Omit<EvalCard, 'id' | 'createdAt'>, previousCards: EvalCard[], earned: { ruleId: string | null; key: string; at: number }[] = [], nowTs = Date.now()): Breakdown<P> {
  const hypo: EvalCard = { ...card, id: SIM_CARD_ID, createdAt: nowTs };
  const input: EvalInput = { results: [], practiceDays: [], levelUps: [], reportCards: [...previousCards.filter(c => c.id !== SIM_CARD_ID), hypo] };
  const entries: Parameters<typeof breakdown<P>>[0] = [];
  for (const r of rules) {
    if (!isRcKind(r.trigger.kind)) continue;
    // the rule "exists" before the simulated card; only sources from the simulated card count
    const got = evaluateRule({ trigger: r.trigger, createdAt: nowTs, validAsOf: nowTs, capPerMonth: r.capPerMonth }, input, earned.filter(e => e.ruleId === r.id)).filter(s => s.cardId === SIM_CARD_ID);
    for (const s of got) entries.push({ supporterId: r.supporterId, supporter: r.supporter, ruleId: r.id, trigger: r.trigger, reward: r.reward, source: s });
  }
  return breakdown(entries);
}
/** the money of a breakdown in one currency (for hints / comparisons) */
export const moneyIn = (b: Breakdown, currency: Currency) => b.grand.find(m => m.currency === currency)?.amount || 0;
