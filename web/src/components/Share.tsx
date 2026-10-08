/* Share preview: pick story/square, hide name/grade, then share (Web Share API) or download. */
import { useEffect, useMemo, useState } from 'react';
import type { Test, User } from '../../../shared/types';
import { APP_SLUG } from '../../../shared/brand';
import { badgeDef } from '../../../shared/gamification';
import { fmtResult, toPct } from '../../../shared/grades';
import { useMe } from '../hooks';
import { fmtAvg, type ReportCard } from '../../../shared/reportcards';
import { LOCALE, termName } from '../lib/reportcards';
import { store } from '../lib/store';
import { renderPng, renderVideo, shareFile, videoMime, whatsappLink, type ShareData, type ShareFormat } from '../lib/shareCard';
import { toast } from '../lib/util';
import { subjectName, t, uiLang } from '../i18n';
import { Modal } from './ui';

export type ShareWhat = { kind: 'result'; test: Test; best?: boolean } | { kind: 'level' } | { kind: 'streak' } | { kind: 'badge'; id: string } | { kind: 'week' }
  | { kind: 'report'; card: ReportCard; improved: number; best: boolean; money?: string };

function build(what: ShareWhat, user: User | null, opt: { hideName: boolean; hideGrade: boolean }): ShareData {
  const p = store.progress(), L = uiLang();
  const base = { rank: p.rank, level: p.level, rankName: p.rank.name[L], name: !opt.hideName && user?.name ? user.name.split(/\s+/)[0] : null, avatar: !opt.hideName ? user?.avatar || null : null, invite: t('share_invite'), url: location.host };
  switch (what.kind) {
    case 'result': {
      const r = what.test.result!, pct = Math.round(toPct(r));
      return { ...base, kind: 'result', kicker: what.best ? t('share_k_best') : t('share_k_result'), hero: opt.hideGrade ? (pct >= 50 ? '✅' : '💪') : fmtResult(r), heroSub: `${subjectName(what.test.subject)} · ${what.test.name}`, stats: practiceStats(what.test) };
    }
    case 'level': return { ...base, kind: 'level', kicker: t('share_k_level'), hero: `${t('lvl')} ${p.level}`, heroSub: p.rank.name[L], stats: [[t('xp'), String(p.xp)], [t('streak'), '🔥 ' + p.streak.current], [t('badges'), String(p.badges.length)]] };
    case 'streak': return { ...base, kind: 'streak', emoji: '🔥', kicker: t('share_k_streak'), hero: t('n_days', { n: p.streak.current }), heroSub: t('share_streak_sub'), stats: [[t('best_streak'), String(p.streak.best)], [t('freezes'), '🧊 ' + p.streak.freezes], [t('lvl'), String(p.level)]] };
    case 'badge': { const b = badgeDef(what.id)!; return { ...base, kind: 'badge', emoji: b.icon, kicker: t('share_k_badge'), hero: b.name[L], heroSub: b.desc[L], stats: [[t('badges'), String(p.badges.length)], [t('lvl'), String(p.level)]] }; }
    case 'report': {
      const c = what.card, stats: [string, string][] = [[t('report_card'), t('rc_n_subjects', { n: c.lines.length })]];
      if (what.improved) stats.push(['▲', t('rc_improved_n', { n: what.improved })]);
      if (what.money && !opt.hideGrade) stats.push(['🎁', what.money]);
      return { ...base, kind: 'report', emoji: '📜', kicker: what.best ? t('rc_best_yet') : t('rc_unbox_kicker'), hero: opt.hideGrade ? (what.improved ? '📈 +' + what.improved : '📜') : 'Ø ' + fmtAvg(c.system, c.avgScore, LOCALE()), heroSub: termName(c), stats };
    }
    case 'week': return { ...base, kind: 'week', emoji: '📅', kicker: t('share_k_week'), hero: t('n_min', { n: p.week.activeMin }), heroSub: t('share_week_sub', { s: p.week.sessions, d: p.week.days }), stats: [[t('recalls'), String(p.week.correct)], [t('xp'), '+' + p.week.xp], [t('streak'), '🔥 ' + p.streak.current]] };
  }
}
function practiceStats(test: Test): [string, string][] {
  const hs = store.data.history.filter(h => (h.tests || []).includes(test.id) && h.day <= test.testDate);
  const min = Math.round(hs.reduce((n, h) => n + (h.activeMs ?? h.ms) / Math.max(1, (h.tests || []).length), 0) / 60000);
  return [[t('sessions'), String(hs.length)], [t('days_practised'), String(new Set(hs.map(h => h.day)).size)], [t('minutes'), String(min)]];
}

export function ShareSheet({ what, onClose }: { what: ShareWhat; onClose: () => void }) {
  const me = useMe();
  const [fmt, setFmt] = useState<ShareFormat>('story');
  const [hideName, setHideName] = useState(true), [hideGrade, setHideGrade] = useState(false);
  const [url, setUrl] = useState<string | null>(null), [blob, setBlob] = useState<Blob | null>(null), [busy, setBusy] = useState<string | null>(null);
  const data = useMemo(() => build(what, me.data?.user || null, { hideName, hideGrade }), [what, me.data, hideName, hideGrade]);
  useEffect(() => {
    let alive = true, u: string | null = null;
    renderPng(fmt, data).then(b => { if (!alive) return; u = URL.createObjectURL(b); setBlob(b); setUrl(u); }).catch(e => console.warn('share render failed', e));
    return () => { alive = false; if (u) URL.revokeObjectURL(u); };
  }, [fmt, data]);
  const text = `${data.kicker}: ${data.hero} – ${t('share_invite')} ${location.origin}`;
  const fname = (ext: string) => `${APP_SLUG}-${what.kind}-${fmt}.${ext}`;
  const doShare = async (b: Blob, ext: string) => {
    const r = await shareFile(b, fname(ext), text);
    if (r === 'downloaded') toast(t('share_downloaded'), 'ok');
  };
  const anim = async () => {
    setBusy('video');
    try { const v = await renderVideo(fmt, data); if (v) await doShare(v, v.type.includes('mp4') ? 'mp4' : 'webm'); else { toast(t('share_no_video')); if (blob) await doShare(blob, 'png'); } }
    finally { setBusy(null); }
  };
  return (
    <Modal onClose={onClose} className="share-modal" label={t('share')}>
      <h2>{t('share')}</h2>
      <div className="seg">{(['story', 'square'] as const).map(f => <button key={f} className={'pill' + (fmt === f ? ' on' : '')} data-testid={'fmt-' + f} onClick={() => setFmt(f)}>{f === 'story' ? '📱 ' + t('share_story') : '⬛ ' + t('share_square')}</button>)}</div>
      <div className={'share-preview ' + fmt}>{url ? <img src={url} alt={t('share_preview')} data-testid="share-preview" /> : <div className="spinner" />}</div>
      <div className="share-opts">
        <label className="toggle"><input type="checkbox" checked={hideName} onChange={e => setHideName(e.target.checked)} data-testid="hide-name" /><span>{t('share_hide_name')}</span></label>
        {(what.kind === 'result' || what.kind === 'report') && <label className="toggle"><input type="checkbox" checked={hideGrade} onChange={e => setHideGrade(e.target.checked)} data-testid="hide-grade" /><span>{what.kind === 'report' ? t('rc_hide_grades') : t('share_hide_grade')}</span></label>}
        <p className="muted small">🔒 {t('share_privacy')}</p>
      </div>
      <div className="row-btns wrap">
        <button className="btn primary big" disabled={!blob || !!busy} data-testid="share-png" onClick={() => blob && doShare(blob, 'png')}>📤 {t('share_image')}</button>
        {videoMime() && <button className="btn ghost" disabled={!!busy} data-testid="share-video" onClick={anim}>{busy === 'video' ? '⏳ ' + t('share_rendering') : '🎬 ' + t('share_video')}</button>}
        <a className="btn ghost" href={whatsappLink(text)} target="_blank" rel="noopener noreferrer">💬 WhatsApp</a>
      </div>
    </Modal>
  );
}
