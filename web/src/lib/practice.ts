/* Practice session engine (successive relearning: every card must be recalled correctly once per session).
   DOM-free: the React SessionView renders whatever `current()` returns. */
import type { Card, Lang, Test } from '../../../shared/types';
import { LANGS, langName, t } from '../i18n';
import { containsTerm, stripArticle, stripPlural } from './check';
import * as S from './schedule';
import { isLong } from './util';
import { IDLE_MS } from '../../../shared/gamification';

export type Kind = 'study' | 'meaning' | 'produce' | 'qa' | 'forward' | 'backward' | 'cloze' | 'cloze-ex' | 'mc' | 'match' | 'sentence';
export interface QCard { kind: Kind; key?: string; keys?: string[]; almost?: number }
export interface ItemRun { testId: string; itemId: string; struggled: boolean; met: boolean; morning: boolean; isNew: boolean; tries: number }
export interface Spec { prompt?: string; pLang?: Lang | null; speakP?: boolean; ask: string; answer: string; aLang: Lang; strict: boolean; articles?: boolean; chip?: string; self?: boolean; cloze?: string; hint?: string }
export interface Summary { done: number; total: number; firstTry: number; ms: number; activeMs: number; correct: number; tests: string[]; sessionId?: string; xpBefore?: number; xpAfter?: number; levelBefore?: number; levelAfter?: number }

export function taskFor(test: Test, item: Card, e: { morning?: boolean }): Kind {
  const type = item.type || 'pair', f = test.format, lang = test.subject === 'languages', n = item.st?.sessions || 0;
  if (type === 'cloze') return 'cloze';
  if (type === 'mc') return f === 'written' ? 'qa' : 'mc';
  if (type === 'qa') return f === 'mc' ? 'mc' : 'qa';
  if (e.morning) return lang ? (['mc', 'match', 'meaning'].includes(f) ? 'meaning' : 'produce') : 'backward';
  if (lang) {
    switch (f) {
      case 'meaning': return 'meaning';
      case 'produce': return 'produce';
      case 'mc': return 'mc';
      case 'match': return 'match';
      case 'cloze': return item.example && containsTerm(item.example, item.term, test.foreign || undefined) ? 'cloze-ex' : 'produce';
      case 'sentence': return n >= 1 ? 'sentence' : 'meaning';
      default: return n % 2 === 0 ? 'meaning' : 'produce';
    }
  }
  if (f === 'mc') return 'mc';
  if (f === 'cloze') return 'backward';
  return n % 2 === 0 ? 'forward' : 'backward';
}
export function distractors(test: Test, item: Card): string[] {
  if (item.distractors?.length) return item.distractors.slice(0, 3);
  const ans = item.meaning, a0 = ans.trim().toLowerCase()[0];
  const score = (i: Card) => (i.meaning.trim().toLowerCase()[0] === a0 ? 2 : 0) - Math.abs(i.meaning.length - ans.length) / 10 + Math.random() * 0.8;
  const pool = test.items.filter(i => i.id !== item.id && (i.type || 'pair') === (item.type || 'pair') && i.meaning.trim().toLowerCase() !== ans.trim().toLowerCase());
  pool.sort((x, y) => score(y) - score(x));
  return [...new Set(pool.map(i => i.meaning))].slice(0, 3);
}
export const shuffle = <T,>(a: T[]): T[] => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

export type Mark = 'ok' | 'bad' | 'study' | 'open';
export class Practice {
  queue: QCard[] = []; pos = 0; items: Record<string, ItemRun> = {}; total = 0; done = 0; firstTry = 0; answers = 0;
  /** one mark per queue card: correct, missed, study preview, or not yet played */
  outcomes: Mark[] = [];
  tests = new Set<string>(); startedAt: number;
  /** active practice time: gaps longer than IDLE_MS (90 s) between interactions don't count – no idle farming */
  activeMs = 0; correct = 0; private lastTouch: number;
  touch(ts: number) { const d = ts - this.lastTouch; if (d > 0 && d <= IDLE_MS) this.activeMs += d; this.lastTouch = ts; }
  constructor(private getTest: (id: string) => Test | undefined, entries: S.SessionEntry[], nowTs: number, private onMeet: (test: Test, item: Card, struggled: boolean) => void) {
    this.startedAt = nowTs; this.lastTouch = nowTs;
    const deferred: { at: number; card: QCard }[] = [], boards: Record<string, string[]> = {};
    const flush = (all: boolean) => { for (let k = 0; k < deferred.length; k++) if (all || deferred[k].at <= this.queue.length) { this.queue.push(deferred[k].card); this.outcomes.push('open'); deferred.splice(k--, 1); } };
    const push = (c: QCard) => { this.queue.push(c); this.outcomes.push('open'); flush(false); };
    for (const e of entries) {
      const test = getTest(e.testId); const item = test?.items.find(i => i.id === e.itemId);
      if (!test || !item) continue;
      const key = e.testId + ':' + e.itemId;
      this.items[key] = { testId: e.testId, itemId: e.itemId, struggled: false, met: false, morning: !!e.morning, isNew: !!e.isNew, tries: 0 };
      this.total++; this.tests.add(e.testId);
      let task = taskFor(test, item, e);
      if (task === 'mc' && distractors(test, item).length < 1) task = test.subject === 'languages' ? 'meaning' : item.type === 'pair' ? 'forward' : 'qa';
      if (e.isNew) { S.introduce(item, nowTs); push({ kind: 'study', key }); }
      if (task === 'match') { (boards[e.testId] = boards[e.testId] || []).push(key); if (boards[e.testId].length === 5) { push({ kind: 'match', keys: boards[e.testId] }); boards[e.testId] = []; } continue; }
      const card: QCard = { kind: task, key };
      if (e.isNew) deferred.push({ at: this.queue.length + 2, card }); else push(card);
    }
    flush(true);
    for (const id in boards) {
      const ks = boards[id];
      if (ks.length >= 3) push({ kind: 'match', keys: ks }); else ks.forEach(k => push({ kind: 'meaning', key: k }));
    }
  }
  ctx(key: string) { const it = this.items[key]; const test = this.getTest(it.testId)!; return { it, test, item: test.items.find(i => i.id === it.itemId)! }; }
  private cardDone(c: QCard) { if (c.kind === 'study') return false; if (c.kind === 'match') return c.keys!.every(k => this.items[k].met); return this.items[c.key!].met; }
  /** move to the next card that still needs work; null = session finished */
  current(): QCard | null {
    while (this.pos < this.queue.length && this.cardDone(this.queue[this.pos])) {
      if (this.outcomes[this.pos] === 'open') this.outcomes[this.pos] = 'ok';
      this.pos++;
    }
    return this.pos < this.queue.length ? this.queue[this.pos] : null;
  }
  next() {
    const c = this.queue[this.pos];
    if (c?.kind === 'study' && this.outcomes[this.pos] === 'open') this.outcomes[this.pos] = 'study';
    this.pos++;
    return this.current();
  }
  meet(key: string) {
    const it = this.items[key]; if (it.met) return;
    it.met = true; this.done++;
    const { test, item } = this.ctx(key);
    this.onMeet(test, item, it.struggled);
  }
  /** record an answer; wrong answers come back 3 cards later (except on test morning: written once) */
  answered(key: string, ok: boolean) {
    const it = this.items[key]; it.tries++; this.answers++;
    if (this.pos < this.outcomes.length) this.outcomes[this.pos] = ok ? 'ok' : 'bad';
    if (ok) { this.correct++; if (it.tries === 1 && !it.struggled) this.firstTry++; this.meet(key); }
    else { it.struggled = true; if (it.morning) this.meet(key); else this.requeue(); }
  }
  requeue() {
    const c = { ...this.queue[this.pos], almost: 0 };
    const at = Math.min(this.pos + 3, this.queue.length);
    this.queue.splice(at, 0, c);
    this.outcomes.splice(at, 0, 'open');
  }
  /** "I was right" – undo the requeue + struggle caused by the last answer */
  override(key: string) {
    const card = this.queue[this.pos], it = this.items[key];
    const idx = this.queue.findIndex((c, i) => i > this.pos && c.key === key && c.kind === card.kind);
    if (idx > 0) { this.queue.splice(idx, 1); this.outcomes.splice(idx, 1); }
    if (this.outcomes[this.pos] !== undefined) this.outcomes[this.pos] = 'ok';
    if (it.tries === 1) { it.struggled = false; this.firstTry++; }
    this.correct++;
    this.meet(key);
  }
  matchDone(keys: string[]) {
    if (this.pos < this.outcomes.length) this.outcomes[this.pos] = 'ok';
    keys.forEach(k => { const it = this.items[k]; it.tries++; this.correct++; if (!it.struggled) this.firstTry++; this.meet(k); });
  }
  summary(nowTs: number): Summary { this.touch(nowTs); return { done: this.done, total: this.total, firstTry: this.firstTry, ms: nowTs - this.startedAt, activeMs: Math.round(this.activeMs), correct: this.correct, tests: [...this.tests] }; }

  spec(card: QCard): Spec | null {
    const { test, item } = this.ctx(card.key!), lang = test.subject === 'languages';
    const langOf = (side: 'term' | 'meaning'): Lang => (lang ? (side === 'term' ? test.foreign! : test.native) : test.native);
    switch (card.kind) {
      case 'meaning': return { prompt: item.term, pLang: langOf('term'), speakP: true, ask: t('ask_meaning'), answer: item.meaning, aLang: langOf('meaning'), strict: false };
      case 'produce': return { prompt: item.meaning, pLang: langOf('meaning'), ask: t('ask_produce', { lang: langName(test.foreign) }), answer: item.term, aLang: test.foreign!, strict: true, articles: test.articles, chip: t('spelling_counts') };
      case 'qa': return { prompt: item.term, pLang: test.native, ask: t('ask_answer'), answer: item.meaning, aLang: test.native, strict: false, self: isLong(item.meaning) };
      case 'forward': return { prompt: item.term, pLang: test.native, ask: t('ask_explain'), answer: item.meaning, aLang: test.native, strict: false, self: isLong(item.meaning) };
      case 'backward': return { prompt: item.meaning, pLang: test.native, ask: t('ask_term'), answer: item.term, aLang: test.native, strict: false, self: isLong(item.term) };
      case 'cloze': return { cloze: item.term, ask: t('ask_gap'), answer: item.meaning, aLang: lang ? test.foreign! : test.native, strict: lang, articles: false };
      case 'cloze-ex': {
        const core = stripArticle(stripPlural(item.term), test.foreign || undefined);
        const re = new RegExp(core.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        const ex = re.test(item.example) ? item.example.replace(re, m => `[[${m}]]`) : item.example + ' [[' + core + ']]';
        const m = ex.match(/\[\[(.+?)\]\]/);
        return { cloze: ex, ask: t('ask_gap'), hint: item.meaning, answer: m ? m[1] : core, aLang: test.foreign!, strict: true };
      }
    }
    return null;
  }
  /** special characters keyboard for the answer language */
  chars(test: Test, strict: boolean) { const l = test.subject === 'languages' && strict ? test.foreign : test.native; return (l && LANGS[l]?.chars) || ''; }
}
