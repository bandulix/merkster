/* Merkster – tolerant answer checking.
   result: 'correct' | 'almost' | 'wrong'; accepted: counts as a successful recall. */
export type CheckResult = 'correct' | 'almost' | 'wrong';
export type Why = 'typo' | 'accent' | 'case' | 'article' | 'missing_article' | 'empty' | null;
export interface CheckOptions { lang?: string; strict?: boolean; articles?: boolean; }
export interface CheckOutcome { result: CheckResult; accepted: boolean; why: Why; expected: string; }
interface Core { r: CheckResult; why?: Exclude<Why, null>; base?: Core; }
type Opts = Required<CheckOptions>;

export const ARTICLES: Record<string, string[]> = {
  de: ['der', 'die', 'das', 'den', 'dem', 'des', 'ein', 'eine', 'einen', 'einem', 'einer'],
  en: ['the', 'an', 'a', 'to'],
  fr: ["l'", 'les', 'le', 'la', 'un', 'une', 'des', "s'", 'se'],
  es: ['los', 'las', 'el', 'la', 'unos', 'unas', 'un', 'una', 'lo'],
  la: [],
  it: ["l'", 'il', 'lo', 'la', 'gli', 'le', 'i', 'un', 'una', 'uno']
};
const PLACEHOLDER = /(^|\s)(sb's|sb|sth|smb|smth|so\.|jdn\.?|jdm\.?|jds\.?|jmdn\.?|jmdm\.?|jmds\.?|etw\.?|qn|qc|qqn|qqch)(?=\s|$|[,;.])/gi;

export function basicClean(s: unknown): string {
  return String(s == null ? '' : s).normalize('NFC')
    .replace(/[’‘´`]/g, "'").replace(/[“”„«»"]/g, '')
    .replace(/\s+/g, ' ').trim()
    .replace(/^[\s.,;:!?¡¿–—-]+/, '').replace(/[\s.,;:!?–—-]+$/, '').trim();
}
export function stripPlural(s: string): string {
  return s
    .replace(/\s*\((?:pl\.?|plural|Pl\.?)\s[^)]*\)/gi, '')
    .replace(/\s*\(\s*[-¨"=~][^)]*\)/g, '')
    .replace(/,\s*(?:[-¨"=~]\S*|die\s+\S+|pl\.?\s+\S+)(?:\s+(?:m|f|n|nt|mf)\.?)?\s*$/i, '')
    .replace(/\s+(?:pl\.?|plural)\s+\S+$/i, '')
    .replace(/\s+(?:m|f|n)\.$/i, '')
    .trim();
}
export function alternatives(target: string): string[] {
  const full = basicClean(target);
  const base = stripPlural(full);
  const parts = base.split(/\s*[;,/|]\s*|\s+or\s+|\s+oder\s+|\s+ou\s+|\s+o\s+(?=\S)/i).map(basicClean).filter(Boolean);
  return [...new Set([base, ...parts].filter(Boolean))];
}
function variants(s: string): string[] {
  const out = new Set([s]);
  if (/[()]/.test(s)) {
    out.add(s.replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s+/g, ' ').trim());
    out.add(s.replace(/[()]/g, '').replace(/\s+/g, ' ').trim());
  }
  for (const v of [...out]) {
    const np = v.replace(PLACEHOLDER, ' ').replace(/\s+/g, ' ').trim();
    if (np) out.add(np);
  }
  return [...out].filter(Boolean);
}
export function splitArticle(s: string, lang?: string): [string, string] {
  const arts = ARTICLES[lang || ''] || [];
  const lower = s.toLowerCase();
  for (const a of arts) {
    if (a.endsWith("'")) { if (lower.startsWith(a) && s.length > a.length) return [a, s.slice(a.length).trim()]; }
    else if (lower.startsWith(a + ' ') && s.length > a.length + 1) return [a, s.slice(a.length + 1).trim()];
  }
  return ['', s];
}
const umlaut = (s: string) => s.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/-/g, ' ').replace(/\s+/g, ' ');
const deacc = (s: string) => umlaut(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/œ/g, 'oe').replace(/æ/g, 'ae');

/** Damerau–Levenshtein (optimal string alignment) */
export function dist(a: string, b: string): number {
  const n = a.length, m = b.length;
  if (!n) return m; if (!m) return n;
  const d: number[][] = Array.from({ length: n + 1 }, (_, i) => { const r = new Array<number>(m + 1).fill(0); r[0] = i; return r; });
  for (let j = 0; j <= m; j++) d[0][j] = j;
  for (let i = 1; i <= n; i++) for (let j = 1; j <= m; j++) {
    const c = a[i - 1] === b[j - 1] ? 0 : 1;
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + c);
    if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
  }
  return d[n][m];
}
const tolerance = (len: number) => (len <= 3 ? 0 : len <= 6 ? 1 : 2);

function compareCore(u: string, t: string, o: Opts): Core {
  if (!u || !t) return { r: 'wrong' };
  if (u === t) return { r: 'correct' };
  if (u.toLowerCase() === t.toLowerCase()) {
    if (o.strict && o.lang === 'de' && u[0] !== t[0]) return { r: 'almost', why: 'case' };
    return { r: 'correct' };
  }
  const U = umlaut(u), T = umlaut(t);
  if (U === T) return { r: 'correct' };
  const DU = deacc(U), DT = deacc(T);
  if (DU === DT) return o.strict ? { r: 'almost', why: 'accent' } : { r: 'correct', why: 'accent' };
  if (dist(DU, DT) <= tolerance(DT.length)) return { r: 'almost', why: 'typo' };
  return { r: 'wrong' };
}
const RANK: Record<CheckResult, number> = { correct: 3, almost: 2, wrong: 0 };

function acceptedOf(res: Core, o: Opts): boolean {
  if (res.r === 'correct') return true;
  if (res.r !== 'almost') return false;
  if (res.why === 'missing_article') return false;
  if (res.why === 'article') return !o.articles && (!res.base || res.base.r === 'correct' || !o.strict);
  return !o.strict; // typo / accent / case in tolerant mode
}
const finish = (res: Core, o: Opts, expected: string): CheckOutcome => ({ result: res.r, accepted: acceptedOf(res, o), why: res.why || null, expected });

export function check(userRaw: string, targetRaw: string, opts?: CheckOptions): CheckOutcome {
  const o: Opts = { lang: 'en', strict: false, articles: false, ...(opts || {}) } as Opts;
  const expected = String(targetRaw || '').trim();
  const u0 = basicClean(userRaw);
  if (!u0) return { result: 'wrong', accepted: false, why: 'empty', expected };
  const userParts = o.strict ? [u0] : [...new Set([u0, ...u0.split(/\s*[;,/]\s*/).map(basicClean).filter(Boolean)])];
  let best: Core = { r: 'wrong' };
  for (const up of userParts) for (const uv of variants(up)) {
    const [ua, uc] = splitArticle(uv, o.lang);
    for (const alt of alternatives(expected)) for (const tv of variants(alt)) {
      const [ta, tc] = splitArticle(tv, o.lang);
      let res = compareCore(uc, tc, o);
      if (res.r === 'wrong' && (ua || ta)) {
        const full = compareCore(uv, tv, o);
        if (RANK[full.r] > RANK[res.r]) res = full;
      }
      if (res.r !== 'wrong' && ta) {
        if (!ua) { if (o.articles) res = { r: 'almost', why: 'missing_article', base: res }; }
        else if (ua.toLowerCase() !== ta.toLowerCase()) res = { r: 'almost', why: 'article', base: res };
      }
      const better = RANK[res.r] > RANK[best.r] || (res.r === best.r && res.r === 'almost' && acceptedOf(res, o) && !acceptedOf(best, o));
      if (better) best = res;
      if (best.r === 'correct' && !best.why) return finish(best, o, expected);
    }
  }
  return finish(best, o, expected);
}

/** does the sentence contain the term (fuzzy, articles/plural tolerant)? */
export function containsTerm(sentence: string, term: string, lang?: string): boolean {
  const s = deacc(basicClean(sentence));
  for (const alt of alternatives(term)) for (const v of variants(alt)) {
    const core = deacc(splitArticle(v, lang)[1]);
    if (!core) continue;
    if (s.includes(core)) return true;
    const stem = core.length > 5 ? core.slice(0, core.length - 2) : core;
    const words = s.split(/[^a-z0-9']+/);
    if (core.indexOf(' ') < 0 && words.some(w => w.startsWith(stem) || (w.length > 3 && dist(w, core) <= tolerance(core.length)))) return true;
  }
  return false;
}
export const stripArticle = (s: string, lang?: string) => splitArticle(basicClean(s), lang)[1];
