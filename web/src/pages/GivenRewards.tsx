/* Supporter: open rewards across all kids. Mark a promise as done (paid / redeemed).
   Merkster only tracks promises – the supporter keeps them themselves. */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api';
import { earnedWhat, rewardText, useGivenRewards } from '../lib/rewards';
import { whoName } from '../lib/supporters';
import { confetti, toast } from '../lib/util';
import { MiniAvatar } from '../components/Cheers';
import { TopBar } from '../components/ui';
import { t, uiLang } from '../i18n';

export default function GivenRewards() {
  const q = useGivenRewards(), qc = useQueryClient(), L = uiLang();
  const [busy, setBusy] = useState('');
  const list = q.data?.rewards || [];
  const unseen = q.data?.unseen || 0;
  useEffect(() => {
    if (!unseen) return;
    const id = setTimeout(() => { void api('/api/rewards/given/seen', { body: {} }).then(() => qc.invalidateQueries({ queryKey: ['rewards-given'] })).catch(() => undefined); }, 2500);
    return () => clearTimeout(id);
  }, [unseen]); // eslint-disable-line react-hooks/exhaustive-deps
  const open = list.filter(r => r.status === 'open'), paid = list.filter(r => r.status === 'paid');
  const setStatus = async (id: string, status: 'paid' | 'open') => {
    setBusy(id);
    try {
      await api(`/api/rewards/${id}/status`, { body: { status } });
      if (status === 'paid') { confetti(); toast(t('marked_paid'), 'ok'); }
      await qc.invalidateQueries({ queryKey: ['rewards-given'] });
      await qc.invalidateQueries({ queryKey: ['kid-rewards'] });
    } catch (e) { toast((e as ApiError).message || t('err_unknown'), 'bad'); }
    finally { setBusy(''); }
  };
  const Row = ({ e }: { e: (typeof list)[0] }) => (
    <div className={'rw-item given ' + e.status} data-testid="given-item" data-status={e.status} data-kid={whoName(e.kid)}>
      <MiniAvatar src={e.kid.avatar} name={e.kid.name} size={36} />
      <span className="grow"><b data-testid="given-line">{t('given_earned', { name: whoName(e.kid), reward: rewardText(e.reward) })}</b>
        <small>{t('given_for', { what: earnedWhat(e) })} · {new Date(e.earnedAt).toLocaleDateString(L)}</small></span>
      {e.status === 'open'
        ? <button className="btn primary sm" data-testid="mark-paid" disabled={!!busy} onClick={() => setStatus(e.id, 'paid')}>{t('mark_paid')}</button>
        : <button className="btn ghost sm" data-testid="mark-open" disabled={!!busy} onClick={() => setStatus(e.id, 'open')}>{t('mark_open')}</button>}
    </div>);
  return (
    <section className="page narrow rewards-page" data-testid="given-rewards">
      <TopBar title={'🎁 ' + t('given_title')} back="/cheer" />
      <p className="muted small">🤝 {t('rule_promise_note')}</p>
      {!list.length && <div className="empty-hero" data-testid="given-empty"><div className="empty-emoji">🎁</div><p>{t('given_none')}</p><Link className="btn ghost" to="/cheer">{t('cheer_title')} →</Link></div>}
      {open.length > 0 && <div className="card" data-testid="given-open"><h3>{t('open_rewards')} <span className="chip warm">{open.length}</span></h3>{open.map(e => <Row key={e.id} e={e} />)}</div>}
      {paid.length > 0 && <div className="card" data-testid="given-paid"><h3>{t('rw_paid')}</h3>{paid.map(e => <Row key={e.id} e={e} />)}</div>}
    </section>
  );
}
