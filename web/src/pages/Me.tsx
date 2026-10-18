import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BADGES, RANKS, XP } from '../../../shared/gamification';
import { useMe, useStore } from '../hooks';
import { store } from '../lib/store';
import { Avatar, RankBadge } from '../components/ui';
import { ShareSheet, type ShareWhat } from '../components/Share';
import { t, uiLang } from '../i18n';
import { cheerLine, reactionText, useCheers, useMarkCheersSeen, useSupporters, whoName } from '../lib/supporters';
import { MiniAvatar } from '../components/Cheers';
import { moneyList, periodTotals, useMyRewards } from '../lib/rewards';

export function Me() {
  useStore(); const me = useMe(); const L = uiLang();
  const p = store.progress(), have = new Map(p.badges.map(b => [b.id, b.at]));
  const [share, setShare] = useState<ShareWhat | null>(null);
  const user = me.data?.user || null;
  const ri = RANKS.indexOf(p.rank), next = RANKS[ri + 1];
  const cheers = useCheers(), sup = useSupporters(), markSeen = useMarkCheersSeen();
  const unseen = (cheers.data || []).filter(c => !c.seen).length;
  const rw = useMyRewards(!!store.userId), rwOpen = (rw.data?.earned || []).filter(e => e.status === 'open'), rwYear = periodTotals(rw.data?.earned || [], 'year');
  useEffect(() => { if (!unseen) return; const id = setTimeout(markSeen, 2500); return () => clearTimeout(id); }, [unseen]); // eslint-disable-line react-hooks/exhaustive-deps
  const testName = (id: string) => store.test(id)?.name || null;
  return (
    <section className="me page">
      <div className="me-hero pop-in" style={{ ['--c1' as string]: p.rank.c1, ['--c2' as string]: p.rank.c2, ['--glow' as string]: p.rank.glow }}>
        <div className="me-top">
          <Avatar user={user} rank={p.rank} size={76} />
          <div><h1>{user?.name?.split(/\s+/)[0] || t('tab_me')}</h1><p className="me-rank"><RankBadge rank={p.rank} size={26} /> {p.rank.name[L]}</p></div>
          <button className="icon-btn light" aria-label={t('share')} data-testid="share-level" onClick={() => setShare({ kind: 'level' })}>📤</button>
        </div>
        <div className="lvl-row"><b className="lvl-num" data-testid="me-level">{t('lvl')} {p.level}</b><span data-testid="me-xp">{p.xp} XP</span></div>
        <div className="xpbar big"><i style={{ width: p.info.pct + '%' }} /></div>
        <p className="small">{t('xp_to_next', { n: p.info.next - p.xp, l: p.level + 1 })}{next ? ' · ' + t('next_rank_at', { rank: next.name[L], n: next.level }) : ''}</p>
      </div>

      <div className="me-grid">
        <div className="card streak-card">
          <div className="flame" data-on={p.streak.activeToday ? '1' : '0'}>🔥</div>
          <div><b className="big-num" data-testid="me-streak">{p.streak.current}</b> <span>{t('day_streak')}</span>
            <p className="muted small">{p.streak.activeToday ? t('streak_safe') : p.streak.current ? t('streak_today') : t('streak_start')}</p>
            <p className="small">🧊 {t('freezes_n', { n: p.streak.freezes })} · 🏁 {t('next_milestone', { n: p.streak.next })} · {t('best_streak')}: {p.streak.best}</p>
          </div>
          <button className="btn link" onClick={() => setShare({ kind: 'streak' })}>📤</button>
        </div>
        <div className="card week-card">
          <h3>{t('this_week')}</h3>
          <div className="stat-row small-stats">
            <div className="stat"><b>{p.week.activeMin}</b><span>{t('active_min')}</span></div>
            <div className="stat"><b>{p.week.correct}</b><span>{t('recalls')}</span></div>
            <div className="stat"><b>+{p.week.xp}</b><span>XP</span></div>
          </div>
          <button className="btn ghost sm" data-testid="share-week" onClick={() => setShare({ kind: 'week' })}>📤 {t('share_week')}</button>
        </div>
      </div>

      <div className="me-grid">
        <Link to="/classes" className="card sup-card" data-testid="my-class">
          <h3>🏫 {t('my_class')}</h3>
          <p className="muted small">{t('my_class_sub')}</p>
          <span className="btn ghost sm">{t('classes_title')} →</span>
        </Link>
        <Link to="/supporters" className="card sup-card" data-testid="my-supporters">
          <h3>📣 {t('my_supporters')}</h3>
          <div className="sup-avs">{(sup.data || []).slice(0, 6).map(s => <MiniAvatar key={s.id} src={s.avatar} name={whoName(s)} size={36} />)}{!sup.data?.length && <span className="muted small">{t('no_supporters')}</span>}</div>
          <span className="btn ghost sm">{sup.data?.length ? t('fans_n', { n: sup.data.length }) : t('invite_supporter')} →</span>
        </Link>
        <Link to="/reports" className="card sup-card" data-testid="me-reports"><h3>📜 {t('report_cards')}</h3><p className="muted small">{t('results_reports')} · {t('sim_title')}</p></Link>
        {!!(rw.data?.rules.length || rw.data?.earned.length) && <Link to="/rewards" className="card sup-card" data-testid="me-rewards">
          <h3>🎁 {t('my_rewards')}</h3>
          <p><b>{rwOpen.length ? t('open_rewards_n', { n: rwOpen.length }) : t('rw_open') + ': –'}</b>{rwYear.paid.length ? <span className="muted small"> · {t('rw_this_year')}: {moneyList(rwYear.paid)} ✅</span> : null}</p>
          <span className="btn ghost sm">{t('what_can_i_earn')} →</span>
        </Link>}
        <div className="card feed-card" data-testid="cheer-feed">
          <h3>🎉 {t('cheers')} {unseen > 0 && <span className="chip hot">{t('cheers_new', { n: unseen })}</span>}</h3>
          {!cheers.data?.length ? <p className="muted small">{t('cheer_feed_empty')}</p> :
            <ul className="feed">{cheers.data.slice(0, 8).map(c => (
              <li key={c.id} className={'feed-item' + (c.seen ? '' : ' new')} data-testid="cheer-item"><MiniAvatar src={c.from.avatar} name={c.from.name} size={30} />
                <span className="grow"><span>{cheerLine(c, testName)}</span><small className="muted">{new Date(c.at).toLocaleDateString(L)}</small></span><b className="feed-r">{reactionText(c.reaction)}</b></li>))}</ul>}
        </div>
      </div>

      <h3 className="sec-title">{t('badges')} <span className="muted">{p.badges.length}/{BADGES.length}</span></h3>
      <div className="badge-grid" data-testid="badges">
        {BADGES.map(b => { const at = have.get(b.id); return (
          <button key={b.id} className={'badge-tile' + (at ? ' got' : '')} disabled={!at} title={b.desc[L]} onClick={() => at && setShare({ kind: 'badge', id: b.id })}>
            <span className="bi">{at ? b.icon : '🔒'}</span><b>{b.name[L]}</b><small>{b.desc[L]}</small>
          </button>); })}
      </div>

      <h3 className="sec-title">{t('ranks')}</h3>
      <div className="rank-ladder">
        {RANKS.map((r, i) => <div key={r.id} className={'rank-step' + (i <= ri ? ' got' : '') + (i === ri ? ' cur' : '')}><RankBadge rank={r} size={54} /><b>{r.name[L]}</b><small>{t('lvl')} {r.level}</small></div>)}
      </div>

      <details className="card how-xp"><summary>⚡ {t('how_xp')}</summary>
        <ul>
          <li>{t('xp_r1', { n: XP.correct, f: XP.firstTry })}</li><li>{t('xp_r2', { n: XP.session })}</li><li>{t('xp_r3', { n: XP.streakPerDay * XP.streakMaxDays })}</li>
          <li>{t('xp_r4', { n: XP.plan })}</li><li>{t('xp_r5', { n: XP.result, b: XP.personalBest })}</li><li>{t('xp_r6')}</li><li>{t('xp_r7', { n: XP.cheer, m: XP.cheerDailyCap })}</li>
        </ul>
      </details>
      <div className="totals muted small">{t('totals', { s: p.totals.sessions, c: p.totals.correct, m: p.totals.activeMin, d: p.totals.days })}</div>
      {share && <ShareSheet what={share} onClose={() => setShare(null)} />}
    </section>
  );
}
