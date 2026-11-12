/* One Merki bubble at a time. Muted hides the words and keeps a small still figure.
   A moment (plan, grade, exam day) covers the screen until it is dismissed. */
import { useSyncExternalStore } from 'react';
import { useQuery } from '@tanstack/react-query';
import { erfolgsquote } from '../../../shared/gradebook';
import { adherencePct, collectGrades } from '../../../shared/gradebook';
import { ageBand, fallbackLine, pickTrigger, type MerkiContext, type MerkiTrigger } from '../../../shared/merki';
import { useStore } from '../hooks';
import { api } from '../lib/api';
import { store } from '../lib/store';
import { loadPlan } from '../lib/planSync';
import * as S from '../lib/schedule';
import { now } from '../lib/util';
import { t, uiLang } from '../i18n';
import { Merki } from './Merki';

type MomentTrigger = 'plan_created' | 'grade' | 'exam_soon';
let moment: MomentTrigger | null = null;
const listeners = new Set<() => void>();
const shown = new Set<string>();
const emit = () => listeners.forEach(fn => fn());

export function merkiMoment(): MomentTrigger | null { return moment; }
export function subscribeMerki(fn: () => void) { listeners.add(fn); return () => listeners.delete(fn); }
/** A full-screen moment is optional and once per visit. Pages do not queue one on arrival. */
export function queueMerkiMoment(trigger: MomentTrigger) {
  if (moment || store.data.settings.merkiMuted || shown.has(trigger)) return;
  shown.add(trigger);
  moment = trigger;
  emit();
}
export function clearMerkiMoment() { moment = null; emit(); }

export function merkiContext(): MerkiContext {
  const d = store.data;
  const year = new Date().getFullYear();
  const band = ageBand({ schoolYear: d.settings.schoolYear, birthYear: d.settings.birthYear, nowYear: year }) || 'mid';
  const ts = now();
  const active = d.tests.filter(t => S.phase(t, ts) !== 'past');
  const examIn = active.length ? Math.min(...active.map(t => Math.max(0, S.daysLeft(t, ts)))) : null;
  const grades = collectGrades(d.tests, d.grades || [], test => adherencePct(S.plan(test).filter(p => p.kind !== 'morning').map(p => p.day), test.days));
  const quote = grades.length ? erfolgsquote(grades, d.settings.gradeTargets).rate : null;
  const withPlan = grades.filter(g => g.withPlan && g.adherence != null);
  const adherence = withPlan.length ? Math.round(withPlan.reduce((n, g) => n + (g.adherence || 0), 0) / withPlan.length) : null;
  const behind = active.some(t => (t.days || []).length + 1 < Math.min(3, Math.max(1, S.daysBetween(t.created, S.dayISO(ts)))));
  return {
    band, lang: uiLang() === 'en' ? 'en' : 'de', name: '', streak: store.liveStreak(ts),
    dueToday: S.todayCount(d.tests, ts), examIn, erfolg: quote, adherence,
    plan: active[0]?.name || '', friend: '', behind, hour: new Date(ts).getHours()
  };
}

/** Home shows exactly one line. A friend who practised today only speaks when nothing more urgent is waiting. */
export function homeTrigger(): MerkiTrigger {
  const ctx = merkiContext();
  return pickTrigger({ dueToday: ctx.dueToday, examIn: ctx.examIn, behind: ctx.behind, friend: false, hasTests: store.data.tests.length > 0 });
}

async function friendName(): Promise<string> {
  const planId = store.data.tests.map(t => t.study?.sharedPlanId).find(Boolean);
  if (!planId) return '';
  try {
    const plan = await loadPlan(planId);
    const other = plan.members.find(m => !m.me && !m.hidden && !!m.didToday && !!m.name);
    return other ? other.name.split(/\s+/)[0] : '';
  } catch { return ''; }
}

export function MerkiSay({ trigger, placement = 'hero', localOnly = false }: { trigger: MerkiTrigger; placement?: 'hero' | 'inline' | 'nudge' | 'moment'; localOnly?: boolean }) {
  const d = useStore();
  const open = useSyncExternalStore(subscribeMerki, merkiMoment);
  const muted = !!d.settings.merkiMuted;
  const ctx = merkiContext();
  const local = fallbackLine(ctx, trigger);
  const day = S.dayISO(now());
  const q = useQuery({
    queryKey: ['merki', trigger, day, ctx.band, ctx.lang],
    enabled: !muted && !localOnly,
    staleTime: 6 * 3600e3,
    retry: 0,
    queryFn: async () => {
      let use = trigger;
      let friend = '';
      if (trigger === 'home') {
        friend = await friendName();
        if (friend) use = 'friend';
      }
      return api<{ line: string; pose: string }>('/api/merki', { body: { trigger: use, context: { ...ctx, friend } } });
    }
  });
  if (open && !muted && placement !== 'moment') return null;
  const line = q.data?.line || local.line;
  const pose = (q.data?.pose as typeof local.pose) || local.pose;
  if (muted && placement !== 'moment') {
    if (placement === 'inline') return null;
    return <div className="merki-quiet" data-testid="merki-quiet"><Merki band={ctx.band} pose="sleepy" size={48} /></div>;
  }
  if (placement === 'moment') {
    return (
      <div className="merki-moment" data-testid="merki-moment">
        <Merki band={ctx.band} pose={pose} size={180} />
        <p className="merki-bubble" data-testid="merki-bubble">{line}</p>
      </div>
    );
  }
  const nudge = placement === 'nudge';
  return (
    <div className={'merki-say merki-say-' + placement + (nudge ? ' merki-nudge' : '')} data-testid={nudge ? 'merki-nudge' : placement === 'inline' ? 'merki-inline' : 'merki-home'}>
      <Merki band={ctx.band} pose={pose} size={placement === 'inline' ? 56 : nudge ? 84 : 112} />
      <p className="merki-bubble" data-testid="merki-bubble">{line}</p>
    </div>
  );
}

export function MerkiMomentHost() {
  const d = useStore();
  const trigger = useSyncExternalStore(subscribeMerki, merkiMoment);
  if (!trigger || d.settings.merkiMuted) return null;
  return (
    <div className="merki-screen" role="dialog" aria-modal="true" aria-label="Merki" data-testid="merki-screen">
      <MerkiSay trigger={trigger} placement="moment" />
      <button type="button" className="btn primary big" data-testid="merki-continue" onClick={clearMerkiMoment}>{t('merki_go')}</button>
    </div>
  );
}
