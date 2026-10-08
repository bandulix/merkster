/* React bindings: local store, auth/config (TanStack Query), theme */
import { useEffect, useSyncExternalStore } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { PublicConfig, User } from '../../shared/types';
import { APP_SLUG } from '../../shared/brand';
import { api, ApiError } from './lib/api';
import { store } from './lib/store';
import { syncStatus } from './lib/sync';
import { toastStore } from './lib/util';

/** re-render on every store change; returns the live data object */
export function useStore() { useSyncExternalStore(store.subscribe, store.getVersion); return store.data; }
export const useSyncStatus = () => useSyncExternalStore(syncStatus.sub, syncStatus.get);
export const useToasts = () => useSyncExternalStore(toastStore.sub, toastStore.get);

const CFG_KEY = APP_SLUG + '.config', USER_KEY = APP_SLUG + '.lastUser';
const cached = <T,>(k: string): T | undefined => { try { return JSON.parse(localStorage.getItem(k) || 'null') || undefined; } catch { return undefined; } };

/** public server config (AI on/off, registration…) – cached for offline starts */
export function useConfig() {
  return useQuery({
    queryKey: ['config'],
    queryFn: async () => { try { const c = await api<PublicConfig>('/api/config'); localStorage.setItem(CFG_KEY, JSON.stringify(c)); return c; } catch (e) { const c = cached<PublicConfig>(CFG_KEY); if (c) return c; throw e; } },
    staleTime: 5 * 60_000
  });
}
export type MeState = { user: User | null; offline: boolean };
/** current user; when the server is unreachable we keep working with the last known user (offline-first) */
export function useMe() {
  return useQuery<MeState>({
    queryKey: ['me'],
    queryFn: async () => {
      try { const r = await api<{ user: User }>('/api/me'); localStorage.setItem(USER_KEY, JSON.stringify(r.user)); return { user: r.user, offline: false }; }
      catch (e) {
        if (e instanceof ApiError && e.status === 401) { localStorage.removeItem(USER_KEY); return { user: null, offline: false }; }
        if (e instanceof ApiError && e.status === 0) return { user: cached<User>(USER_KEY) || null, offline: true };
        throw e;
      }
    },
    staleTime: Infinity, retry: 0
  });
}
export const rememberUser = (u: User | null) => { if (u) localStorage.setItem(USER_KEY, JSON.stringify(u)); else localStorage.removeItem(USER_KEY); };

/** light/dark theme from settings (auto = OS) */
export function useTheme(theme: 'auto' | 'light' | 'dark') {
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'auto' && mq.matches);
      document.documentElement.dataset.theme = dark ? 'dark' : 'light';
      document.getElementById('theme-color')?.setAttribute('content', dark ? '#090a14' : '#f4f5ef');
    };
    apply(); mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [theme]);
}
