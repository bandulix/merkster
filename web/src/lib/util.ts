/* Small shared helpers (time, speech, haptics, confetti, formatting) */
import type { Lang, Test } from '../../../shared/types';
import { LANGS, t, tp, uiLang } from '../i18n';
import { stripPlural } from './check';
import * as S from './schedule';

declare global { interface Window { __mkClockOffset?: number } }
/** current time – tests can shift the clock via window.__mkClockOffset (ms) */
export const now = () => Date.now() + (typeof window !== 'undefined' && window.__mkClockOffset ? window.__mkClockOffset : 0);

/** random id matching the server's ID_RE */
export function uid(): string {
  const b = new Uint8Array(9); crypto.getRandomValues(b);
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export const isLong = (s: string) => String(s || '').trim().split(/\s+/).length > 4 || String(s || '').length > 34;

let voices: SpeechSynthesisVoice[] = [];
if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  const load = () => { try { voices = speechSynthesis.getVoices() || []; } catch { voices = []; } };
  load(); speechSynthesis.onvoiceschanged = load;
}
export const canSpeak = () => typeof window !== 'undefined' && 'speechSynthesis' in window;
export function speak(text: string, lang: Lang | null | undefined) {
  if (!canSpeak() || !text) return;
  try {
    const clean = stripPlural(String(text)).replace(/\b(sb|sth|jdn|jdm|etw)\b\.?/g, '').trim();
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(clean);
    const code = (lang && LANGS[lang]?.tts) || 'en-GB';
    u.lang = code; u.rate = 0.92;
    const v = voices.find(x => x.lang === code) || voices.find(x => x.lang && x.lang.slice(0, 2) === code.slice(0, 2));
    if (v) u.voice = v;
    speechSynthesis.speak(u);
  } catch { /* ignore */ }
}
export const vibrate = (p: number | number[]) => { try { navigator.vibrate?.(p); } catch { /* ignore */ } };

export function confetti() {
  const box = document.createElement('div');
  box.className = 'confetti';
  const colors = ['#c6f432', '#ff5a36', '#3d5afe', '#00c2a8', '#ffd23f', '#ffffff'];
  for (let i = 0; i < 70; i++) {
    const p = document.createElement('i');
    p.style.left = Math.random() * 100 + '%';
    p.style.background = colors[i % colors.length];
    p.style.animationDelay = Math.random() * 0.4 + 's';
    p.style.animationDuration = 1.6 + Math.random() * 1.2 + 's';
    p.style.setProperty('--r', Math.random() * 360 + 'deg');
    if (i % 3 === 0) p.style.borderRadius = '50%';
    box.appendChild(p);
  }
  const host = document.querySelector('.celebrate');
  (host || document.body).appendChild(box);
  setTimeout(() => box.remove(), 3500);
}

/** Session length for a stat chip: clock under a minute, otherwise whole minutes. */
export function fmtDur(ms: number): string {
  const sec = Math.max(0, Math.round((ms || 0) / 1000));
  if (sec < 60) return `0:${String(sec).padStart(2, '0')}`;
  return tp('dur_min', Math.max(1, Math.round(sec / 60)));
}

const loc = () => (uiLang() === 'de' ? 'de-DE' : 'en-GB');
export const fmtTime = (ts: number) => new Date(ts).toLocaleTimeString(loc(), { hour: '2-digit', minute: '2-digit' });
export const fmtDay = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString(loc(), { weekday: 'short', day: 'numeric', month: 'short' }); };
export function fmtWhen(ts: number) {
  const dd = S.daysBetween(S.dayISO(now()), S.dayISO(ts));
  if (dd <= 0) return t('when_today', { time: fmtTime(ts) });
  if (dd === 1) return t('when_tomorrow');
  return fmtDay(S.dayISO(ts));
}
export function countdown(test: Pick<Test, 'testDate'>): { cls: string; label: string } {
  const dl = S.daysLeft(test, now());
  if (dl < 0) return { cls: 'past', label: t('cd_past') };
  if (dl === 0) return { cls: 'today', label: t('cd_today') };
  if (dl === 1) return { cls: 'soon', label: t('cd_tomorrow') };
  return { cls: dl <= 3 ? 'soon' : '', label: tp('cd_days', dl) };
}
export function download(filename: string, text: string, type = 'application/json') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type })); a.download = filename;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
export function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[data-src="${src}"]`)) return resolve();
    const s = document.createElement('script');
    s.src = src; s.dataset.src = src; s.onload = () => resolve(); s.onerror = () => reject(new Error('Could not load ' + src));
    document.head.appendChild(s);
  });
}

/* tiny toast bus – single queue, dedupe by message+kind, clearable on route change */
type Toast = { id: number; msg: string; kind: '' | 'ok' | 'bad'; timer?: ReturnType<typeof setTimeout> };
let toasts: Toast[] = [], tid = 0; const tl = new Set<() => void>();
const notify = () => tl.forEach(f => f());
export const toastStore = { get: () => toasts, sub: (f: () => void) => { tl.add(f); return () => { tl.delete(f); }; } };
export function clearToasts() {
  for (const x of toasts) if (x.timer) clearTimeout(x.timer);
  if (!toasts.length) return;
  toasts = [];
  notify();
}
export function toast(msg: string, kind: Toast['kind'] = '') {
  const dup = toasts.find(x => x.msg === msg && x.kind === kind);
  if (dup) {
    if (dup.timer) clearTimeout(dup.timer);
    dup.timer = setTimeout(() => { toasts = toasts.filter(x => x.id !== dup.id); notify(); }, 3000);
    return;
  }
  const item: Toast = { id: ++tid, msg, kind };
  item.timer = setTimeout(() => { toasts = toasts.filter(x => x.id !== item.id); notify(); }, 3000);
  toasts = [...toasts, item];
  notify();
}
