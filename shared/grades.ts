/* Exam results in many grading systems. Every result keeps its ORIGINAL value (system + value [+ max]) and a
   normalised score 0–100 (higher = better) that is used for charts, comparisons and reward rules.
   Systems: German 1–6 (+/-), Oberstufe points 0–15, Austrian 1–5, Swiss 6–1 (half grades),
   US letters A+–F, UK GCSE 9–1, percent, and "x of y points". The mappings are conventional anchors
   (e.g. KMK points table for German grades); they are approximations, good for trends – not official. */
import type { ExamResult, GradeSystem } from './types';

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export interface GradeOption { label: string; value: number; pct: number; family: string }
export interface GradeSpec {
  id: GradeSystem;
  options?: GradeOption[];          // discrete systems (best first)
  lowerIsBetter: boolean;           // German / Austrian grades: 1 is best
  min: number; max: number;         // value range (for chart axes)
  step?: number;
}
const opt = (label: string, value: number, pct: number, family = label): GradeOption => ({ label, value, pct, family });

/* German 1–6 with +/-: KMK points (1+ = 15 P … 6 = 0 P) */
export const DE_GRADES = ['1+', '1', '1-', '2+', '2', '2-', '3+', '3', '3-', '4+', '4', '4-', '5+', '5', '5-', '6'];
const deValue = (s: string) => Number(s[0]) + (s[1] === '+' ? -0.3 : s[1] === '-' ? 0.3 : 0);
const dePct = (v: number) => clamp(Math.round(17 - 3 * v) / 15 * 100, 0, 100);
const US: [string, number, number][] = [['A+', 4.3, 98], ['A', 4, 95], ['A-', 3.7, 91], ['B+', 3.3, 88], ['B', 3, 85], ['B-', 2.7, 81], ['C+', 2.3, 78], ['C', 2, 75], ['C-', 1.7, 71], ['D+', 1.3, 68], ['D', 1, 65], ['D-', 0.7, 61], ['F', 0, 30]];
const GCSE: [number, number][] = [[9, 95], [8, 85], [7, 75], [6, 67], [5, 60], [4, 52], [3, 42], [2, 30], [1, 18]];
const AT: [number, number][] = [[1, 94], [2, 81], [3, 68], [4, 55], [5, 25]];

export const GRADE_SPECS: Record<GradeSystem, GradeSpec> = {
  de_grade: { id: 'de_grade', lowerIsBetter: true, min: 0.7, max: 6, options: DE_GRADES.map(g => opt(g, deValue(g), dePct(deValue(g)), g[0])) },
  points15: { id: 'points15', lowerIsBetter: false, min: 0, max: 15, step: 1, options: Array.from({ length: 16 }, (_, i) => opt(`${15 - i} P`, 15 - i, (15 - i) / 15 * 100)) },
  at_grade: { id: 'at_grade', lowerIsBetter: true, min: 1, max: 5, options: AT.map(([v, p]) => opt(String(v), v, p)) },
  ch_grade: { id: 'ch_grade', lowerIsBetter: false, min: 1, max: 6, options: Array.from({ length: 11 }, (_, i) => { const v = 6 - i / 2; return opt(String(v), v, (v - 1) / 5 * 100); }) },
  us_letter: { id: 'us_letter', lowerIsBetter: false, min: 0, max: 4.3, options: US.map(([l, v, p]) => opt(l, v, p, l[0])) },
  uk_gcse: { id: 'uk_gcse', lowerIsBetter: false, min: 1, max: 9, options: GCSE.map(([v, p]) => opt(String(v), v, p)) },
  percent: { id: 'percent', lowerIsBetter: false, min: 0, max: 100 },
  xofy: { id: 'xofy', lowerIsBetter: false, min: 0, max: 100 }
};
export const isDiscrete = (s: GradeSystem) => !!GRADE_SPECS[s]?.options && s !== 'points15';

/* piecewise-linear mapping between value and pct along the option anchors */
function interp(points: [number, number][], x: number) {
  const p = [...points].sort((a, b) => a[0] - b[0]);
  if (x <= p[0][0]) return p[0][1];
  for (let i = 1; i < p.length; i++) if (x <= p[i][0]) { const [x0, y0] = p[i - 1], [x1, y1] = p[i]; return y0 + (y1 - y0) * (x - x0) / (x1 - x0); }
  return p[p.length - 1][1];
}
/** 0–100, higher is better */
export function toPct(r: Pick<ExamResult, 'system' | 'value' | 'max'>): number {
  const s = GRADE_SPECS[r.system];
  switch (r.system) {
    case 'de_grade': return dePct(r.value);
    case 'points15': return clamp(r.value / 15 * 100, 0, 100);
    case 'ch_grade': return clamp((r.value - 1) / 5 * 100, 0, 100);
    case 'percent': return clamp(r.value, 0, 100);
    case 'xofy': return r.max && r.max > 0 ? clamp(r.value / r.max * 100, 0, 100) : 0;
    default: return s?.options ? clamp(interp(s.options.map(o => [o.value, o.pct]), r.value), 0, 100) : 0;
  }
}
/** the normalised score of a stored result (recomputed – never trust a stored copy blindly) */
export const scoreOf = (r: Pick<ExamResult, 'system' | 'value' | 'max'>) => Math.round(toPct(r) * 100) / 100;

/** a normalised score as a (continuous) value in another system – for chart axes */
export function fromPct(pct: number, system: GradeSystem): number {
  const s = GRADE_SPECS[system];
  switch (system) {
    case 'points15': return clamp(pct * 15 / 100, 0, 15);
    case 'ch_grade': return clamp(1 + pct / 20, 1, 6);
    case 'percent': case 'xofy': return clamp(pct, 0, 100);
    default: return interp(s.options!.map(o => [o.pct, o.value]), pct);
  }
}
/** the option of a discrete system closest to a normalised score */
export function nearestOption(pct: number, system: GradeSystem): GradeOption | null {
  const o = GRADE_SPECS[system]?.options; if (!o) return null;
  return o.reduce((a, b) => (Math.abs(b.pct - pct) < Math.abs(a.pct - pct) ? b : a));
}
export function optionFor(system: GradeSystem, value: number): GradeOption | null {
  const o = GRADE_SPECS[system]?.options; if (!o) return null;
  return o.find(x => Math.abs(x.value - value) < 0.01) || null;
}
/** "2+" -> 1.7 */
export function parseDeGrade(s: string): number | null { const m = String(s).trim().match(/^([1-6])\s*([+-]?)$/); if (!m) return null; const v = deValue(m[1] + m[2]); return v > 6 ? null : v; }
export function fmtDeGrade(v: number): string {
  const base = clamp(Math.round(v), 1, 6), d = v - base;
  return base + (d < -0.15 ? '+' : d > 0.15 && base < 6 ? '-' : '');
}
export function fmtResult(r: Pick<ExamResult, 'system' | 'value' | 'max'>): string {
  switch (r.system) {
    case 'de_grade': return fmtDeGrade(r.value);
    case 'points15': return `${Math.round(r.value)} P`;
    case 'percent': return `${Math.round(r.value)} %`;
    case 'xofy': return `${+r.value.toFixed(1)}/${r.max}`;
    default: return optionFor(r.system, r.value)?.label ?? nearestOption(toPct(r), r.system)?.label ?? String(r.value);
  }
}
/** a normalised score shown in a system: "2-", "11 P", "B+", "73 %" */
export function fmtPctIn(pct: number, system: GradeSystem): string {
  if (system === 'percent' || system === 'xofy') return `${Math.round(pct)} %`;
  if (system === 'points15') return `${Math.round(pct * 15 / 100)} P`;
  return nearestOption(pct, system)!.label;
}
/** all options of the same family ("2+", "2", "2-" / "B+", "B", "B-") → their score range */
export function familyRange(system: GradeSystem, value: number): [number, number] {
  const s = GRADE_SPECS[system], o = optionFor(system, value);
  if (!s.options || !o) { const p = toPct({ system, value }); return [p, p]; }
  const fam = s.options.filter(x => x.family === o.family).map(x => x.pct);
  return [Math.min(...fam), Math.max(...fam)];
}
/** whole grades (one per family) – what a reward rule picks from */
export function families(system: GradeSystem): GradeOption[] {
  const s = GRADE_SPECS[system]; if (!s.options) return [];
  const seen = new Map<string, GradeOption>();
  for (const o of s.options) { const cur = seen.get(o.family); if (!cur || o.label === o.family) seen.set(o.family, o); }
  return [...seen.values()];
}
export function validResult(r: Partial<ExamResult>): boolean {
  if (typeof r.value !== 'number' || !Number.isFinite(r.value) || !r.system || !GRADE_SPECS[r.system]) return false;
  switch (r.system) {
    case 'de_grade': return r.value >= 0.7 && r.value <= 6;
    case 'points15': return r.value >= 0 && r.value <= 15;
    case 'percent': return r.value >= 0 && r.value <= 100;
    case 'xofy': return typeof r.max === 'number' && r.max > 0 && r.max <= 10000 && r.value >= 0 && r.value <= r.max;
    default: return !!optionFor(r.system, r.value);
  }
}
