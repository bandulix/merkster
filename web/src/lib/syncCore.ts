/* Pure sync logic (unit-tested): turn local AppData into wire entities, compute what changed since the
   last successful sync (content hashes), and merge a server response back into AppData. */
import type { AppData, Card, SyncRequest, SyncResponse, Test, WireCard, WireProfile, WireSession, WireTest } from '../../../shared/types';
import { freshState } from './schedule';

export interface SyncState { rev: number; hashes: Record<string, string>; cardTest: Record<string, string>; }
export const emptySyncState = (): SyncState => ({ rev: 0, hashes: {}, cardTest: {} });

export function fnv(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(36) + ':' + s.length.toString(36);
}
type Ent = { key: string; kind: 't' | 'c' | 's' | 'p'; payload: Record<string, unknown> };

const wireTest = (t: Test): Omit<WireTest, 'updatedAt'> => ({ id: t.id, name: t.name, subject: t.subject, foreign: t.foreign, native: t.native, testDate: t.testDate, format: t.format, articles: !!t.articles, created: t.created || null, days: t.days || [], result: t.result || null, resultSkipped: !!t.resultSkipped, grading: t.grading || null });
const wireCard = (c: Card, testId: string, position: number): Omit<WireCard, 'updatedAt'> => ({ id: c.id, testId, position, type: c.type || 'pair', term: c.term, meaning: c.meaning, example: c.example || '', distractors: c.distractors || [], st: c.st });
const wireProfile = (d: AppData): WireProfile['data'] => ({ settings: d.settings, streak: d.streak, stats: d.stats });

export function entities(d: AppData): Map<string, Ent> {
  const m = new Map<string, Ent>();
  m.set('p', { key: 'p', kind: 'p', payload: wireProfile(d) as Record<string, unknown> });
  for (const t of d.tests) {
    m.set('t:' + t.id, { key: 't:' + t.id, kind: 't', payload: wireTest(t) as unknown as Record<string, unknown> });
    t.items.forEach((c, i) => m.set('c:' + c.id, { key: 'c:' + c.id, kind: 'c', payload: wireCard(c, t.id, i) as unknown as Record<string, unknown> }));
  }
  for (const h of d.history) if (h.id) m.set('s:' + h.id, { key: 's:' + h.id, kind: 's', payload: { id: h.id, day: h.day, n: h.n, firstTry: h.firstTry, ms: h.ms, tests: h.tests || [], at: h.at ?? null, correct: h.correct ?? h.n, activeMs: h.activeMs ?? h.ms } });
  return m;
}
export const hashes = (ents: Map<string, Ent>) => { const o: Record<string, string> = {}; for (const [k, e] of ents) o[k] = fnv(JSON.stringify(e.payload)); return o; };

/** build the push payload; `snapshot` = hashes at push time (needed to finish the sync) */
export function diff(d: AppData, st: SyncState, at: number): { req: SyncRequest; snapshot: Record<string, string>; pushed: string[]; tombstones: string[] } {
  const ents = entities(d), snap = hashes(ents);
  const push: Required<SyncRequest['push']> = { tests: [], cards: [], sessions: [], profile: undefined as unknown as WireProfile };
  const pushed: string[] = [], tombstones: string[] = [];
  for (const [k, e] of ents) {
    if (st.hashes[k] === snap[k]) continue;
    if (e.kind === 's' && st.hashes[k]) continue; // sessions are immutable
    pushed.push(k);
    if (e.kind === 't') push.tests.push({ ...(e.payload as unknown as WireTest), updatedAt: at });
    else if (e.kind === 'c') push.cards.push({ ...(e.payload as unknown as WireCard), updatedAt: at });
    else if (e.kind === 's') push.sessions.push(e.payload as unknown as WireSession);
    else if (e.kind === 'p' && (st.rev > 0 || st.hashes.p || d.settings.onboarded || d.history.length)) push.profile = { data: e.payload as WireProfile['data'], updatedAt: at };
  }
  // deletions: known to the server (in hashes) but gone locally. Tests first, so cards of a deleted test
  // don't need their own tombstones (the server soft-deletes them with the test).
  const gone = Object.keys(st.hashes).filter(k => !ents.has(k));
  const deletedTests = new Set(gone.filter(k => k.startsWith('t:')).map(k => k.slice(2)));
  for (const id of deletedTests) { push.tests.push({ id, deleted: true, updatedAt: at } as WireTest); tombstones.push('t:' + id); }
  for (const k of gone) {
    if (!k.startsWith('c:')) continue;
    const testId = st.cardTest[k.slice(2)];
    tombstones.push(k);
    if (!testId || deletedTests.has(testId)) continue;
    push.cards.push({ id: k.slice(2), testId, deleted: true, updatedAt: at } as WireCard);
  }
  const req: SyncRequest = { since: st.rev, push: {} };
  if (push.tests.length) req.push.tests = push.tests;
  if (push.cards.length) req.push.cards = push.cards;
  if (push.sessions.length) req.push.sessions = push.sessions;
  if (push.profile) req.push.profile = push.profile;
  return { req, snapshot: snap, pushed, tombstones };
}

/** Tests the server refused (over the 24h cap) leave this device and are not marked synced. */
export function dropRejected(d: AppData, rejected: string[] | undefined, pushed: string[]): string[] {
  if (!rejected?.length) return pushed;
  const drop = new Set(rejected);
  const keys = new Set<string>([...drop].map(id => 't:' + id));
  for (const t of d.tests) {
    if (!drop.has(t.id)) continue;
    for (const c of t.items) keys.add('c:' + c.id);
  }
  d.tests = d.tests.filter(t => !drop.has(t.id));
  return pushed.filter(k => !keys.has(k));
}

/** merge server rows into local data. Entities changed locally while the request was in flight are skipped
 *  (they will be pushed next round, and the newer write wins on the server). */
export function applyRemote(d: AppData, res: SyncResponse, changedLocally: (key: string) => boolean): number {
  let n = 0;
  if (res.profile && !changedLocally('p')) {
    const p = res.profile.data || {};
    if (p.settings) d.settings = { ...d.settings, ...p.settings };
    if (p.streak) d.streak = { ...d.streak, ...p.streak };
    if (p.stats) d.stats = { ...d.stats, ...p.stats };
    n++;
  }
  for (const w of res.tests) {
    if (changedLocally('t:' + w.id)) continue;
    const i = d.tests.findIndex(x => x.id === w.id);
    if (w.deleted) { if (i >= 0) { d.tests.splice(i, 1); n++; } continue; }
    const base = { id: w.id, name: w.name, subject: w.subject, foreign: w.foreign, native: w.native, testDate: w.testDate, format: w.format, articles: w.articles, created: w.created || w.testDate, days: w.days || [], result: w.result || null, resultSkipped: !!w.resultSkipped, grading: w.grading || null };
    if (i >= 0) Object.assign(d.tests[i], base); else d.tests.push({ ...base, items: [] });
    if (w.serverCreatedAt) d.tests[i >= 0 ? i : d.tests.length - 1].createdAt = w.serverCreatedAt;
    n++;
  }
  const sorted = [...res.cards].sort((a, b) => a.position - b.position);
  for (const w of sorted) {
    if (changedLocally('c:' + w.id)) continue;
    const owner = d.tests.find(x => x.id === w.testId);
    // the card may live in another test locally (moved) – remove it there first
    for (const x of d.tests) { const j = x.items.findIndex(c => c.id === w.id); if (j >= 0 && (x !== owner || w.deleted)) { x.items.splice(j, 1); n++; } }
    if (w.deleted || !owner) continue;
    const card: Card = { id: w.id, type: w.type, term: w.term, meaning: w.meaning, example: w.example || '', distractors: w.distractors?.length ? w.distractors : undefined, st: { ...freshState(), ...w.st } };
    const j = owner.items.findIndex(c => c.id === w.id);
    if (j >= 0) owner.items[j] = card; else owner.items.splice(Math.min(w.position, owner.items.length), 0, card);
    n++;
  }
  for (const w of res.sessions) if (!d.history.some(h => h.id === w.id)) { d.history.push({ id: w.id, day: w.day, n: w.n, firstTry: w.firstTry, ms: w.ms, tests: w.tests, at: w.at ?? undefined, correct: w.correct, activeMs: w.activeMs }); n++; }
  d.history.sort((a, b) => a.day.localeCompare(b.day) || (a.at || 0) - (b.at || 0));
  if (d.history.length > 2000) d.history = d.history.slice(-2000);
  return n;
}

/** after a successful round: remember what the server now has */
export function settle(st: SyncState, d: AppData, res: SyncResponse, snapshot: Record<string, string>, pushed: string[], tombstones: string[], changedLocally: (k: string) => boolean): SyncState {
  const next: SyncState = { rev: Math.max(st.rev, res.rev), hashes: { ...st.hashes }, cardTest: { ...st.cardTest } };
  for (const k of tombstones) { delete next.hashes[k]; if (k.startsWith('c:')) delete next.cardTest[k.slice(2)]; }
  for (const k of pushed) next.hashes[k] = snapshot[k];
  const now = hashes(entities(d));
  const remoteKeys = ['p', ...res.tests.map(x => 't:' + x.id), ...res.cards.map(x => 'c:' + x.id), ...res.sessions.map(x => 's:' + x.id)];
  for (const k of remoteKeys) {
    if (changedLocally(k)) continue;
    if (now[k]) next.hashes[k] = now[k]; else delete next.hashes[k];
  }
  for (const tst of d.tests) for (const c of tst.items) if (next.hashes['c:' + c.id]) next.cardTest[c.id] = tst.id;
  // drop bookkeeping for cards whose test is gone on both sides
  for (const id of Object.keys(next.cardTest)) if (!next.hashes['c:' + id]) delete next.cardTest[id];
  return next;
}
