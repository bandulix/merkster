/* Background sync runner: debounced push/pull against POST /api/sync, retries with backoff, resumes when online. */
import type { SyncResponse } from '../../../shared/types';
import { api, ApiError } from './api';
import { idbGet, idbSet } from './idb';
import { store } from './store';
import { applyRemote, diff, emptySyncState, entities, hashes, settle, type SyncState } from './syncCore';

export type SyncStatus = 'idle' | 'pending' | 'ok' | 'offline' | 'error';
let state: SyncState = emptySyncState();
let status: SyncStatus = 'idle', lastOk = 0;
let timer: ReturnType<typeof setTimeout> | null = null, running = false, again = false, backoff = 0;
const listeners = new Set<() => void>();
let onUnauthorized: (() => void) | null = null;

const setStatus = (s: SyncStatus) => { status = s; listeners.forEach(f => f()); };
export const syncStatus = { get: () => status, lastOk: () => lastOk, sub: (f: () => void) => { listeners.add(f); return () => { listeners.delete(f); }; } };

export async function startSync(userId: string, unauthorized: () => void) {
  onUnauthorized = unauthorized;
  state = (await idbGet<SyncState>(`sync:${userId}`).catch(() => undefined)) || emptySyncState();
  store.onChange = () => scheduleSync(1200);
  if (typeof window !== 'undefined') {
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisibility);
  }
  await runSync();
}
export function stopSync() {
  store.onChange = null; if (timer) clearTimeout(timer); timer = null;
  window.removeEventListener('online', onOnline); document.removeEventListener('visibilitychange', onVisibility);
  state = emptySyncState(); setStatus('idle');
}
const onOnline = () => scheduleSync(200);
const onVisibility = () => { if (document.visibilityState === 'hidden') void runSync(); else scheduleSync(500); };

export function scheduleSync(ms = 1200) {
  if (status !== 'offline') setStatus('pending');
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => { timer = null; void runSync(); }, ms);
}
export async function runSync(): Promise<boolean> {
  const uid = store.userId; if (!uid) return false;
  if (running) { again = true; return false; }
  running = true;
  try {
    const startedAt = Date.now();
    const { req, snapshot, pushed, tombstones } = diff(store.data, state, startedAt);
    const res = await api<SyncResponse>('/api/sync', { body: req, keepalive: document.visibilityState === 'hidden' && JSON.stringify(req).length < 60000 });
    if (store.userId !== uid) return false; // logged out meanwhile
    const cur = hashes(entities(store.data));
    const changed = (k: string) => cur[k] !== snapshot[k];
    const n = applyRemote(store.data, res, changed);
    state = settle(state, store.data, res, snapshot, pushed, tombstones, changed);
    // data first, bookkeeping second: if the page dies in between, the next round simply re-pulls
    if (n) store.commit(undefined, { sync: false });
    await store.flush();
    await idbSet(`sync:${uid}`, state);
    backoff = 0; lastOk = Date.now(); setStatus('ok');
    return true;
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) { setStatus('error'); onUnauthorized?.(); return false; }
    const offline = e instanceof ApiError && e.status === 0;
    setStatus(offline ? 'offline' : 'error');
    backoff = Math.min(120000, backoff ? backoff * 2 : 5000);
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { timer = null; void runSync(); }, backoff);
    return false;
  } finally {
    running = false;
    if (again) { again = false; scheduleSync(300); }
  }
}
/** forget local sync bookkeeping (e.g. after "delete all data") */
export async function resetSyncState() { state = { ...emptySyncState(), rev: state.rev }; if (store.userId) await idbSet(`sync:${store.userId}`, state); }
