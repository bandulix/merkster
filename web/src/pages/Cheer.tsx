/* Supporter overview: one card per kid I cheer for – rank, level, streak, upcoming tests, latest results, achievements. */
import { Link, useNavigate } from 'react-router-dom';
import { RANKS } from '../../../shared/gamification';
import { fmtResult } from '../../../shared/grades';
import type { KidSummary, KidUpcoming } from '../../../shared/supporters';
import type { User } from '../../../shared/types';
import { kidName, useKids, milestoneIcon, milestoneName, relName } from '../lib/supporters';
import { fmtDay } from '../lib/util';
import { earnedWhat, rewardText, useGivenRewards } from '../lib/rewards';
import { MiniAvatar } from '../components/Cheers';
import { Avatar, RankBadge } from '../components/ui';
import { subjectIcon, t, uiLang } from '../i18n';

export const rankById = (id?: string) => RANKS.find(r => r.id === id) || RANKS[0];
export const daysLeftLabel = (n: number) => (n <= 0 ? t('is_today') : n === 1 ? t('in_1_day') : t('in_days', { n }));
export const kidUser = (k: KidSummary) => ({ id: k.id, name: k.name, avatar: k.avatar, email: null, isAdmin: false }) as User;

export function Upcoming({ list }: { list: KidUpcoming[] }) {
  return <ul className="kid-upcoming">{list.map((u, i) => (
    <li key={i}><span className="tc-icon sm">{subjectIcon(u.subject)}</span><span className="grow"><b>{u.name}</b><small>{fmtDay(u.testDate)}{u.practisedDays ? ' · ' + t('practised_days', { n: u.practisedDays }) : ''}</small></span>
      <span className={'cd ' + (u.daysLeft <= 1 ? 'hot' : u.daysLeft <= 3 ? 'warm' : '')}>{daysLeftLabel(u.daysLeft)}</span></li>))}</ul>;
}

function KidCard({ k }: { k: KidSummary }) {
  const nav = useNavigate(), L = uiLang(), p = k.practice, rank = rankById(p?.rankId);
  return (
    <button className="kid-card pop-in" data-testid="kid-card" data-kid={k.id} data-name={k.name} onClick={() => nav('/cheer/' + k.id)} style={{ ['--c1' as string]: rank.c1, ['--c2' as string]: rank.c2, ['--glow' as string]: rank.glow }}>
      <div className="kid-head">
        <Avatar user={kidUser(k)} rank={rank} size={58} />
        <div className="grow"><h2>{k.name}</h2>
          {p ? <p className="kid-rank"><RankBadge rank={rank} size={22} /> {t('lvl')} {p.level} · {rank.name[L]}</p> : <p className="muted small">{relName(k.relation)}</p>}</div>
        {p && <div className="kid-streak" title={t('day_streak')}><span>🔥</span><b data-testid="kid-streak">{p.streak}</b></div>}
      </div>
      {!p && !k.results && <p className="muted">{t('kid_shares_nothing', { name: k.name })}</p>}
      {p && <p className="small kid-week">⏱️ {t('kid_week', { m: p.weekMinutes })} · 🏅 {p.badges}</p>}
      {p && p.upcoming.length > 0 && <><h4>{t('kid_upcoming')}</h4><Upcoming list={p.upcoming} /></>}
      {k.results && k.results.length > 0 && <><h4>{t('kid_results')}</h4>
        <div className="kid-results">{k.results.map(r => (
          <span key={r.testId} className="kid-res"><span>{subjectIcon(r.subject)} {r.name}</span><b data-testid="kid-grade">{fmtResult(r.result)}</b>
            {r.reactions.length > 0 && <small>{r.reactions.filter(x => !x.reaction.startsWith('msg:')).map(x => x.reaction).join('')}</small>}</span>))}</div></>}
      {p && p.milestones.length > 0 && <><h4>{t('kid_milestones')}</h4>
        <div className="kid-ms">{p.milestones.map(m => <span key={m.kind + m.id} className="ms-chip">{milestoneIcon(m.kind, m.id)} {milestoneName(m.kind, m.id)}</span>)}</div></>}
      <span className="btn primary big wide kid-go" data-testid="cheer-cta">{t('cheer_kid', { name: kidName(k) })}</span>
    </button>
  );
}

export function CheerHome() {
  const kids = useKids(), given = useGivenRewards();
  const fresh = (given.data?.rewards || []).filter(r => !r.seen && r.status === 'open'), openN = given.data?.open || 0;
  return (
    <section className="cheer page">
      <header className="home-top"><div><p className="muted small">{t('cheer_kicker')}</p><h1 className="page-title">📣 {t('cheer_title')}</h1></div></header>
      {kids.isLoading && <div className="spinner" />}
      {fresh.slice(0, 3).map(r => <Link key={r.id} to="/cheer/rewards" className="card reward-notice pop-in" data-testid="reward-notice">
        <MiniAvatar src={r.kid.avatar} name={r.kid.name} size={40} /><span className="grow"><b>🎉 {t('given_earned', { name: kidName(r.kid), reward: rewardText(r.reward) })}</b><small>{t('given_for', { what: earnedWhat(r) })}</small></span><span>→</span></Link>)}
      {(openN > 0 || (given.data?.rewards.length || 0) > 0) && <Link to="/cheer/rewards" className="card open-rewards-link" data-testid="open-rewards-link">🎁 <b>{t('open_rewards')}</b> <span className="chip warm" data-testid="open-rewards-count">{t('open_rewards_n', { n: openN })}</span><span className="grow" />→</Link>}
      {kids.data && !kids.data.length && <div className="empty-hero" data-testid="cheer-empty"><div className="empty-emoji">📣</div><p>{t('cheer_empty')}</p></div>}
      <div className="kid-grid" data-testid="kid-grid">{kids.data?.map(k => <KidCard key={k.id} k={k} />)}</div>
      <p className="muted small center">🔒 {t('readonly_note')}</p>
      <div className="card learn-too"><b>{t('learn_too')}</b><Link className="btn ghost sm" to="/new">📸 {t('start_learning')}</Link></div>
    </section>
  );
}
