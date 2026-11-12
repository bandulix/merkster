/* "Erklär's mir anders". A short second explanation. Style only, same safety as Merki. */
import { validateLine } from './merki';

export const EXPLAIN_STYLES = ['example', 'mnemonic', 'steps', 'sketch'] as const;
export type ExplainStyle = (typeof EXPLAIN_STYLES)[number];

export function isStyle(v: unknown): v is ExplainStyle {
  return (EXPLAIN_STYLES as readonly string[]).includes(String(v));
}

export function explainKey(term: string, meaning: string, style: ExplainStyle, band: string): string {
  const raw = `${band}|${style}|${term.trim().toLowerCase()}|${meaning.trim().toLowerCase()}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < raw.length; i++) { h ^= raw.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(36);
}

export interface SketchStep { label: string }

/** A sketch is a few short labels. Anything else becomes plain text. */
export function parseSketch(text: string): SketchStep[] | null {
  const lines = text.split(/\n|→|->|\|/).map(s => s.replace(/^[\d.)\-\s]+/, '').trim()).filter(s => s.length > 1 && s.length < 80);
  if (lines.length < 2 || lines.length > 5) return null;
  if (lines.some(l => /https?:|www\./i.test(l))) return null;
  return lines.map(label => ({ label }));
}

export function fallbackExplain(style: ExplainStyle, term: string, meaning: string, lang: 'de' | 'en'): { text: string; sketch: SketchStep[] | null } {
  const a = term.trim().slice(0, 80);
  const b = meaning.trim().slice(0, 120);
  const packs = {
    de: {
      example: `${a} siehst du zum Beispiel so: ${b}.`,
      mnemonic: `Merk dir ${a} an dem Bild: ${b}.`,
      steps: `1. Lies ${a}.\n2. Denk an ${b}.\n3. Sag es in einem Satz.`,
      sketch: `${a} → ${b}`
    },
    en: {
      example: `You meet ${a} like this: ${b}.`,
      mnemonic: `Picture ${a} as ${b}.`,
      steps: `1. Read ${a}.\n2. Remember ${b}.\n3. Say it in one sentence.`,
      sketch: `${a} → ${b}`
    }
  };
  const text = packs[lang][style];
  const safe = validateLine(text.replace(/\n/g, ' ')) || (lang === 'de' ? `${a}: ${b}.` : `${a}: ${b}.`);
  return { text: style === 'steps' || style === 'sketch' ? text : safe, sketch: style === 'sketch' ? parseSketch(text) : null };
}

/** Drop a model reply that shames, links, or runs long. */
export function acceptExplain(text: unknown, style: ExplainStyle): { text: string; sketch: SketchStep[] | null } | null {
  if (typeof text !== 'string') return null;
  const raw = text.replace(/\s+\n/g, '\n').trim();
  if (raw.length < 2 || raw.length > 400) return null;
  if (/https?:\/\/|www\.|dumm|idiot|stupid|du musst|you must/i.test(raw)) return null;
  if (style === 'sketch') {
    const sketch = parseSketch(raw);
    if (!sketch) return null;
    return { text: raw, sketch };
  }
  if (style === 'steps') {
    const parts = raw.split(/[.!?\n]+/).filter(s => s.trim());
    if (parts.length < 1 || parts.length > 4) return null;
    return { text: raw, sketch: null };
  }
  const flat = raw.replace(/\s+/g, ' ');
  const ok = validateLine(flat);
  if (!ok) return null;
  return { text: ok, sketch: null };
}
