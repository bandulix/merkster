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
  const busy = /^\/(practice|welcome)/.test(loc.pathname);
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
