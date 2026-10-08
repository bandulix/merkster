/* Small presentational components */
import React from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { APP_NAME } from '../../../shared/brand';
import { t, uiLang } from '../i18n';
import type { User } from '../../../shared/types';
import type { Rank } from '../../../shared/gamification';
import { rankDataUrl } from '../../../shared/rankArt';
import { store } from '../lib/store';
import { useMe, useStore, useSyncStatus, useToasts } from '../hooks';

export function Logo({ size = 32, className = '' }: { size?: number; className?: string }) {
  return <img src="/icons/logo.svg" width={size} height={size} alt="" className={'logo ' + className} />;
}
export function Brand() { return <span className="brand"><Logo size={30} /><b>{APP_NAME}</b></span>; }

export function Ring({ pct, size = 56, stroke = 6, label }: { pct: number; size?: number; stroke?: number; label?: string }) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r, off = c * (1 - Math.max(0, Math.min(100, pct)) / 100);
  return (
    <svg className="ring" width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${pct}%`}>
      <defs><linearGradient id="ringg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#3d5afe" /><stop offset=".55" stopColor="#00c2a8" /><stop offset="1" stopColor="#a6e00f" /></linearGradient></defs>
      <circle cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} className="ring-bg" />
      <circle cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} className="ring-fg" strokeDasharray={c.toFixed(1)} strokeDashoffset={off.toFixed(1)}
        style={{ ['--c' as string]: c.toFixed(1) }} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      <text x="50%" y="52%" dominantBaseline="middle" textAnchor="middle" style={{ fontSize: Math.max(10, size / 4.2) }}>{label ?? pct + '%'}</text>
    </svg>
  );
}

export function TopBar({ title, back, right }: { title: React.ReactNode; back?: string | (() => void); right?: React.ReactNode }) {
  const nav = useNavigate();
  return (
    <header className="top">
      {back ? <button className="icon-btn" aria-label={t('back')} onClick={() => (typeof back === 'function' ? back() : nav(back))}>←</button> : <span />}
      <h1>{title}</h1>
      {right || <span />}
    </header>
  );
}

export function Toasts() {
  const list = useToasts();
  return <div className="toasts" aria-live="polite">{list.map(x => <div key={x.id} className={'toast ' + x.kind}>{x.msg}</div>)}</div>;
}

export function SyncBadge() {
  const s = useSyncStatus();
  if (s === 'idle') return null;
  const label = s === 'ok' ? t('sync_ok') : s === 'pending' ? t('sync_pending') : s === 'offline' ? t('sync_offline') : t('sync_error');
  return <span className={'sync-badge ' + s} title={label} data-testid="sync-status" data-status={s}><i />{label}</span>;
}

const IconToday = () => <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden><path d="M4 11.5 12 4l8 7.5V20a1 1 0 0 1-1 1h-5v-6h-4v6H5a1 1 0 0 1-1-1z" fill="currentColor" /></svg>;
const IconCog = () => <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden><path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Zm8.4 4.6.1-1.1-.1-1.1 2-1.6-2-3.4-2.4 1a8 8 0 0 0-1.9-1.1L15.8 3h-3.9l-.4 2.6a8 8 0 0 0-1.9 1.1l-2.4-1-2 3.4 2 1.6-.1 1.1.1 1.1-2 1.6 2 3.4 2.4-1a8 8 0 0 0 1.9 1.1l.4 2.6h3.9l.4-2.6a8 8 0 0 0 1.9-1.1l2.4 1 2-3.4z" fill="currentColor" /></svg>;

const IconResults = () => <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden><path d="M4 20V10h3.5v10zm6.25 0V4h3.5v16zM16.5 20v-7H20v7z" fill="currentColor" /></svg>;
const IconCheer = () => <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden><path d="M3 10v4a1 1 0 0 0 1 1h2l5 4V5L6 9H4a1 1 0 0 0-1 1Zm13.5 2a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4ZM14 3.2v2.1a7 7 0 0 1 0 13.4v2.1a9 9 0 0 0 0-17.6Z" fill="currentColor" /></svg>;
const IconMe = () => <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden><path d="m12 2 2.6 5.6 6.1.7-4.5 4.2 1.2 6.1L12 15.6l-5.4 3 1.2-6.1-4.5-4.2 6.1-.7z" fill="currentColor" /></svg>;

/** bottom tab bar on phones, sidebar on desktop (same component, CSS decides) */
export function Nav({ mode = 'student', unseen = 0, rewardDot = 0 }: { mode?: 'student' | 'supporter' | 'both'; unseen?: number; rewardDot?: number }) {
  const student = mode !== 'supporter';
  return (
    <nav className={'nav nav-' + mode} aria-label="Main">
      <div className="nav-brand"><Brand /></div>
      {student && <NavLink to="/" end className="nav-item" data-testid="nav-today"><IconToday /><span>{t('tab_today')}</span></NavLink>}
      {student && <NavLink to="/results" className="nav-item" data-testid="nav-results"><IconResults /><span>{t('tab_results')}</span></NavLink>}
      {student && <NavLink to="/new" className="nav-item nav-new" data-testid="nav-new" aria-label={t('new_test')}><span className="plus">+</span><span className="nav-new-label">{t('new_test')}</span></NavLink>}
      {mode !== 'student' && <NavLink to="/cheer" className="nav-item" data-testid="nav-cheer"><span className="nav-ic"><IconCheer />{rewardDot > 0 && <i className="nav-dot" data-testid="reward-dot">{rewardDot > 9 ? '9+' : rewardDot}</i>}</span><span>{t('tab_cheer')}</span></NavLink>}
      {student && <NavLink to="/me" className="nav-item" data-testid="nav-me"><span className="nav-ic"><IconMe />{unseen > 0 && <i className="nav-dot" data-testid="cheer-dot">{unseen > 9 ? '9+' : unseen}</i>}</span><span>{t('tab_me')}</span></NavLink>}
      <NavLink to="/settings" className="nav-item" data-testid="nav-settings"><IconCog /><span>{t('tab_settings')}</span></NavLink>
      <div className="nav-foot">{student && <LevelChip />}<SyncBadge /></div>
    </nav>
  );
}

/** rank badge art (hexagon + emblem), generated from shared/rankArt */
export function RankBadge({ rank, size = 48, className = '' }: { rank: Rank; size?: number; className?: string }) {
  return <img src={rankDataUrl(rank)} width={size} height={size} alt={rank.name[uiLang()]} className={'rank-badge ' + className} draggable={false} />;
}
const AV_COLORS: [string, string][] = [['#3d5afe', '#00c2a8'], ['#ff5a36', '#ffd23f'], ['#00c2a8', '#a6e00f'], ['#7a8cff', '#ff5a36'], ['#ffd23f', '#ff5a36'], ['#a6e00f', '#3d5afe'], ['#1c2140', '#3d5afe']];
export const initialsOf = (name: string) => (name || '?').trim().split(/\s+/).map(x => [...x][0] || '').slice(0, 2).join('').toUpperCase() || '?';
export const avatarColors = (name: string) => { let h = 0; for (const ch of name || '?') h = (h * 31 + ch.charCodeAt(0)) >>> 0; return AV_COLORS[h % AV_COLORS.length]; };
/** a profile picture (cached same-origin copy of the Google picture) – colourful initials if there is none or it fails to load */
export function Face({ src, name, size }: { src: string | null | undefined; name: string; size: number }) {
  const [bad, setBad] = React.useState(false);
  React.useEffect(() => setBad(false), [src]);
  if (src && !bad) return <img src={src} alt="" width={size} height={size} onError={() => setBad(true)} data-testid="avatar-img" />;
  const [a, b] = avatarColors(name);
  return <b className="initials" data-testid="avatar-initials" style={{ fontSize: size / 2.6, background: `linear-gradient(135deg, ${a}, ${b})` }}>{initialsOf(name)}</b>;
}
/** profile picture inside a frame in the colours of the current rank */
export function Avatar({ user, rank, size = 44 }: { user: Pick<User, 'name' | 'avatar'> | null; rank: Rank; size?: number }) {
  return (
    <span className={'avatar rank-' + rank.id} style={{ width: size, height: size, ['--c1' as string]: rank.c1, ['--c2' as string]: rank.c2, ['--glow' as string]: rank.glow }}>
      <Face src={user?.avatar} name={user?.name || '?'} size={size} />
    </span>
  );
}
/** compact level + XP indicator */
export function LevelChip() {
  useStore();
  const me = useMe();
  const p = store.progress();
  return (
    <Link to="/me" className="level-chip" data-testid="level-chip" title={`${p.xp} XP`}>
      <Avatar user={me.data?.user || null} rank={p.rank} size={30} /><span><b>{t('lvl')} {p.level}</b><i className="xpbar"><i style={{ width: p.info.pct + '%' }} /></i></span>
      {p.streak.current > 0 && <span className="chip-streak">🔥{p.streak.current}</span>}
    </Link>
  );
}
/** Google sign-in button following Google's branding guidelines (official "G" mark, neutral button, standard wording) */
export function GoogleButton({ href, label }: { href: string; label: string }) {
  return (
    <a className="gsi-btn" href={href} data-testid="google-login">
      <span className="gsi-icon"><svg viewBox="0 0 48 48" width="20" height="20" aria-hidden><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" /><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" /><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" /><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" /></svg></span>
      <span className="gsi-text">{label}</span>
    </a>
  );
}
/** modal sheet (bottom sheet on phones, centred dialog on desktop) */
export function Modal({ children, onClose, className = '', label }: { children: React.ReactNode; onClose: () => void; className?: string; label?: string }) {
  React.useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; document.addEventListener('keydown', k); return () => document.removeEventListener('keydown', k); }, [onClose]);
  return (
    <div className="modal-back" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={'modal pop-in ' + className} role="dialog" aria-modal="true" aria-label={label}>
        <button className="icon-btn modal-x" aria-label={t('close')} onClick={onClose}>✕</button>
        {children}
      </div>
    </div>
  );
}
