/* Merkster – turn OCR output / pasted text into card rows (no AI). */
import type { CardType } from '../../../shared/types';

export interface ParsedRow { type?: CardType; a: string; b: string; example?: string; sep?: string | null; conf?: number; low?: boolean; flags?: string[]; ocrConf?: number; kind?: string; }
export interface Header { la?: string; lb?: string; }
export interface OcrWord { text: string; conf?: number; x0: number; y0: number; x1: number; y1: number; }
interface Line { words: OcrWord[]; cy?: number; n?: number; x0: number; x1: number; y0: number; y1: number; }
interface Gap { x0: number; x1: number; w: number; cx: number; support: number; }

const LANG_NAMES: Record<string, RegExp> = {
  en: /^(english|englisch|anglais|ingl[eé]s|e)$/i,
  de: /^(deutsch|german|allemand|alem[aá]n|d|dt\.?)$/i,
  fr: /^(franz[öo]e?sisch|french|fran[cç]ais|franc[eé]s|f)$/i,
  es: /^(spanisch|spanish|espagnol|espa[nñ]ol|s)$/i,
  la: /^(latein|latin|latina|lat\.?)$/i
};
const HEADER_WORD = /^(vokabeln?|vocabulary|vocab|words?|w[öo]e?rter|wort|translation|[üu]e?bersetzung|bedeutung|meaning|unit|lektion|lesson|kapitel|chapter|page|seite|nr\.?|no\.?|#|word ?list|wortliste|term|begriff|english|englisch|deutsch|german|franz[öo]sisch|french|fran[cç]ais|spanisch|spanish|espa[nñ]ol|latein|latin)$/i;
const SEPARATORS: { name: string; re: RegExp }[] = [
  { name: 'tab', re: /\t+/ },
  { name: 'pipe', re: /\s+[|¦]\s+/ },
  { name: 'equals', re: /\s*={1,2}\s*/ },
  { name: 'arrow', re: /\s*(?:->|→|=>|⇒|➔)\s*/ },
  { name: 'dash', re: /\s+[–—]\s+|\s+-{1,2}\s+/ },
  { name: 'colon', re: /\s+:\s+|(?<=\S):\s+/ },
  { name: 'spaces', re: / {3,}/ },
  { name: 'semicolon', re: /\s+;\s+/ }
];

export function cleanCell(s: unknown): string {
  return String(s || '')
    .replace(/[|¦[\]{}]+/g, ' ')
    .replace(/^[\s_—~.,]+|[\s_—~,]+$/g, '')
    .replace(/[ \u00a0]{2,}/g, m => (m.length >= 3 ? m : ' '))
    .trim();
}
export function stripNumbering(s: string): string {
  return s.replace(/^\s*(?:\(?\d{1,3}\s*[.):]\s*|\d{1,3}\s+(?=\D)|[•·▪◦●○■□*►>]\s*|[-–—]\s+|[a-z]\)\s+)/i, '').trim();
}
export function splitLine(line: string): { a: string; b: string; sep: string | null } {
  let s = stripNumbering(String(line || '').replace(/[|¦]/g, ' | ').replace(/[ ]+\|[ ]+\|[ ]+/g, ' | ').trim());
  s = s.replace(/^\|\s*/, '').replace(/\s*\|$/, '');
  for (const sep of SEPARATORS) {
    const m = s.match(sep.re);
    if (!m || !m.index || m.index <= 0) continue;
    let a = s.slice(0, m.index), b = s.slice(m.index + m[0].length);
    if (sep.name === 'dash' && /,\s*$/.test(a) && /^-/.test(b)) { a = a + ' -'; b = b.replace(/^-+\s*/, ''); }
    a = cleanCell(a); b = cleanCell(b);
    if (a && b) return { a, b, sep: sep.name };
  }
  return { a: cleanCell(s), b: '', sep: null };
}

function rowConf<T extends ParsedRow>(r: T): T {
  let c = r.ocrConf == null ? 1 : r.ocrConf;
  const flags: string[] = [];
  if (!r.a || !r.b) { c = Math.min(c, 0.3); flags.push('missing'); }
  if (/[@#$%^*_<>\\{}[\]|]/.test(r.a + r.b)) { c *= 0.6; flags.push('odd'); }
  if (r.a.length > 60 || r.b.length > 90) { c *= 0.7; flags.push('long'); }
  if (/\d{2,}/.test(r.a + r.b)) { c *= 0.8; flags.push('digits'); }
  r.conf = Math.round(c * 100) / 100;
  r.low = r.conf < 0.65;
  r.flags = flags;
  return r;
}
function headerLangs(r: ParsedRow): Header {
  const la = Object.keys(LANG_NAMES).find(k => LANG_NAMES[k].test((r.a || '').trim()));
  const lb = Object.keys(LANG_NAMES).find(k => LANG_NAMES[k].test((r.b || '').trim()));
  return { la, lb };
}
function isHeader(r: ParsedRow): boolean {
  const words = (r.a + ' ' + r.b).trim().split(/\s+/);
  if (words.length > 5) return false;
  const hits = words.filter(w => HEADER_WORD.test(w.replace(/[:.]$/, ''))).length;
  if (hits >= Math.max(1, Math.ceil(words.length / 2))) return true;
  const { la, lb } = headerLangs(r);
  return !!(la && lb && r.a.length > 1 && r.b.length > 1 && la !== lb);
}
function finalize(rows: ParsedRow[]): { rows: ParsedRow[]; header: Header | null } {
  let header: Header | null = null;
  const out: ParsedRow[] = [];
  rows.forEach((r, i) => {
    if (!r.a && !r.b) return;
    if (i < 3 && out.length === 0 && isHeader(r)) { const h = headerLangs(r); if (h.la || h.lb) header = h; return; }
    if (/^(seite|page|unit|lektion|lesson|kapitel|chapter)\s*\d*$/i.test((r.a + ' ' + r.b).trim())) return;
    out.push(rowConf(r));
  });
  return { rows: out, header };
}

/* ---------- plain text ---------- */
export function parseText(text: string) {
  const lines = String(text || '').split(/\r?\n/).map(l => l.replace(/\s+$/, '')).filter(l => l.trim());
  const rows: ParsedRow[] = [];
  for (const line of lines) {
    const r = splitLine(line);
    const prev = rows[rows.length - 1];
    if (!r.b && prev && prev.b && /^[a-zäöüàâçéèêëîïôûùÿñ(]/.test(r.a) && r.a.split(' ').length <= 4 && !/^\d/.test(line.trim())) {
      prev.b = (prev.b + ' ' + r.a).trim(); continue; // wrapped continuation
    }
    rows.push({ a: r.a, b: r.b, sep: r.sep });
  }
  return finalize(rows);
}

/* ---------- OCR words with boxes ---------- */
const median = (arr: number[]) => { if (!arr.length) return 0; const s = [...arr].sort((a, b) => a - b); return s[s.length >> 1]; };

function groupLines(words: OcrWord[], tessLines?: OcrWord[][] | null): { lines: Line[]; medH: number } {
  let lines: Line[];
  const medH = median(words.map(w => w.y1 - w.y0)) || 10;
  if (tessLines && tessLines.length) {
    lines = tessLines.map(l => ({ words: l.filter(w => w.text && w.text.trim()) } as Line)).filter(l => l.words.length);
  } else {
    const sorted = [...words].sort((a, b) => (a.y0 + a.y1) - (b.y0 + b.y1));
    lines = [];
    for (const w of sorted) {
      const cy = (w.y0 + w.y1) / 2;
      let line: Line | null = null;
      for (let i = lines.length - 1; i >= Math.max(0, lines.length - 3); i--) if (Math.abs((lines[i].cy as number) - cy) < medH * 0.55) { line = lines[i]; break; }
      if (!line) { line = { cy, n: 0, words: [], x0: 0, x1: 0, y0: 0, y1: 0 }; lines.push(line); }
      line.words.push(w); line.cy = ((line.cy as number) * (line.n as number) + cy) / ((line.n as number) + 1); line.n = (line.n as number) + 1;
    }
  }
  lines.forEach(l => {
    l.words.sort((a, b) => a.x0 - b.x0);
    l.y0 = Math.min(...l.words.map(w => w.y0)); l.y1 = Math.max(...l.words.map(w => w.y1));
    l.x0 = Math.min(...l.words.map(w => w.x0)); l.x1 = Math.max(...l.words.map(w => w.x1));
  });
  // merge lines that sit side by side (column blocks split by layout analysis)
  lines.sort((a, b) => a.y0 - b.y0);
  const merged: Line[] = [];
  for (const l of lines) {
    const m = merged.find(o => {
      const ov = Math.min(o.y1, l.y1) - Math.max(o.y0, l.y0);
      const h = Math.min(o.y1 - o.y0, l.y1 - l.y0);
      const xOverlap = Math.min(o.x1, l.x1) - Math.max(o.x0, l.x0);
      return ov > h * 0.5 && xOverlap < 0;
    });
    if (m) { m.words.push(...l.words); m.words.sort((a, b) => a.x0 - b.x0); m.x0 = Math.min(m.x0, l.x0); m.x1 = Math.max(m.x1, l.x1); m.y0 = Math.min(m.y0, l.y0); m.y1 = Math.max(m.y1, l.y1); }
    else merged.push(l);
  }
  merged.sort((a, b) => (a.y0 + a.y1) - (b.y0 + b.y1));
  return { lines: merged, medH };
}

function findGaps(lines: Line[]): Gap[] {
  const all = lines.flatMap(l => l.words);
  const minX = Math.min(...all.map(w => w.x0)), maxX = Math.max(...all.map(w => w.x1));
  const W = maxX - minX; if (W <= 0) return [];
  const BIN = 2, nb = Math.ceil(W / BIN) + 1;
  const cov = new Int32Array(nb);
  for (const l of lines) {
    const mark = new Uint8Array(nb);
    for (const w of l.words) for (let i = Math.floor((w.x0 - minX) / BIN); i <= Math.floor((w.x1 - minX) / BIN); i++) mark[i] = 1;
    for (let i = 0; i < nb; i++) cov[i] += mark[i];
  }
  const charW = median(all.map(w => (w.x1 - w.x0) / Math.max(1, w.text.length))) || 8;
  const tol = Math.floor(lines.length * 0.08);
  const minRun = Math.max(charW * 2.2, W * 0.02) / BIN;
  const gaps: Gap[] = [];
  let start = -1;
  for (let i = 0; i <= nb; i++) {
    const low = i < nb && cov[i] <= tol;
    if (low && start < 0) start = i;
    if (!low && start >= 0) {
      if (start > 0 && i < nb && i - start >= minRun) gaps.push({ x0: minX + start * BIN, x1: minX + i * BIN, w: (i - start) * BIN, cx: 0, support: 0 });
      start = -1;
    }
  }
  for (const g of gaps) {
    g.cx = (g.x0 + g.x1) / 2;
    g.support = lines.filter(l => l.words.some(w => w.x1 <= g.x0 + BIN) && l.words.some(w => w.x0 >= g.x1 - BIN)).length;
  }
  const need = Math.max(2, Math.ceil(lines.length * 0.4));
  return gaps.filter(g => g.support >= need).sort((a, b) => b.support * b.w - a.support * a.w).slice(0, 2).sort((a, b) => a.cx - b.cx);
}
function lineText(words: OcrWord[], charW: number): string {
  let s = '';
  words.forEach((w, i) => { if (i) s += (w.x0 - words[i - 1].x1) > charW * 2.5 ? '   ' : ' '; s += w.text; });
  return s;
}

/** words: [{text, conf (0-100), x0,y0,x1,y1}]; tessLines: optional array of word arrays */
export function parseWords(wordsIn: OcrWord[], tessLines?: OcrWord[][] | null): { rows: ParsedRow[]; header: Header | null; columns: number } {
  const words = (wordsIn || []).filter(w => w && w.text && w.text.trim() && w.x1 > w.x0);
  if (!words.length) return { rows: [], header: null, columns: 0 };
  const { lines } = groupLines(words, tessLines);
  const charW = median(words.map(w => (w.x1 - w.x0) / Math.max(1, w.text.length))) || 8;
  const gaps = lines.length >= 2 ? findGaps(lines) : [];
  const rows: { cells: string[]; ocrConf: number }[] = [];
  for (const l of lines) {
    const confs = l.words.map(w => (w.conf == null ? 90 : w.conf));
    const ocrConf = Math.min(1, (confs.reduce((a, b) => a + b, 0) / confs.length) / 100 * 1.1);
    if (gaps.length) {
      const cells: OcrWord[][] = Array.from({ length: gaps.length + 1 }, () => []);
      for (const w of l.words) { const cx = (w.x0 + w.x1) / 2; let k = 0; while (k < gaps.length && cx > gaps[k].cx) k++; cells[k].push(w); }
      rows.push({ cells: cells.map(c => cleanCell(lineText(c, charW))), ocrConf });
    } else {
      const sp = splitLine(lineText(l.words, charW));
      rows.push({ cells: [sp.a, sp.b], ocrConf });
    }
  }
  if (rows[0] && rows[0].cells.length === 3) { // drop a leading number column
    const numeric = rows.filter(r => /^\(?\d{1,3}[.)]?$/.test(r.cells[0]) || !r.cells[0]).length;
    if (numeric >= rows.length * 0.6) rows.forEach(r => r.cells.shift());
  }
  const out: ParsedRow[] = [];
  for (const r of rows) {
    let [a, b] = r.cells; const ex = r.cells[2];
    a = stripNumbering(a || ''); b = b || '';
    if (a && !b) { const sp = splitLine(a); if (sp.b) { a = sp.a; b = sp.b; } }
    const prev = out[out.length - 1];
    if (!a && b && prev) { prev.b = (prev.b + ' ' + b).trim(); if (ex) prev.example = ((prev.example || '') + ' ' + ex).trim(); continue; }
    if (!a && !b && ex && prev) { prev.example = ((prev.example || '') + ' ' + ex).trim(); continue; }
    out.push({ a, b, example: ex || '', ocrConf: r.ocrConf });
  }
  return { ...finalize(out), columns: gaps.length + 1 };
}

/* ---------- language orientation ---------- */
const FEAT: Record<string, [RegExp, number][]> = {
  de: [[/[äöüß]/gi, 2], [/^(der|die|das|ein|eine|sich)\s/i, 3], [/\b(und|oder|nicht|etwas|etw\.?|jdn|jdm|jds|mit|auf|zu|von|sein|haben|werden)\b/gi, 1.5], [/(ung|keit|heit|lich|isch|chen|schaft)\b/gi, 1], [/sch|tz|ei\b|ie/gi, 0.3]],
  en: [[/^(to|the|a|an)\s/i, 3], [/\b(sb|sth|somebody|something|the|and|of|be|get|make)\b/gi, 2], [/(ing|tion|ly|ness|ful)\b/gi, 1], [/th|wh|w/gi, 0.3]],
  fr: [[/[éèêàçùâîôûœë]/gi, 2], [/^(le|la|les|l'|un|une|se|s')\s?/i, 3], [/\b(de|du|des|et|qn|qc|qqn|qqch|être|avoir)\b/gi, 1.5], [/(eau|eux|oir|tion|ment|ique)\b/gi, 0.8]],
  es: [[/[ñáíóú¿¡]/gi, 2.5], [/^(el|la|los|las|un|una)\s/i, 3], [/\b(de|y|con|algo|alguien|ser|estar)\b/gi, 1.5], [/(ción|dad|mente|ar|er|ir)\b/gi, 0.7]],
  la: [[/(us|um|ae|is|orum|arum|ibus|are|ere|ire)\b/gi, 1.2], [/,\s*-(i|ae|is|oris|us)\b/gi, 3], [/\b(m|f|n)\.\s*$/gi, 1.5]]
};
export function langScore(text: string, lang: string): number {
  const f = FEAT[lang]; if (!f) return 0;
  let s = 0;
  for (const [re, w] of f) { const m = String(text).match(re); if (m) s += m.length * w; }
  return s;
}
const capNounBonus = (cells: string[]) => cells.filter(c => /^[A-ZÄÖÜ][a-zäöüß]+$/.test(c.trim())).length;

/** should column B be the foreign side? */
export function orient(rows: { a: string; b: string }[], foreign: string, native: string, header?: Header | null) {
  if (header && (header.la || header.lb)) {
    if (header.la === native || header.lb === foreign) return { swap: true, confidence: 1, by: 'header' as const };
    if (header.la === foreign || header.lb === native) return { swap: false, confidence: 1, by: 'header' as const };
  }
  const A = rows.map(r => r.a), B = rows.map(r => r.b);
  const sc = (cells: string[], lang: string) => cells.reduce((s, c) => s + langScore(c, lang), 0) + (lang === 'de' ? capNounBonus(cells) * 0.8 : 0);
  const aF = sc(A, foreign), aN = sc(A, native), bF = sc(B, foreign), bN = sc(B, native);
  const s = (aF - aN) - (bF - bN);
  return { swap: s < 0, confidence: Math.min(1, Math.abs(s) / Math.max(4, rows.length)), by: 'features' as const, scores: { aF, aN, bF, bN } };
}

/* ---------- general material (no AI): Q/A, dates, term: definition, definition sentences ---------- */
const QA_INLINE = /^(?:(?:Q|F|Frage|Question)\s*[:.]\s*)?(.{6,}?\?)\s+(?:(?:A|Antwort|Answer|Lösung)\s*[:.]\s*)?(.{1,})$/i;
const A_PREFIX = /^(?:A|Antwort|Answer|Lösung|Solution)\s*[:.)]\s*/i;
const Q_PREFIX = /^(?:Q|F|Frage|Question)\s*[:.)]\s*/i;
const DATE = /^((?:ca\.|um|c\.)?\s*(?:\d{1,2}\.\s?\d{1,2}\.\s?\d{3,4}|\d{1,2}\.?\s+[A-Za-zäöüÄÖÜ]+\.?\s+\d{3,4}|\d{3,4}(?:\s*[-–/]\s*\d{2,4})?(?:\s*(?:v\.|n\.)\s*Chr\.?|\s*(?:BC|AD|BCE|CE|v\.Chr\.|n\.Chr\.))?))\s*(?:[-–—:=|]|\s{2,}|\t)\s*(.{3,})$/;
const DEF_SEP = /^(.{1,48}?)\s*(?::\s|\s[-–—=]\s|\t|\s{3,}|\s?→\s?|\s->\s)\s*(.{2,})$/;
const DEF_EN = /^((?:The |A |An )?[A-Z][\w\-' ]{1,40}?)\s+(is|are|was|were|means|refers to|describes)\s+(.{8,})$/;
const DEF_DE = /^((?:Der |Die |Das |Ein |Eine )?[A-ZÄÖÜ][\wäöüßÄÖÜ\-' ]{1,40}?)\s+(ist|sind|war|waren|bezeichnet|bedeutet|heißt|heisst)\s+(.{8,})$/;
const UNTER = /^Unter\s+(?:dem|der|den|einer|einem|einen)?\s*(.{2,40}?)\s+versteht man\s+(.{6,})$/i;
const nWords = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
function startsItem(l: string): boolean {
  l = l.trim();
  if (/\?\s*$/.test(l) || /^\s*(?:\d{1,3}[.)]\s|Q\s*:|F\s*:|Frage\b|Question\b)/i.test(l)) return true;
  if (DATE.test(l) || UNTER.test(l)) return true;
  const m = l.match(DEF_SEP); if (m && nWords(m[1]) <= 5 && !/[.!?]$/.test(m[1]) && !A_PREFIX.test(l)) return true;
  const d = l.match(DEF_EN) || l.match(DEF_DE); return !!(d && nWords(d[1]) <= 5);
}

export function parseGeneral(text: string): { rows: ParsedRow[]; unused: number } {
  const raw = String(text || '').split(/\r?\n/).map(l => l.replace(/\s+$/, ''));
  const rows: ParsedRow[] = []; let unused = 0, last: ParsedRow | null = null;
  for (let i = 0; i < raw.length; i++) {
    let line = raw[i].trim();
    if (!line) { last = null; continue; }
    line = line.replace(/^[•·▪◦●○■□*►>]\s*/, '');
    let m: RegExpMatchArray | null;
    if ((m = line.match(DATE))) { last = { type: 'pair', a: m[1].trim(), b: cleanCell(m[2]), kind: 'date' }; rows.push(last); continue; }
    line = stripNumbering(line);
    if ((m = line.match(QA_INLINE)) && !/\?\s*$/.test(line)) { last = { type: 'qa', a: m[1].replace(Q_PREFIX, '').trim(), b: m[2].replace(A_PREFIX, '').trim() }; rows.push(last); continue; }
    if (/\?\s*$/.test(line) && nWords(line) >= 2) {
      const q = line.replace(Q_PREFIX, '').trim(); const ans: string[] = [];
      while (i + 1 < raw.length && ans.length < 3 && raw[i + 1].trim() && !startsItem(raw[i + 1])) ans.push(raw[++i].trim().replace(A_PREFIX, ''));
      last = { type: 'qa', a: q, b: ans.join(' ').trim() }; rows.push(last); continue;
    }
    if (A_PREFIX.test(line) && last && last.type === 'qa' && !last.b) { last.b = line.replace(A_PREFIX, '').trim(); continue; }
    if ((m = line.match(UNTER))) { last = { type: 'pair', a: m[1].trim(), b: cleanCell(m[2]).replace(/\.$/, '') }; rows.push(last); continue; }
    if ((m = line.match(DEF_SEP)) && nWords(m[1]) <= 5 && !/[.!?]$/.test(m[1])) { last = { type: 'pair', a: cleanCell(m[1]), b: cleanCell(m[2]) }; rows.push(last); continue; }
    if ((m = line.match(DEF_EN) || line.match(DEF_DE)) && nWords(m[1]) <= 5) {
      const subj = m[1].replace(/^(The|A|An|Der|Die|Das|Ein|Eine)\s+/, '').trim();
      last = { type: 'cloze', a: line.replace(subj, '[[' + subj + ']]'), b: subj }; rows.push(last); continue;
    }
    if (last && /^[a-zäöüàâçéèêëîïôûùÿñ(,]/.test(line)) { if (last.type === 'cloze') last.a += ' ' + line; else last.b = (last.b + ' ' + line).trim(); continue; }
    unused++;
  }
  const out = rows.filter(r => r.a && (r.b || r.type === 'qa')).map(r => rowConf({ example: '', ...r }));
  return { rows: out, unused };
}
export function linesText(wordsArr: OcrWord[], tessLines?: OcrWord[][] | null): string {
  const ws = (wordsArr || []).filter(w => w && w.text && w.text.trim());
  if (!ws.length) return '';
  const { lines } = groupLines(ws, tessLines);
  const charW = median(ws.map(w => (w.x1 - w.x0) / Math.max(1, w.text.length))) || 8;
  return lines.map(l => lineText(l.words, charW)).join('\n');
}
