import { describe, expect, it } from 'vitest';
import type { AppData, SyncResponse, WireCard, WireTest } from '../../../../shared/types';
import { applyRemote, diff, emptySyncState, entities, hashes, settle } from '../syncCore';
import { freshState } from '../schedule';

const base = (): AppData => ({ v: 2, settings: { uiLang: 'en', theme: 'auto', sessionSize: 15, tts: true, onboarded: true, grading: 'de_grade', sound: false, ackLevel: 1, ackBadges: [] }, streak: { count: 0, best: 0, lastDay: null }, stats: { sessions: 0, answers: 0, firstTry: 0, ms: 0 }, history: [], tests: [] });
const withTest = (): AppData => {
  const d = base();
  d.tests.push({ id: 'test01', name: 'Bio', subject: 'biology', foreign: null, native: 'de', created: '2026-10-08', testDate: '2026-10-20', format: 'mixed', articles: false, days: [],
    items: [{ id: 'card01', type: 'qa', term: 'Q1?', meaning: 'A1', example: '', st: freshState() }, { id: 'card02', type: 'pair', term: 'T2', meaning: 'D2', example: '', st: freshState() }] });
  return d;
};
/** a tiny in-memory LWW server, enough to exercise the client protocol */
function fakeServer() {
  let rev = 0; const tests = new Map<string, WireTest & { rev: number }>(), cards = new Map<string, WireCard & { rev: number }>();
  return (req: ReturnType<typeof diff>['req']): SyncResponse => {
    for (const t of req.push.tests || []) { const cur = tests.get(t.id); if (!cur || cur.updatedAt <= t.updatedAt) { tests.set(t.id, { ...(cur || {}), ...t, rev: ++rev }); if (t.deleted) for (const c of cards.values()) if (c.testId === t.id) Object.assign(c, { deleted: true, rev: ++rev }); } }
    for (const c of req.push.cards || []) { const cur = cards.get(c.id); if (!tests.get(c.testId) || tests.get(c.testId)!.deleted) continue; if (!cur || cur.updatedAt <= c.updatedAt) cards.set(c.id, { ...(cur || {}), ...c, rev: ++rev }); }
    const since = req.since;
    return { rev, profile: null, sessions: [], tests: [...tests.values()].filter(t => t.rev > since && (since > 0 || !t.deleted)), cards: [...cards.values()].filter(c => c.rev > since && (since > 0 || !c.deleted)) };
  };
}
function round(d: AppData, st: ReturnType<typeof emptySyncState>, server: ReturnType<typeof fakeServer>, at: number) {
  const { req, snapshot, pushed, tombstones } = diff(d, st, at);
  const res = server(req);
  const cur = hashes(entities(d)); const changed = (k: string) => cur[k] !== snapshot[k];
  applyRemote(d, res, changed);
  return { st: settle(st, d, res, snapshot, pushed, tombstones, changed), req };
}

describe('sync protocol', () => {
  it('pushes new tests and cards, then nothing when unchanged', () => {
    const server = fakeServer(); const d = withTest();
    let r = round(d, emptySyncState(), server, 1);
    expect(r.req.push.tests?.length).toBe(1); expect(r.req.push.cards?.length).toBe(2);
    r = round(d, r.st, server, 2);
    expect(r.req.push.tests).toBeUndefined(); expect(r.req.push.cards).toBeUndefined();
  });
  it('a second device receives everything and later edits flow both ways', () => {
    const server = fakeServer(); const a = withTest(); const b = base();
    let sa = round(a, emptySyncState(), server, 1).st;
    let sb = round(b, emptySyncState(), server, 2).st;
    expect(b.tests[0].items.map(i => i.term)).toEqual(['Q1?', 'T2']);
    b.tests[0].items[0].st.sessions = 1; b.tests[0].items[0].st.introduced = true; // practised on B
    sb = round(b, sb, server, 3).st;
    sa = round(a, sa, server, 4).st;
    expect(a.tests[0].items[0].st.sessions).toBe(1);
    // nothing left to push on either side
    expect(diff(a, sa, 5).req.push.cards).toBeUndefined();
    expect(diff(b, sb, 5).req.push.cards).toBeUndefined();
  });
  it('deleting a card or a whole test propagates as tombstones', () => {
    const server = fakeServer(); const a = withTest(); const b = base();
    let sa = round(a, emptySyncState(), server, 1).st; let sb = round(b, emptySyncState(), server, 2).st;
    a.tests[0].items.splice(1, 1);
    const r = round(a, sa, server, 3); sa = r.st;
    expect(r.req.push.cards?.[0]).toMatchObject({ id: 'card02', deleted: true });
    sb = round(b, sb, server, 4).st;
    expect(b.tests[0].items.map(i => i.id)).toEqual(['card01']);
    a.tests = [];
    const r2 = round(a, sa, server, 5);
    expect(r2.req.push.tests?.[0]).toMatchObject({ id: 'test01', deleted: true });
    expect(r2.req.push.cards).toBeUndefined();
    round(b, sb, server, 6);
    expect(b.tests).toEqual([]);
  });
  it('local edits made while a request is in flight are not overwritten', () => {
    const d = withTest(); const st = emptySyncState();
    const { snapshot } = diff(d, st, 1);
    d.tests[0].items[0].meaning = 'edited during flight';
    const cur = hashes(entities(d));
    applyRemote(d, { rev: 9, profile: null, sessions: [], tests: [], cards: [{ id: 'card01', testId: 'test01', position: 0, type: 'qa', term: 'Q1?', meaning: 'server value', example: '', distractors: [], st: freshState(), updatedAt: 1 }] }, k => cur[k] !== snapshot[k]);
    expect(d.tests[0].items[0].meaning).toBe('edited during flight');
  });
});
