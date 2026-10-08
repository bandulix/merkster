/* Level-up & badge celebrations. Watches the derived progress; anything new and recent (≤ 20 min)
   gets a big moment (glow, rays, confetti, optional sound). Older unlocks (e.g. synced from another
   device) are acknowledged silently – no notification spam, no guilt. */
import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { badgeDef, RANKS, rankFor } from '../../../shared/gamification';
import { useStore } from '../hooks';
import { store } from '../lib/store';
import { confetti, now, vibrate } from '../lib/util';
import { t, uiLang } from '../i18n';
import { RankBadge } from './ui';
import { ShareSheet, type ShareWhat } from './Share';
import { MiniAvatar } from './Cheers';
import { earnedBreakdown, fmtMoney, SupporterBreakdownList } from './Totals';
import { cheerLine, isMessage, reactionText, useCheers, useMarkCheersSeen } from '../lib/supporters';
import { earnedLine, earnedWhat, rewardText, useMyRewards } from '../lib/rewards';
import { api } from '../lib/api';
import { useQueryClient } from '@tanstack/react-query';

type Moment = { kind: 'level'; level: number; newRank: boolean } | { kind: 'badge'; id: string };

let audio: AudioContext | null = null;
export function fanfare(big = true) {
  try {
    audio = audio || new AudioContext();
    const notes = big ? [523.25, 659.25, 783.99, 1046.5] : [659.25, 987.77];
    notes.forEach((f, i) => {
      const o = audio!.createOscillator(), g = audio!.createGain(), t0 = audio!.currentTime + i * 0.11;
      o.type = 'triangle'; o.frequency.value = f; g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.18, t0 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.45);
      o.connect(g).connect(audio!.destination); o.start(t0); o.stop(t0 + 0.5);
    });
  } catch { /* no audio – fine */ }
}

export function Celebrations() {
  const d = useStore(), loc = useLocation();
  const [m, setM] = useState<Moment | null>(null), [share, setShare] = useState<ShareWhat | null>(null);
  const busy = /^\/(practice|welcome|join)/.test(loc.pathname) || loc.search.includes('unbox=1');
  const cheers = useCheers(), markSeen = useMarkCheersSeen(), [closedTop, setClosedTop] = useState('');
  const freshTop = (cheers.data || []).find(c => !c.seen)?.id || '';
  const rewards = useMyRewards(!!store.userId), qc = useQueryClient(), [closedRw, setClosedRw] = useState('');
  const freshRw = (rewards.data?.earned || []).filter(e => !e.seen);
  const topRw = freshRw[0]?.id || '';
  useEffect(() => { if (topRw && topRw !== closedRw && !busy) { confetti(); setTimeout(confetti, 600); vibrate([40, 60, 40, 60, 120]); if (d.settings.sound) fanfare(true); } }, [topRw, busy]); // eslint-disable-line react-hooks/exhaustive-deps
  const closeRewards = async () => {
    setClosedRw(topRw);
    await api('/api/rewards/seen', { body: {} }).catch(() => undefined);
    qc.setQueryData(['rewards'], (old: typeof rewards.data) => old && { ...old, earned: old.earned.map(e => ({ ...e, seen: true })) });
  };
  useEffect(() => { if (freshTop && freshTop !== closedTop && !busy && loc.pathname !== '/me') { confetti(); vibrate([20, 40, 20]); } }, [freshTop, busy]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (m || share || busy) return;
    const p = store.progress(), s = d.settings, recent = (at: number) => now() - at < 20 * 60e3;
    const fresh = p.badges.filter(b => !s.ackBadges.includes(b.id));
    const lastXp = p.events.length ? p.events[p.events.length - 1].at : 0;
    if (p.level > s.ackLevel) {
      if (recent(lastXp)) {
        const prevRank = rankFor(s.ackLevel);
        setM({ kind: 'level', level: p.level, newRank: rankFor(p.level).id !== prevRank.id });
      }
      store.setSettings({ ackLevel: p.level });
      return;
    }
    if (fresh.length) {
      const show = fresh.find(b => recent(b.at));
      store.setSettings({ ackBadges: [...s.ackBadges, ...(show ? [show.id] : fresh.map(b => b.id))] });
      if (show) setM({ kind: 'badge', id: show.id });
    }
  }, [d, m, share, busy]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!m) return;
    confetti(); vibrate([30, 60, 30, 60, 90]);
    const id = setTimeout(confetti, 700);
    if (d.settings.sound) fanfare(m.kind === 'level');
    return () => clearTimeout(id);
  }, [m]); // eslint-disable-line react-hooks/exhaustive-deps
  if (share) return <ShareSheet what={share} onClose={() => setShare(null)} />;
  if (!m && freshRw.length && !busy && topRw !== closedRw) {
    const e = freshRw[0], paid = e.status === 'paid';
    const bd = earnedBreakdown(freshRw.filter(x => x.status === e.status));
    return (
      <div className="celebrate reward-pop" data-testid="reward-pop">
        <div className="cheer-float" aria-hidden>{Array.from({ length: 22 }, (_, i) => <span key={i} style={{ ['--i' as string]: i, ['--x' as string]: (i * 41) % 100 }}>{['🎁', '🎉', '⭐', e.reward.type === 'money' ? '💶' : '🍕'][i % 4]}</span>)}</div>
        <div className="cel-rays" aria-hidden /><div className="cel-inner">
          <p className="cel-kicker">{paid ? '✅ ' + t('reward_pop_paid') : '🎁 ' + t('reward_pop_title')}</p>
          <div className="cheer-avs">{bd.perSupporter.slice(0, 4).map(x => <MiniAvatar key={x.supporter.id} src={x.supporter.avatar} name={x.supporter.name} size={bd.perSupporter.length > 1 ? 64 : 84} />)}</div>
          <div className="reward-amount" data-testid="reward-pop-amount">{bd.grand.length ? fmtMoney(bd.grand) : rewardText(e.reward)}</div>
          <h2 className="cel-title sm" data-testid="reward-pop-line">{freshRw.length === 1 ? earnedLine(e) : t('reward_pop_multi', { n: freshRw.length, s: bd.perSupporter.length })}</h2>
          {freshRw.length === 1 ? <p className="cel-sub">{t('given_for', { what: earnedWhat(e) })}</p> : <div className="pop-breakdown"><SupporterBreakdownList b={bd} sys={store.data.settings.grading} testid="reward-pop-breakdown" /></div>}
          <p className="cel-note">🤝 {t('rewards_disclaimer')}</p>
          <div className="row-btns"><button className="btn start" autoFocus data-testid="reward-ok" onClick={() => void closeRewards()}>🎉 {t('awesome')}</button></div>
        </div>
      </div>);
  }
  const fresh = (cheers.data || []).filter(c => !c.seen);
  if (!m && fresh.length && !busy && fresh[0].id !== closedTop && loc.pathname !== '/me') {
    const c = fresh[0], emojis = [...new Set(fresh.filter(x => !isMessage(x.reaction)).map(x => x.reaction))].slice(0, 8);
    return (
      <div className="celebrate cheer-pop" data-testid="cheer-pop">
        <div className="cheer-float" aria-hidden>{Array.from({ length: 18 }, (_, i) => <span key={i} style={{ ['--i' as string]: i, ['--x' as string]: (i * 37) % 100 }}>{(emojis.length ? emojis : ['🎉'])[i % Math.max(1, emojis.length)]}</span>)}</div>
        <div className="cel-inner">
          <p className="cel-kicker">📣 {t('cheer_pop_title')}</p>
          <div className="cheer-avs">{[...new Map(fresh.map(x => [x.from.id, x.from])).values()].slice(0, 4).map(f => <MiniAvatar key={f.id} src={f.avatar} name={f.name} size={64} />)}</div>
          <h2 className="cel-title sm" data-testid="cheer-pop-line">{cheerLine(c, id => store.test(id)?.name || null)}</h2>
          <p className="cel-emojis">{fresh.filter(x => x.from.id === c.from.id && x.targetId === c.targetId).map(x => reactionText(x.reaction)).join(' ')}</p>
          {fresh.length > 1 && <p className="cel-sub">{t('cheer_pop_more', { n: fresh.length - 1 })}</p>}
          <div className="row-btns"><button className="btn start" autoFocus data-testid="cheer-ok" onClick={() => { setClosedTop(fresh[0].id); void markSeen(); }}>💚 {t('awesome')}</button></div>
        </div>
      </div>);
  }
  if (!m) return null;
  const L = uiLang();
  if (m.kind === 'level') {
    const rank = rankFor(m.level), next = RANKS.find(r => r.level > m.level);
    return (
      <div className="celebrate" data-testid="levelup" style={{ ['--c1' as string]: rank.c1, ['--c2' as string]: rank.c2, ['--glow' as string]: rank.glow }}>
        <div className="cel-rays" aria-hidden /><div className="cel-inner">
          <p className="cel-kicker">{m.newRank ? t('new_rank') : t('level_up')}</p>
          <div className="cel-badge"><RankBadge rank={rank} size={190} /></div>
          <h2 className="cel-title">{t('lvl')} {m.level}</h2>
          <p className="cel-rank">{rank.name[L]}</p>
          <p className="cel-sub">{m.newRank ? t('new_rank_sub') : next ? t('next_rank_at', { rank: next.name[L], n: next.level }) : t('max_rank')}</p>
          <div className="row-btns"><button className="btn ghost-light" data-testid="cel-share" onClick={() => { setM(null); setShare({ kind: 'level' }); }}>📤 {t('share')}</button><button className="btn start" autoFocus data-testid="cel-ok" onClick={() => setM(null)}>{t('awesome')}</button></div>
        </div>
      </div>);
  }
  const b = badgeDef(m.id)!, rank = store.progress().rank;
  return (
    <div className="celebrate badge" data-testid="badge-unlock" style={{ ['--c1' as string]: rank.c1, ['--c2' as string]: rank.c2, ['--glow' as string]: rank.glow }}>
      <div className="cel-rays" aria-hidden /><div className="cel-inner">
        <p className="cel-kicker">{t('badge_unlocked')}</p>
        <div className="cel-emoji">{b.icon}</div>
        <h2 className="cel-title">{b.name[L]}</h2>
        <p className="cel-sub">{b.desc[L]}</p>
        <div className="row-btns"><button className="btn ghost-light" onClick={() => { setM(null); setShare({ kind: 'badge', id: b.id }); }}>📤 {t('share')}</button><button className="btn start" autoFocus data-testid="cel-ok" onClick={() => setM(null)}>{t('awesome')}</button></div>
      </div>
    </div>);
}
