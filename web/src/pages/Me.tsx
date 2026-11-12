import { useState } from 'react';
import { Link } from 'react-router-dom';
import { BADGES, RANKS, XP } from '../../../shared/gamification';
import { useMe, useStore } from '../hooks';
import { store } from '../lib/store';
import { AvatarEdit } from '../components/AvatarEdit';
import { Avatar, RankBadge } from '../components/ui';
import { ShareSheet, type ShareWhat } from '../components/Share';
import { t, tp, uiLang } from '../i18n';

export function Me() {
  useStore(); const me = useMe(); const L = uiLang();
  const p = store.progress(), have = new Map(p.badges.map(b => [b.id, b.at]));
  const [share, setShare] = useState<ShareWhat | null>(null);
  const [showAllBadges, setShowAllBadges] = useState(false);
  const user = me.data?.user || null;
  const ri = RANKS.indexOf(p.rank), next = RANKS[ri + 1];
  return (
    <section className="me page">
      <div className="me-hero pop-in" style={{ ['--c1' as string]: p.rank.c1, ['--c2' as string]: p.rank.c2, ['--glow' as string]: p.rank.glow }}>
        <div className="me-top">
          {user ? <AvatarEdit user={user} rank={p.rank} size={76} /> : <Avatar user={null} rank={p.rank} size={76} />}
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
          <div><b className="big-num" data-testid="me-streak">{p.streak.current}</b> <span>{tp('day_streak', p.streak.current)}</span>
            <p className="muted small">{p.streak.activeToday ? t('streak_safe') : p.streak.current ? t('streak_today') : t('streak_start')}</p>
            <p className="small">🧊 {tp('freezes_n', p.streak.freezes)} · 🏁 {tp('next_milestone', p.streak.next)} · {t('best_streak')}: {p.streak.best}</p>
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

      <div className="me-grid me-social">
        <Link to="/classes" className="card sup-card" data-testid="my-class">
          <h3>🏫 {t('my_class')}</h3>
          <p className="muted small">{t('my_class_sub')}</p>
          <span className="btn ghost sm">{t('classes_title')} →</span>
        </Link>
        <Link to="/results" className="card sup-card" data-testid="me-grades"><h3>📈 {t('stats_title')}</h3><p className="muted small">{t('erfolg_title')}</p></Link>
      </div>

      <h3 className="sec-title">{t('badges')} <span className="muted">{p.badges.length}/{BADGES.length}</span></h3>
      <div className="badge-grid" data-testid="badges">
        {(showAllBadges ? BADGES : [...BADGES.filter(b => have.has(b.id)), ...BADGES.filter(b => !have.has(b.id)).slice(0, 4)]).map(b => { const at = have.get(b.id); return (
          <button key={b.id} className={'badge-tile' + (at ? ' got' : '')} disabled={!at} title={b.desc[L]} onClick={() => at && setShare({ kind: 'badge', id: b.id })}>
            <span className="bi">{at ? b.icon : '🔒'}</span><b>{b.name[L]}</b><small>{b.desc[L]}</small>
          </button>); })}
      </div>
      {BADGES.length > (p.badges.length + 4) && (
        <button type="button" className="btn ghost sm" data-testid="badges-toggle" onClick={() => setShowAllBadges(v => !v)}>
          {showAllBadges ? t('show_fewer_badges') : t('show_all_badges')}
        </button>
      )}

      <h3 className="sec-title">{t('ranks')}</h3>
      <div className="rank-ladder">
        {RANKS.map((r, i) => <div key={r.id} className={'rank-step' + (i <= ri ? ' got' : '') + (i === ri ? ' cur' : '')}><RankBadge rank={r} size={54} /><b>{r.name[L]}</b><small>{t('lvl')} {r.level}</small></div>)}
      </div>

      <details className="card how-xp"><summary>⚡ {t('how_xp')}</summary>
        <ul>
          <li>{t('xp_r1', { n: XP.correct, f: XP.firstTry })}</li><li>{t('xp_r2', { n: XP.session })}</li><li>{t('xp_r3', { n: XP.streakPerDay * XP.streakMaxDays })}</li>
          <li>{t('xp_r4', { n: XP.plan })}</li><li>{t('xp_r5', { n: XP.result, b: XP.personalBest })}</li><li>{t('xp_r6')}</li>
        </ul>
      </details>
      <div className="totals muted small">{t('totals', { s: p.totals.sessions, c: p.totals.correct, m: p.totals.activeMin, d: p.totals.days })}</div>
      {share && <ShareSheet what={share} onClose={() => setShare(null)} />}
    </section>
  );
}
