/* Supporters: API hooks (TanStack Query) + helpers shared by the student and supporter screens. */
import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { badgeDef } from '../../../shared/gamification';
import { supporterName, targetKey, type Cheer, type Invite, type KidSummary, type Supporter } from '../../../shared/supporters';
import { api } from './api';
import { store } from './store';
import { t, uiLang, type Key } from '../i18n';

/** cheers I received – polled while the app is open; fed into progression (XP / Fan club badge) */
export function useCheers(enabled = true) {
  const q = useQuery({ queryKey: ['cheers'], queryFn: () => api<{ cheers: Cheer[] }>('/api/cheers').then(r => r.cheers), enabled, refetchInterval: 60_000, refetchOnWindowFocus: true, retry: 0, staleTime: 15_000 });
  useEffect(() => { if (q.data) store.setCheers(q.data.map(c => ({ at: c.at, target: targetKey(c.targetKind, c.targetId), from: c.from.id }))); }, [q.data]);
  return q;
}
export function useMarkCheersSeen() {
  const qc = useQueryClient();
  return async () => { await api('/api/cheers/seen', { method: 'POST', body: {} }).catch(() => undefined); qc.setQueryData<Cheer[]>(['cheers'], old => old?.map(c => ({ ...c, seen: true }))); };
}
export const useSupporters = () => useQuery({ queryKey: ['supporters'], queryFn: () => api<{ supporters: Supporter[] }>('/api/supporters').then(r => r.supporters) });
export const useSeeEachOther = () => useQuery({ queryKey: ['supporters-vis'], queryFn: () => api<{ seeEachOther: boolean }>('/api/supporters').then(r => !!r.seeEachOther) });
export const useInvites = () => useQuery({ queryKey: ['invites'], queryFn: () => api<{ invites: Invite[] }>('/api/invites').then(r => r.invites) });
export const useKids = (enabled = true) => useQuery({ queryKey: ['kids'], queryFn: () => api<{ kids: KidSummary[] }>('/api/kids').then(r => r.kids), enabled, refetchInterval: 120_000 });
export const useKid = (id: string) => useQuery({ queryKey: ['kid', id], queryFn: () => api<{ kid: KidSummary }>('/api/kids/' + id).then(r => r.kid), retry: 0 });

export const relName = (r: string) => t(('rel_' + r) as Key);
export const whoName = (s: { label?: string; name: string; relation?: string }) => (s.label || '').trim() || (s.relation && s.relation !== 'other' ? relName(s.relation) : '') || supporterName(s);
/** emoji, or the preset message text */
export const reactionText = (r: string) => (r.startsWith('msg:') ? t(('msg_' + r.slice(4)) as Key) : r);
export const isMessage = (r: string) => r.startsWith('msg:');
export const milestoneName = (kind: string, id: string) => kind === 'level' ? t('level_n', { n: id }) : kind === 'badge' ? (badgeDef(id)?.name[uiLang()] || id) : id;
export const milestoneIcon = (kind: string, id: string) => kind === 'level' ? '⬆️' : badgeDef(id)?.icon || '🏅';

/** one-line activity text for the student's feed */
export function cheerLine(c: Cheer, testName: (id: string) => string | null) {
  const name = whoName(c.from);
  if (c.targetKind === 'result') return t('cheer_on_result', { name, test: testName(c.targetId) || '…' });
  if (c.targetKind === 'report') return t('cheer_on_report', { name });
  if (c.targetKind === 'level') return t('cheer_on_level', { name, id: c.targetId });
  return t('cheer_on_badge', { name, id: milestoneName('badge', c.targetId) });
}
/** group the cheers for one target by supporter: [{ from, reactions: [...] }] */
export function cheersFor(all: Cheer[] | undefined, kind: string, id: string) {
  const by = new Map<string, { from: Cheer['from']; reactions: string[] }>();
  for (const c of all || []) if (c.targetKind === kind && c.targetId === id) { const g = by.get(c.from.id) || { from: c.from, reactions: [] }; g.reactions.push(c.reaction); by.set(c.from.id, g); }
  return [...by.values()];
}
const INVITE_KEY = 'merkster.invite';
/** the invite token travels in the URL fragment (never in server logs) and survives the Google round-trip in sessionStorage */
export const inviteToken = {
  capture() {
    const m = /^#?([A-Za-z0-9_-]{32})$/.exec(location.hash || '');
    if (m) { sessionStorage.setItem(INVITE_KEY, m[1]); history.replaceState(null, '', location.pathname + location.search); }
    return sessionStorage.getItem(INVITE_KEY);
  },
  clear() { sessionStorage.removeItem(INVITE_KEY); }
};
