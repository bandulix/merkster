/* Student: my rewards – GRAND TOTAL + per-supporter breakdown, filters (open/done, supporter, this term/year/all time).
   Merkster only tracks promises; the supporter marks them done. Totals are per currency (never EUR + CHF). */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { store } from '../lib/store';
import { earnedWhat, moneyList, periodTotals, rewardPeople, rewardText, useMyRewards } from '../lib/rewards';
import { whoName } from '../lib/supporters';
import { dayISO } from '../lib/schedule';
import { now } from '../lib/util';
import { termOf } from '../../../shared/reportcards';
import { termStarts } from '../lib/reportcards';
import { MiniAvatar } from '../components/Cheers';
import { ParentInvite } from '../components/ParentInvite';
import { EarnCards } from '../components/Rewards';
import { earnedBreakdown, GrandTotal, SupporterBreakdownList } from '../components/Totals';
import { TopBar } from '../components/ui';
import { t, tp, uiLang } from '../i18n';

type Status = 'all' | 'open' | 'paid'; type Range = 'term' | 'year' | 'all';
export default function Rewards() {
  const q = useMyRewards(!!store.userId), L = uiLang();
  const all = q.data?.earned || [];
  const [status, setStatus] = useState<Status>('all'), [range, setRange] = useState<Range>('all'), [sup, setSup] = useState('all');
  const today = dayISO(now()), term = termOf(today, termStarts());
  const inRange = (ts: number) => { const d = dayISO(ts); return range === 'all' ? true : range === 'year' ? d.slice(0, 4) === today.slice(0, 4) : d >= term.start && d <= term.end; };
  const onIt = (e: (typeof all)[number]) => sup === 'all' || e.supporter.id === sup || (e.members || []).some(m => m.id === sup);
  const earned = all.filter(e => (status === 'all' || e.status === status) && onIt(e) && inRange(e.earnedAt));
  const b = earnedBreakdown(earned);
  const month = periodTotals(all, 'month'), year = periodTotals(all, 'year');
  const sups = [...new Map(all.flatMap(e => (e.members && e.members.length > 1 ? e.members : [e.supporter]).map(p => [p.id, p] as const))).values()];
  const bySup = new Map<string, typeof earned>();
  for (const e of earned) { const p = rewardPeople(e); bySup.set(p.id, [...(bySup.get(p.id) || []), e]); }
  const sys = store.data.settings.grading;
  const Tot = ({ p, tid, label }: { p: ReturnType<typeof periodTotals>; tid: string; label: string }) => (
    <div className="tile-stat rw-total" data-testid={tid}><span>{label}</span>
      <b data-testid={tid + '-open'}>{p.open.length ? moneyList(p.open) : p.otherOpen ? '' : '–'}{p.otherOpen ? (p.open.length ? ' + ' : '') + tp('rw_other_n', p.otherOpen) : ''}</b>
      <small>{t('rw_open')} · {t('rw_paid')}: <span data-testid={tid + '-paid'}>{p.paid.length ? moneyList(p.paid) : '–'}{p.otherPaid ? ' + ' + tp('rw_other_n', p.otherPaid) : ''}</span></small></div>);
  const Seg = <T extends string>({ v, set, opts, tid }: { v: T; set: (x: T) => void; opts: [T, string][]; tid: string }) =>
    <div className="seg" data-testid={tid}>{opts.map(([k, l]) => <button key={k} className={'pill sm' + (v === k ? ' on' : '')} data-testid={tid + '-' + k} onClick={() => set(k)}>{l}</button>)}</div>;
  return (
    <section className="page narrow rewards-page" data-testid="my-rewards">
      <TopBar title={'🎁 ' + t('my_rewards')} back="/me" />
      <p className="muted small">🤝 {t('rewards_disclaimer')}</p>
      {all.length > 0 && <div className="card rw-filters">
        <Seg v={status} set={setStatus} tid="rw-f" opts={[['all', t('rw_filter_all')], ['open', t('rw_filter_open')], ['paid', t('rw_filter_paid')]]} />
        <Seg v={range} set={setRange} tid="rw-r" opts={[['term', t('rw_range_term')], ['year', t('rw_range_year')], ['all', t('rw_range_all')]]} />
        {sups.length > 1 && <select data-testid="rw-f-sup" value={sup} onChange={e => setSup(e.target.value)}><option value="all">{t('rw_everyone')}</option>{sups.map(s => <option key={s.id} value={s.id}>{whoName(s)}</option>)}</select>}
      </div>}
      {all.length > 0 && <div className="card"><GrandTotal b={b} testid="rw-grand" /><h3 className="sec-title small">{t('per_supporter')}</h3><SupporterBreakdownList b={b} sys={sys} testid="rw-breakdown" /></div>}
      <div className="tiles two"><Tot p={month} tid="rw-total-month" label={t('rw_this_month')} /><Tot p={year} tid="rw-total-year" label={t('rw_this_year')} /></div>
      {!all.length && <div className="empty-hero"><div className="empty-emoji">🎁</div><p>{t('rw_none_yet')}</p><ParentInvite /></div>}
      {[...bySup.values()].map(list => {
        const s = rewardPeople(list[0]), open = list.filter(e => e.status === 'open'), paid = list.filter(e => e.status === 'paid');
        return (
          <div key={s.id} className="card rw-sup" data-testid="rw-sup" data-name={whoName(s)}>
            <div className="rw-sup-head"><MiniAvatar src={s.avatar} name={s.name} size={40} /><b>{whoName(s)}</b><span className="chip warm">{t('open_rewards_n', { n: open.length })}</span></div>
            {[...open, ...paid].map(e => (
              <div key={e.id} className={'rw-item ' + e.status} data-testid="rw-item" data-status={e.status}>
                <span className="rw-ic">{e.status === 'paid' ? '✅' : '⏳'}</span>
                <span className="grow"><b>{rewardText(e.reward)}</b><small>{t('given_for', { what: earnedWhat(e) })} · {new Date(e.earnedAt).toLocaleDateString(L)}</small></span>
                <span className={'chip ' + (e.status === 'paid' ? 'good' : 'warm')}>{e.status === 'paid' ? t('rw_paid') : t('rw_open')}</span>
              </div>))}
          </div>);
      })}
      <EarnCards />
      <p className="center"><Link className="btn link" to="/reports/simulate" data-testid="rw-sim">🧮 {t('sim_title')}</Link> <Link className="btn link" to="/supporters">📣 {t('my_supporters')}</Link></p>
    </section>
  );
}
