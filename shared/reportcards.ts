/* Report cards (Zeugnisse): subject catalogue + synonym/fuzzy matching, school terms, grade-text parsing,
   report-card statistics. Pure functions – shared by app, server and tests. */
import type { GradeSystem, Lang, Subject, Test } from './types';
import { fromPct, GRADE_SPECS, nearestOption, parseDeGrade, scoreOf, toPct, validResult } from './grades';

/* ---------------- subjects ---------------- */
export interface CanonSubject { id: string; icon: string; name: { en: string; de: string }; syn: string[]; test?: { subject: Subject; foreign?: Lang } }
/** canonical school subjects with the names / abbreviations used on German (and other) report cards */
export const CANON_SUBJECTS: CanonSubject[] = [
  { id: 'math', icon: '📐', name: { en: 'Maths', de: 'Mathe' }, syn: ['mathe', 'mathematik', 'm', 'ma', 'mat', 'math', 'maths', 'mathematics'], test: { subject: 'math' } },
  { id: 'german', icon: '📖', name: { en: 'German', de: 'Deutsch' }, syn: ['deutsch', 'd', 'de', 'dt', 'german'], test: { subject: 'languages', foreign: 'de' } },
  { id: 'english', icon: '🇬🇧', name: { en: 'English', de: 'Englisch' }, syn: ['englisch', 'e', 'en', 'eng', 'eng.', 'english'], test: { subject: 'languages', foreign: 'en' } },
  { id: 'french', icon: '🇫🇷', name: { en: 'French', de: 'Französisch' }, syn: ['franzosisch', 'franzoesisch', 'f', 'fr', 'franz', 'french', 'francais'], test: { subject: 'languages', foreign: 'fr' } },
  { id: 'spanish', icon: '🇪🇸', name: { en: 'Spanish', de: 'Spanisch' }, syn: ['spanisch', 's', 'spa', 'span', 'spanish', 'espanol'], test: { subject: 'languages', foreign: 'es' } },
  { id: 'latin', icon: '🏛️', name: { en: 'Latin', de: 'Latein' }, syn: ['latein', 'l', 'la', 'lat', 'latin'], test: { subject: 'languages', foreign: 'la' } },
  { id: 'biology', icon: '🧬', name: { en: 'Biology', de: 'Biologie' }, syn: ['bio', 'biologie', 'b', 'bi', 'biology'], test: { subject: 'biology' } },
  { id: 'chemistry', icon: '⚗️', name: { en: 'Chemistry', de: 'Chemie' }, syn: ['chemie', 'ch', 'c', 'chem', 'chemistry'], test: { subject: 'chemistry' } },
  { id: 'physics', icon: '🔭', name: { en: 'Physics', de: 'Physik' }, syn: ['physik', 'ph', 'phy', 'p', 'physics'], test: { subject: 'physics' } },
  { id: 'history', icon: '🏺', name: { en: 'History', de: 'Geschichte' }, syn: ['geschichte', 'ge', 'g', 'gesch', 'history', 'hist'], test: { subject: 'history' } },
  { id: 'geography', icon: '🌍', name: { en: 'Geography', de: 'Erdkunde' }, syn: ['erdkunde', 'geo', 'geographie', 'geografie', 'ek', 'erdk', 'geography'], test: { subject: 'geography' } },
  { id: 'politics', icon: '🗳️', name: { en: 'Politics', de: 'PoWi' }, syn: ['powi', 'politik', 'politik und wirtschaft', 'sozialkunde', 'sowi', 'sozialwissenschaften', 'gemeinschaftskunde', 'gk', 'sk', 'wipo', 'politics', 'civics', 'gesellschaftslehre', 'gl'], test: { subject: 'politics' } },
  { id: 'economics', icon: '📈', name: { en: 'Economics', de: 'Wirtschaft' }, syn: ['wirtschaft', 'wi', 'wat', 'okonomie', 'oekonomie', 'economics', 'wirtschaftslehre'], test: { subject: 'economics' } },
  { id: 'religion', icon: '🕊️', name: { en: 'Religion / Ethics', de: 'Religion / Ethik' }, syn: ['religion', 'reli', 'rel', 'ev religion', 'kath religion', 'evangelische religion', 'katholische religion', 'ethik', 'eth', 'philosophie', 'werte und normen', 'lebensgestaltung ethik religionskunde', 'ler', 're', 'ethics'], test: { subject: 'religion' } },
  { id: 'music', icon: '🎵', name: { en: 'Music', de: 'Musik' }, syn: ['musik', 'mu', 'mus', 'music'], test: { subject: 'music' } },
  { id: 'art', icon: '🎨', name: { en: 'Art', de: 'Kunst' }, syn: ['kunst', 'ku', 'bk', 'bildende kunst', 'art'] },
  { id: 'sport', icon: '⚽', name: { en: 'PE', de: 'Sport' }, syn: ['sport', 'sp', 'spo', 'pe', 'physical education', 'sporterziehung'] },
  { id: 'cs', icon: '💻', name: { en: 'Computer science', de: 'Informatik' }, syn: ['informatik', 'inf', 'if', 'info', 'it', 'computer science', 'computing'] },
  { id: 'science', icon: '🔬', name: { en: 'Science', de: 'NaWi' }, syn: ['nawi', 'naturwissenschaften', 'nw', 'science'] },
  { id: 'technology', icon: '🛠️', name: { en: 'Technology', de: 'Technik' }, syn: ['technik', 'tc', 'tech', 'technology'] }
];
/** lines on a report card that are not subjects (conduct, remarks, absences …) */
export const IGNORE_HINTS = ['verhalten', 'arbeitsverhalten', 'sozialverhalten', 'mitarbeit', 'ordnung', 'bemerkung', 'bemerkungen', 'fehltage', 'versaumnisse', 'versaeumnisse', 'versetzung', 'konferenz', 'datum', 'unterschrift', 'klassenlehrer', 'conduct', 'behaviour', 'remarks', 'absences', 'ag', 'wahlpflicht'];

export const canon = (id: string) => CANON_SUBJECTS.find(c => c.id === id) || null;
export const isCustomSubject = (id: string) => id.startsWith('c_');
export const normName = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ß/g, 'ss')
  .replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
export const customId = (name: string) => 'c_' + normName(name).replace(/ /g, '-').slice(0, 40);

function lev(a: string, b: string) {
  const m = a.length, n = b.length; if (!m) return n; if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) { const cur = [i]; for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = cur; }
  return prev[n];
}
const sim = (a: string, b: string) => 1 - lev(a, b) / Math.max(a.length, b.length);

export interface SubjectChoice { id: string; name: string }
export interface SubjectMatch { id: string | null; confidence: number; ignore: boolean; via: 'synonym' | 'custom' | 'prefix' | 'fuzzy' | 'ignore' | 'none' }
/** match a subject name as printed on a report card to a canonical or the student's own (custom) subject */
export function matchSubject(raw: string, custom: SubjectChoice[] = []): SubjectMatch {
  const n = normName(raw).replace(/^(ev|kath|evang|kath\.) /, m => m);   // keep "ev religion" etc. intact
  if (!n) return { id: null, confidence: 0, ignore: true, via: 'ignore' };
  if (IGNORE_HINTS.some(h => n === h || (h.length > 4 && n.startsWith(h)))) return { id: null, confidence: 0.9, ignore: true, via: 'ignore' };
  for (const c of custom) if (normName(c.name) === n) return { id: c.id, confidence: 1, ignore: false, via: 'custom' };
  for (const c of CANON_SUBJECTS) if (c.syn.includes(n) || normName(c.name.de) === n || normName(c.name.en) === n) return { id: c.id, confidence: 1, ignore: false, via: 'synonym' };
  // "Mathematik (Grundkurs)", "Englisch 1. FS", "Ev. Religionslehre"
  const words = n.split(' ');
  for (const c of CANON_SUBJECTS) for (const s of c.syn) if (s.length >= 4 && (words.includes(s) || n.startsWith(s) || (s.startsWith(n) && n.length >= 4))) return { id: c.id, confidence: 0.85, ignore: false, via: 'prefix' };
  let best: { id: string; s: number } | null = null;
  const pool = [...custom.map(c => ({ id: c.id, names: [normName(c.name)] })), ...CANON_SUBJECTS.map(c => ({ id: c.id, names: [...c.syn.filter(s => s.length >= 4), normName(c.name.de), normName(c.name.en)] }))];
  for (const p of pool) for (const name of p.names) { const s = Math.max(sim(n, name), sim(words[0], name)); if (!best || s > best.s) best = { id: p.id, s }; }
  if (best && best.s >= 0.72) return { id: best.id, confidence: Math.round(best.s * 0.9 * 100) / 100, ignore: false, via: 'fuzzy' };
  return { id: null, confidence: 0, ignore: false, via: 'none' };
}
/** which report-card subject a test belongs to */
export function subjectOfTest(t: Pick<Test, 'subject' | 'foreign'>): string | null {
  for (const c of CANON_SUBJECTS) if (c.test && c.test.subject === t.subject && (!c.test.foreign || c.test.foreign === t.foreign)) return c.id;
  return null;
}

/* ---------------- terms ---------------- */
/** default German school terms: 1st half Aug–Jan, 2nd half Feb–Jul */
export const DEFAULT_TERM_STARTS: [number, number] = [8, 2];
export interface Term { id: string; schoolYear: string; half: 1 | 2; start: string; end: string }
const pad = (n: number) => String(n).padStart(2, '0');
const lastDay = (y: number, m: number) => new Date(y, m, 0).getDate();
/** the school term a date (YYYY-MM-DD) falls into; starts = [month the school year starts, month the 2nd half starts] */
export function termOf(day: string, starts: [number, number] = DEFAULT_TERM_STARTS): Term {
  const [y, m] = day.split('-').map(Number);
  const [s1, s2] = starts;
  const syStart = m >= s1 ? y : y - 1;                       // school year begins in month s1
  const monthsIn = (m - s1 + 12) % 12, secondAt = (s2 - s1 + 12) % 12;
  const half: 1 | 2 = monthsIn >= secondAt ? 2 : 1;
  const sy = `${syStart}/${String((syStart + 1) % 100).padStart(2, '0')}`;
  const yOf = (month: number) => (month >= s1 ? syStart : syStart + 1);
  const startM = half === 1 ? s1 : s2, endM = half === 1 ? ((s2 + 10) % 12) + 1 : ((s1 + 10) % 12) + 1;
  return { id: `${syStart}-${half}`, schoolYear: sy, half, start: `${yOf(startM)}-${pad(startM)}-01`, end: `${yOf(endM)}-${pad(endM)}-${pad(lastDay(yOf(endM), endM))}` };
}
export const TERM_KINDS = ['h1', 'final', 'custom'] as const;
export type TermKind = (typeof TERM_KINDS)[number];
/** the term a report card closes */
export function termOfCard(c: Pick<ReportCard, 'schoolYear' | 'term' | 'issuedOn'>, starts: [number, number] = DEFAULT_TERM_STARTS): Term {
  const sy = Number((c.schoolYear || '').slice(0, 4));
  if (c.term !== 'custom' && sy > 2000) {
    const [s1, s2] = starts, month = c.term === 'h1' ? s1 : s2, y = month >= s1 ? sy : sy + 1;
    return termOf(`${y}-${pad(month)}-15`, starts);
  }
  // a custom card / unknown year: the term that just ended before (or contains) the issue date
  return termOf(c.issuedOn, starts);
}
export const schoolYearOf = (day: string, starts: [number, number] = DEFAULT_TERM_STARTS) => termOf(day, starts).schoolYear;

/* ---------------- grades as printed ---------------- */
const DE_WORDS: [RegExp, number][] = [[/sehr gut/, 1], [/ungenugend|ungenuegend/, 6], [/mangelhaft/, 5], [/ausreichend/, 4], [/befriedigend/, 3], [/\bgut\b/, 2]];
/** "2-", "gut", "befriedigend (3)", "13 P", "B+", "5.5", "87 %" → a value in the given system (or null) */
export function parseGradeText(text: string, system: GradeSystem): number | null {
  const s = String(text || '').trim(); if (!s) return null;
  const n = normName(s);
  if (system === 'de_grade') {
    const m = s.match(/(?<![\d.,])([1-6])\s*([+-]?)(?![\d.,])/); if (m) return parseDeGrade(m[1] + m[2]);
    for (const [re, v] of DE_WORDS) if (re.test(n)) return v;
    return null;
  }
  if (system === 'us_letter') {
    const m = s.toUpperCase().match(/\b([A-DF])\s*([+-]?)/); if (!m) return null;
    const label = m[1] === 'F' ? 'F' : m[1] + m[2];
    return GRADE_SPECS.us_letter.options!.find(o => o.label === label)?.value ?? null;
  }
  const num = s.replace(',', '.').match(/\d+(\.\d+)?/); if (!num) return null;
  const v = Number(num[0]);
  return validResult({ system, value: v, enteredAt: 0, ...(system === 'xofy' ? { max: 100 } : {}) }) ? v : null;
}

/* ---------------- report cards ---------------- */
export interface ReportLine { subjectId: string; name: string; value: number; score: number }
export interface ReportCard {
  id: string; schoolYear: string; term: TermKind; termLabel: string; issuedOn: string; system: GradeSystem;
  lines: ReportLine[]; avgScore: number; createdAt: number; hasPhoto?: boolean;
}
export const avgOf = (lines: Pick<ReportLine, 'score'>[]) => lines.length ? Math.round(lines.reduce((a, b) => a + b.score, 0) / lines.length * 100) / 100 : 0;
export const lineScore = (system: GradeSystem, value: number) => scoreOf({ system, value, max: system === 'xofy' ? 100 : undefined });
/** chronological order of report cards */
export const byIssued = <T extends Pick<ReportCard, 'issuedOn' | 'createdAt'>>(a: T, b: T) => a.issuedOn.localeCompare(b.issuedOn) || a.createdAt - b.createdAt;
/** compared with the previous report card: per subject +/−, overall delta */
export function compareCards(card: Pick<ReportCard, 'lines' | 'avgScore'>, prev: Pick<ReportCard, 'lines' | 'avgScore'> | null) {
  const per = card.lines.map(l => { const p = prev?.lines.find(x => x.subjectId === l.subjectId); return { subjectId: l.subjectId, delta: p ? Math.round((l.score - p.score) * 100) / 100 : null }; });
  return { per, improved: per.filter(x => x.delta != null && x.delta > 0.5).length, worse: per.filter(x => x.delta != null && x.delta < -0.5).length, avgDelta: prev ? Math.round((card.avgScore - prev.avgScore) * 100) / 100 : null };
}
/** exam average per subject in the term a card closes (normalised score), from the tests the student logged */
export function examAverages(tests: Pick<Test, 'subject' | 'foreign' | 'testDate' | 'result'>[], term: Term) {
  const out = new Map<string, { avg: number; n: number }>();
  const acc = new Map<string, number[]>();
  for (const t of tests) {
    if (!t.result || t.testDate < term.start || t.testDate > term.end) continue;
    const sid = subjectOfTest(t); if (!sid) continue;
    acc.set(sid, [...(acc.get(sid) || []), scoreOf(t.result)]);
  }
  for (const [k, v] of acc) out.set(k, { avg: v.reduce((a, b) => a + b, 0) / v.length, n: v.length });
  return out;
}
/** friendly explanation of the gap between exam average and report-card grade */
export const gapKind = (examAvg: number | null, cardScore: number): 'none' | 'match' | 'better' | 'worse' =>
  examAvg == null ? 'none' : cardScore - examAvg >= 7 ? 'better' : examAvg - cardScore >= 7 ? 'worse' : 'match';
/** a grade of a discrete system at (or nearest to) a score – for sliders */
export const gradeAt = (system: GradeSystem, pct: number) => nearestOption(pct, system);

/** an average score shown as a (continuous) grade: Ø 1.8, Ø 11.2 P, Ø 4.6 (CH) … */
export function avgValue(system: GradeSystem, pct: number): number {
  switch (system) {
    case 'de_grade': return Math.min(6, Math.max(0.7, (17 - pct * 15 / 100) / 3));
    case 'points15': return pct * 15 / 100;
    case 'ch_grade': return 1 + pct / 20;
    default: return fromPct(pct, system);
  }
}
/** the score an average threshold ("Ø 2.0 or better") corresponds to – the inverse of avgValue */
export function avgThreshold(system: GradeSystem, value: number): number {
  switch (system) {
    case 'de_grade': return Math.min(100, Math.max(0, (17 - 3 * value) / 15 * 100));
    case 'points15': return value / 15 * 100;
    case 'ch_grade': return (value - 1) * 20;
    case 'percent': case 'xofy': return value;
    default: return toPct({ system, value });
  }
}
export function fmtAvg(system: GradeSystem, pct: number, locale = 'de-DE'): string {
  const v = avgValue(system, pct);
  if (system === 'percent' || system === 'xofy') return `${Math.round(v)} %`;
  if (system === 'us_letter' || system === 'uk_gcse' || system === 'at_grade') return nearestOption(pct, system)!.label + (system === 'at_grade' ? ` (${v.toLocaleString(locale, { maximumFractionDigits: 1 })})` : '');
  return v.toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + (system === 'points15' ? ' P' : '');
}

/** report cards → what progression needs (XP, "Improved in 3 subjects", "Best report card yet") */
export function cardsLite(cards: Pick<ReportCard, 'id' | 'issuedOn' | 'createdAt' | 'lines' | 'avgScore'>[]) {
  const sorted = [...cards].sort(byIssued);
  return sorted.map((c, i) => {
    const prev = i > 0 ? sorted[i - 1] : null;
    return { id: c.id, at: c.createdAt, improved: compareCards(c, prev).improved, best: i > 0 && sorted.slice(0, i).every(p => c.avgScore > p.avgScore + 0.01) };
  });
}
