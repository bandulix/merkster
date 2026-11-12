/* Shared-plan card: each person's progress, a nudge, and a short feed. First names only. */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import type { Test } from '../../../shared/types';
import { cheerPlan, hidePlan, leavePlan, loadPlan, nudgePlan, type PlanEvent } from '../lib/planSync';
import { store } from '../lib/store';
import { t, tp } from '../i18n';

function line(e: PlanEvent) {
  const name = e.name || '…';
  if (e.kind === 'joined') return t('feed_joined', { name });
  if (e.kind === 'session') return t('feed_session', { name });
  if (e.kind === 'goal') return t('feed_goal', { name, goal: e.goal || '' });
  if (e.kind === 'nudge') return t('feed_nudge', { name });
  if (e.kind === 'cheer') return t('feed_cheer', { name, goal: e.goal ? ' · ' + e.goal : '' });
  return name;
}

export function SharedPlan({ test }: { test: Test }) {
  const id = test.study?.sharedPlanId;
  const nav = useNavigate();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['plan', id], queryFn: () => loadPlan(id!), enabled: !!id, refetchInterval: 20000, retry: 0 });
  if (!id) return null;
  const data = q.data;
  const mine = data?.members.find(m => m.me);
  const refresh = () => qc.invalidateQueries({ queryKey: ['plan', id] });
  return (
    <div className="card together" data-testid="together">
      <h3>{t('together')}</h3>
      <p className="muted small">{t('together_sub')}</p>
      {(data?.members || []).map(m => (
        <div key={m.name + (m.me ? '-me' : '')} className="member" data-testid="member-row">
          <span className="avatar-letter" aria-hidden>{(m.name || '?').slice(0, 1).toUpperCase()}</span>
          <span className="grow">
            <b>{m.name}{m.me ? ' · ' + t('compare_you') : ''}</b>
            {m.hidden && !m.me ? <small>{t('together_hidden')}</small> : <>
              <span className="member-bar" role="progressbar" aria-valuenow={m.mastery || 0} aria-valuemin={0} aria-valuemax={100}><i style={{ width: (m.mastery || 0) + '%' }} /></span>
              <small>{m.mastery ?? 0}%{m.didToday ? ' · ' + t('together_today') : ''}{m.streak ? ' · 🔥 ' + m.streak : ''}</small>
            </>}
          </span>
          {!m.me && <button className="btn ghost sm" data-testid="compare-open" onClick={() => nav('/compare/' + m.id)}>{t('compare_open')}</button>}
        </div>
      ))}
      <div className="row-btns wrap">
        <button className="btn ghost sm" data-testid="plan-nudge" onClick={() => void nudgePlan(id).then(refresh)}>{t('together_nudge')}</button>
        <button className="btn ghost sm" onClick={() => void cheerPlan(id).then(refresh)}>{t('together_cheer')}</button>
        <button className="btn ghost sm" data-testid="plan-hide" onClick={() => void hidePlan(id, !mine?.hidden).then(refresh)}>{mine?.hidden ? t('together_show') : t('together_hide')}</button>
        <button className="btn link sm" onClick={() => { void leavePlan(id); store.updateTest(test.id, { study: { ...test.study!, sharedPlanId: undefined } }); }}>{t('together_leave')}</button>
      </div>
      <h3 className="sec-title">{t('feed_title')}</h3>
      <ul className="feed" data-testid="activity-feed">
        {(data?.events || []).length === 0 && <li className="muted small">{t('feed_empty')}</li>}
        {(data?.events || []).map((e, i) => <li key={i} data-testid="feed-item">{line(e)}</li>)}
      </ul>
    </div>
  );
}

export function goalLine(test: Test) {
  const goals = test.study?.goals || [];
  if (!goals.length) return null;
  return (
    <div className="card" data-testid="plan-overview">
      <h3>{t('plan_methods')}</h3>
      <p className="muted small">{t('plan_load', { m: test.study?.minutesPerDay || 20 })}</p>
      <ul className="goal-list">{goals.map(g => {
        const cards = test.items.filter(c => c.study?.goalId === g.id);
        const pct = cards.length ? Math.round(cards.reduce((n, c) => n + Math.min(3, c.st?.sessions || 0) / 3, 0) / cards.length * 100) : 0;
        return (
          <li key={g.id} className="goal-mini">
            <b>{g.topic || g.text}</b>
            <span className="chip" data-testid="method-chip">{t(('method_' + g.method) as 'method_retrieval')}</span>
            <small>{t(('method_why_' + g.method) as 'method_retrieval')}</small>
            <span className="member-bar"><i style={{ width: pct + '%' }} /></span>
            <small>{tp('goal_mastery', pct)}</small>
          </li>
        );
      })}</ul>
    </div>
  );
}
