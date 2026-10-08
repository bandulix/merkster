/* Local, offline-first data store for the logged-in user. Source of truth on the device; mirrored to
   IndexedDB on every change and synced to the server in the background (see sync.ts). */
import type { AppData, Card, CardType, DraftRow, HistoryEntry, Settings, Test } from '../../../shared/types';
import { APP_SLUG } from '../../../shared/brand';
import { setUiLang } from '../i18n';
import { idbDel, idbGet, idbSet } from './idb';
import * as S from './schedule';
import { now, uid } from './util';
import { computeProgress, type CardLite, type CheerLite, type Progress } from '../../../shared/gamification';

const isDe = () => typeof navigator !== 'undefined' && (navigator.language || '').toLowerCase().startsWith('de');
export const defaults = (): AppData => ({
  v: 2,
  settings: { uiLang: isDe() ? 'de' : 'en', theme: 'auto', sessionSize: 15, tts: true, onboarded: false, grading: isDe() ? 'de_grade' : 'percent', sound: false, ackLevel: 1, ackBadges: [], termStarts: [8, 2] },
  streak: { count: 0, best: 0, lastDay: null },
  stats: { sessions: 0, answers: 0, firstTry: 0, ms: 0 },
  history: [],
  tests: []
});
export function normalize(raw: unknown): AppData {
  const d = (raw && typeof raw === 'object' ? raw : {}) as Partial<AppData>;
  const def = defaults();
  const out: AppData = {
    v: 2,
    settings: { ...def.settings, ...(d.settings || {}) } as Settings,
    streak: { ...def.streak, ...(d.streak || {}) },
    stats: { ...def.stats, ...(d.stats || {}) },
    history: (d.history || []).map(h => ({ ...h, id: h.id || uid() })),
    tests: Array.isArray(d.tests) ? d.tests : []
  };
  delete (out.settings as unknown as Record<string, unknown>).ai; // v0 stored an API key here – never keep it
  for (const t of out.tests) { t.items = (t.items || []).map(c => ({ ...c, type: c.type || 'pair', st: c.st || S.freshState() })); t.days = t.days || []; t.subject = t.subject || 'languages'; }
  return out;
}

type Listener = () => void;
class Store {
  data: AppData = defaults();
  userId: string | null = null;
  version = 0;
  private listeners = new Set<Listener>();
  private writing: Promise<void> | null = null;
  private dirty = false;
  onChange: (() => void) | null = null; // set by sync.ts
  /** cheers received from supporters (server-side data, cached per user for offline use) – feeds XP / Fan-club badge */
  cheers: CheerLite[] = [];
  /** confirmed report cards (server-side), reduced for progression */
  cards: CardLite[] = [];

  subscribe = (f: Listener) => { this.listeners.add(f); return () => { this.listeners.delete(f); }; };
  getVersion = () => this.version;
  private emit() { this.version++; setUiLang(this.data.settings.uiLang); this.listeners.forEach(f => f()); }

  async open(userId: string) {
    this.userId = userId;
    this.data = normalize(await idbGet(`data:${userId}`).catch(() => undefined));
    try { this.cheers = JSON.parse(localStorage.getItem(`${APP_SLUG}.cheers.${userId}`) || '[]'); } catch { this.cheers = []; }
    try { this.cards = JSON.parse(localStorage.getItem(`${APP_SLUG}.cards.${userId}`) || '[]'); } catch { this.cards = []; }
    this.emit();
  }
  close() { this.userId = null; this.data = defaults(); this.cheers = []; this.cards = []; this.emit(); }
  setCards(list: CardLite[]) {
    const key = JSON.stringify(list);
    if (key === JSON.stringify(this.cards)) return;
    this.cards = list; if (this.userId) localStorage.setItem(`${APP_SLUG}.cards.${this.userId}`, key);
    this.emit();
  }
  setCheers(list: CheerLite[]) {
    const key = JSON.stringify(list);
    if (key === JSON.stringify(this.cheers)) return;
    this.cheers = list; if (this.userId) localStorage.setItem(`${APP_SLUG}.cheers.${this.userId}`, key);
    this.emit();
  }

  /** apply a change: notify UI, persist to IndexedDB, schedule a background sync */
  commit(mutate?: (d: AppData) => void, opts: { sync?: boolean } = {}) {
    if (mutate) mutate(this.data);
    this.emit();
    void this.persist();
    if (opts.sync !== false) this.onChange?.();
  }
  /** wait until pending IndexedDB writes are done */
  async flush() { while (this.writing) await this.writing; }
  async persist() {
    if (!this.userId) return;
    if (this.writing) { this.dirty = true; return this.writing; }
    const key = `data:${this.userId}`;
    this.writing = (async () => {
      do { this.dirty = false; await idbSet(key, JSON.parse(JSON.stringify(this.data))).catch(e => console.warn('IndexedDB write failed', e)); } while (this.dirty);
      this.writing = null;
    })();
    return this.writing;
  }

  test(id: string | undefined) { return this.data.tests.find(t => t.id === id); }
  createTest(f: Pick<Test, 'name' | 'subject' | 'foreign' | 'native' | 'testDate' | 'format' | 'articles'>): Test {
    const t: Test = { id: uid(), ...f, created: S.dayISO(now()), items: [], days: [] };
    this.commit(d => { d.tests.push(t); });
    return t;
  }
  updateTest(id: string, patch: Partial<Test>) { this.commit(() => { const t = this.test(id); if (t) Object.assign(t, patch); }); }
  deleteTest(id: string) { this.commit(d => { d.tests = d.tests.filter(t => t.id !== id); }); }
  addItems(test: Test, rows: DraftRow[]): number {
    const seen = new Set(test.items.map(i => (i.term + '|' + i.meaning).toLowerCase()));
    let added = 0;
    this.commit(() => {
      for (const r of rows) {
        const type: CardType = ['pair', 'qa', 'cloze', 'mc'].includes(r.type) ? r.type : 'pair';
        let term = (r.a || '').trim(), meaning = (r.b || '').trim();
        if (type === 'cloze') {
          if (!/\[\[(.+?)\]\]/.test(term) && meaning && term.includes(meaning)) term = term.replace(meaning, '[[' + meaning + ']]');
          const m = term.match(/\[\[(.+?)\]\]/); if (!m) continue; meaning = m[1].trim();
        }
        if (!term || !meaning) continue;
        const k = (term + '|' + meaning).toLowerCase();
        if (seen.has(k)) continue;
        seen.add(k);
        const card: Card = { id: uid(), type, term, meaning, example: (r.example || '').trim(), st: S.freshState() };
        if (type === 'mc') card.distractors = (r.distractors || []).filter(Boolean).slice(0, 4);
        test.items.push(card); added++;
      }
    });
    return added;
  }
  updateCard(testId: string, cardId: string, patch: Partial<Card>) { this.commit(() => { const c = this.test(testId)?.items.find(i => i.id === cardId); if (c) Object.assign(c, patch); }); }
  deleteCard(testId: string, cardId: string) { this.commit(() => { const t = this.test(testId); if (t) t.items = t.items.filter(i => i.id !== cardId); }); }
  setSettings(patch: Partial<Settings>) { this.commit(d => { d.settings = { ...d.settings, ...patch }; }); }

  markStreak(ts: number) {
    const today = S.dayISO(ts), s = this.data.streak;
    if (s.lastDay === today) return s;
    s.count = s.lastDay && S.daysBetween(s.lastDay, today) === 1 ? s.count + 1 : 1;
    s.lastDay = today; s.best = Math.max(s.best, s.count);
    return s;
  }
  /** XP, level, streak (with freezes) and badges – derived from history + tests, memoised per data version */
  private prog: { v: number; day: string; p: Progress } | null = null;
  progress(ts = now()): Progress {
    const day = S.dayISO(ts);
    if (!this.prog || this.prog.v !== this.version || this.prog.day !== day) this.prog = { v: this.version, day, p: computeProgress(this.data.history, this.data.tests, ts, this.cheers, this.cards) };
    return this.prog.p;
  }
  liveStreak(ts: number) { return this.progress(ts).streak.current; }
  addHistory(h: Omit<HistoryEntry, 'id'>) { this.data.history.push({ id: uid(), ...h }); if (this.data.history.length > 2000) this.data.history = this.data.history.slice(-2000); }

  exportJSON() { return JSON.stringify({ app: APP_SLUG, exported: new Date().toISOString(), ...this.data }, null, 2); }
  importJSON(text: string) {
    const d = JSON.parse(text);
    if (!d || !Array.isArray(d.tests)) throw new Error('not a backup');
    const keepOnboarded = this.data.settings.onboarded;
    // fresh ids for imported tests/cards so they never collide with existing server rows
    for (const t of d.tests) { t.id = uid(); for (const c of t.items || []) c.id = uid(); }
    const next = normalize(d); next.settings.onboarded = keepOnboarded || next.settings.onboarded;
    this.commit(() => { this.data = next; });
  }
  /** account deleted: forget everything this user had on this device */
  async wipeLocal() { const id = this.userId; await this.writing?.catch(() => undefined); this.close(); if (id) { await idbDel(`data:${id}`).catch(() => undefined); await idbDel(`sync:${id}`).catch(() => undefined); localStorage.removeItem(`${APP_SLUG}.draft.${id}`); localStorage.removeItem(`${APP_SLUG}.cheers.${id}`); localStorage.removeItem(`${APP_SLUG}.cards.${id}`); } }
  resetLocal() { this.commit(() => { this.data = { ...defaults(), settings: { ...this.data.settings } }; }); }

  /* review-screen draft (device-local, per user) */
  private draftKey() { return `${APP_SLUG}.draft.${this.userId}`; }
  getDraft<T>(): T | null { try { return JSON.parse(localStorage.getItem(this.draftKey()) || 'null'); } catch { return null; } }
  setDraft(d: unknown) {
    try { if (d) localStorage.setItem(this.draftKey(), JSON.stringify(d)); else localStorage.removeItem(this.draftKey()); }
    catch { if (d) localStorage.setItem(this.draftKey(), JSON.stringify({ ...(d as object), thumbs: [] })); }
  }
}
export const store = new Store();
