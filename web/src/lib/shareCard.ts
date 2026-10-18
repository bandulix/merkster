/* Share cards: brand-styled PNGs (story 1080×1920, square 1080×1080) and a short animated clip,
   rendered on a <canvas> in the browser. Privacy: no e-mail ever; name and grade can be hidden. */
import { APP_NAME } from '../../../shared/brand';
import type { Rank } from '../../../shared/gamification';
import { rankDataUrl } from '../../../shared/rankArt';

export type ShareFormat = 'story' | 'square';
export interface ShareData {
  kind: 'result' | 'level' | 'streak' | 'badge' | 'week' | 'report';
  kicker: string;            // small line above the hero ("NEW PERSONAL BEST")
  hero: string;              // big text ("2+", "Level 7", "14")
  heroSub: string;           // under the hero ("Biology · Cells")
  emoji?: string;            // for badges/streaks
  rank: Rank; level: number; rankName: string;
  stats?: [string, string][];
  name?: string | null;      // first name (optional)
  avatar?: string | null;    // same-origin profile picture URL – only when the name is shown
  invite: string;            // "Learn it and earn the reward with Merkster"
  url: string;               // origin of this server (no profile link)
}
export const SIZES: Record<ShareFormat, [number, number]> = { story: [1080, 1920], square: [1080, 1080] };
const FONT = '"Plus Jakarta Sans", system-ui, sans-serif';

const imgCache = new Map<string, Promise<HTMLImageElement>>();
function loadImg(src: string) {
  if (!imgCache.has(src)) imgCache.set(src, new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; }));
  return imgCache.get(src)!;
}
const ease = (x: number) => 1 - Math.pow(1 - Math.max(0, Math.min(1, x)), 3);
const seg = (t: number, a: number, b: number) => ease((t - a) / (b - a));
function rr(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) { c.beginPath(); c.roundRect(x, y, w, h, r); }
function fitText(c: CanvasRenderingContext2D, text: string, max: number, weight: number, size: number) {
  let s = size; do { c.font = `${weight} ${s}px ${FONT}`; s -= 4; } while (c.measureText(text).width > max && s > 20); return s + 4;
}
// deterministic sparkles
const SPARKS = Array.from({ length: 46 }, (_, i) => { const r = Math.sin(i * 999.7) * 10000; const f = r - Math.floor(r); const g = Math.sin(i * 77.1) * 10000; return { x: f, y: g - Math.floor(g), s: 1.5 + (i % 5), p: i * 0.37 }; });

/** draw one frame; t = animation progress (1 = final still) */
export async function drawCard(c: CanvasRenderingContext2D, fmt: ShareFormat, d: ShareData, t = 1) {
  const [W, H] = SIZES[fmt], story = fmt === 'story';
  const [logo, badge] = await Promise.all([loadImg('/icons/logo.svg'), loadImg(rankDataUrl(d.rank))]);
  // background
  const bg = c.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#0d0f1e'); bg.addColorStop(0.6, '#1c2140'); bg.addColorStop(1, '#14204f');
  c.fillStyle = bg; c.fillRect(0, 0, W, H);
  const glow = (x: number, y: number, r: number, col: string) => { const g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(0, 0, W, H); };
  glow(W * 0.15, H * 0.12, W * 0.7, 'rgba(198, 244, 50, .20)');
  glow(W * 0.95, H * 0.85, W * 0.8, 'rgba(61, 90, 254, .40)');
  glow(W * 0.05, H * 0.95, W * 0.5, 'rgba(255, 90, 54, .22)');
  glow(W * 0.5, H * (story ? 0.42 : 0.45), W * 0.55, d.rank.c1 + '55');
  for (const s of SPARKS) { const tw = 0.4 + 0.6 * Math.abs(Math.sin(s.p + t * 6)); c.globalAlpha = tw * 0.8; c.fillStyle = '#fff'; c.beginPath(); c.arc(s.x * W, s.y * H, s.s, 0, 7); c.fill(); }
  c.globalAlpha = 1;
  // header: logo + name
  const top = story ? 120 : 70, a0 = seg(t, 0, 0.25);
  c.globalAlpha = a0;
  c.drawImage(logo, 70, top - 6, 92, 92);
  c.fillStyle = '#fff'; c.font = `800 60px ${FONT}`; c.textBaseline = 'middle'; c.textAlign = 'left';
  c.fillText(APP_NAME, 182, top + 40);
  if (d.name) {
    // profile picture in a rank-coloured ring (or colourful initials), name next to it
    const r = 46, cx = W - 70 - r, cyA = top + 40;
    const ring = c.createLinearGradient(cx - r, cyA - r, cx + r, cyA + r); ring.addColorStop(0, d.rank.c1); ring.addColorStop(1, d.rank.glow);
    c.fillStyle = ring; c.beginPath(); c.arc(cx, cyA, r + 6, 0, 7); c.fill();
    const face = d.avatar ? await loadImg(d.avatar).catch(() => null) : null;
    c.save(); c.beginPath(); c.arc(cx, cyA, r, 0, 7); c.clip();
    if (face) c.drawImage(face, cx - r, cyA - r, r * 2, r * 2);
    else { const g = c.createLinearGradient(cx - r, cyA - r, cx + r, cyA + r); g.addColorStop(0, '#3d5afe'); g.addColorStop(1, '#00c2a8'); c.fillStyle = g; c.fillRect(cx - r, cyA - r, r * 2, r * 2);
      c.fillStyle = '#fff'; c.font = `800 40px ${FONT}`; c.textAlign = 'center'; c.fillText(([...d.name][0] || '?').toUpperCase(), cx, cyA + 2); }
    c.restore();
    c.textAlign = 'right'; c.font = `700 40px ${FONT}`; c.fillStyle = 'rgba(255,255,255,.85)'; c.fillText(d.name, cx - r - 24, top + 40);
  }
  c.globalAlpha = 1;
  // hero
  const cy = story ? 760 : 470, a1 = seg(t, 0.12, 0.45), sc = 0.6 + 0.4 * ease((t - 0.12) / 0.35);
  c.save(); c.translate(W / 2, cy); c.scale(sc, sc); c.globalAlpha = a1;
  const bs = story ? 420 : 300;
  // light rays behind the badge
  c.save(); c.rotate(t * 0.8); c.globalAlpha = a1 * 0.25;
  for (let i = 0; i < 16; i++) { c.rotate(Math.PI / 8); c.fillStyle = d.rank.glow; c.beginPath(); c.moveTo(0, 0); c.lineTo(-24, -bs); c.lineTo(24, -bs); c.closePath(); c.fill(); }
  c.restore(); c.globalAlpha = a1;
  if (d.emoji) {
    c.drawImage(badge, -bs / 2, -bs / 2, bs, bs);
    c.font = `${bs * 0.42}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillStyle = 'rgba(0,0,0,.25)'; c.beginPath(); c.arc(0, 0, bs * 0.3, 0, 7); c.fill();
    c.fillStyle = '#fff'; c.fillText(d.emoji, 0, bs * 0.03);
  } else c.drawImage(badge, -bs / 2, -bs / 2, bs, bs);
  c.restore();
  // texts
  const ty = cy + (story ? 330 : 225), a2 = seg(t, 0.35, 0.65);
  c.globalAlpha = a2; c.textAlign = 'center'; c.textBaseline = 'alphabetic';
  c.fillStyle = '#c6f432'; c.font = `800 ${story ? 44 : 36}px ${FONT}`; c.fillText(d.kicker.toUpperCase(), W / 2, ty);
  const hs = fitText(c, d.hero, W - 140, 900, story ? 170 : 120);
  c.font = `900 ${hs}px ${FONT}`; c.fillStyle = '#fff'; c.fillText(d.hero, W / 2, ty + (story ? 175 : 125));
  c.font = `600 ${fitText(c, d.heroSub, W - 160, 600, story ? 48 : 40)}px ${FONT}`; c.fillStyle = 'rgba(255,255,255,.85)';
  c.fillText(d.heroSub, W / 2, ty + (story ? 260 : 190));
  c.globalAlpha = 1;
  // stats row (story only, or square if room)
  if (d.stats?.length && story) {
    const a3 = seg(t, 0.55, 0.85), n = d.stats.length, gw = (W - 140 - (n - 1) * 24) / n, y = 1420;
    c.globalAlpha = a3;
    d.stats.forEach(([label, val], i) => {
      const x = 70 + i * (gw + 24);
      c.fillStyle = 'rgba(255,255,255,.1)'; rr(c, x, y, gw, 170, 36); c.fill();
      c.textAlign = 'center'; c.fillStyle = '#fff'; c.font = `800 ${fitText(c, val, gw - 30, 800, 64)}px ${FONT}`; c.fillText(val, x + gw / 2, y + 85);
      c.fillStyle = 'rgba(255,255,255,.7)'; c.font = `600 30px ${FONT}`; c.fillText(label, x + gw / 2, y + 135);
    });
    c.globalAlpha = 1;
  }
  // rank pill
  const a4 = seg(t, 0.5, 0.8), py = story ? 1660 : 905;
  c.globalAlpha = a4; c.font = `800 38px ${FONT}`;
  const pill = `${d.rankName} · Lv ${d.level}`, pw = c.measureText(pill).width + 120;
  const pg = c.createLinearGradient(W / 2 - pw / 2, 0, W / 2 + pw / 2, 0); pg.addColorStop(0, d.rank.c1); pg.addColorStop(1, d.rank.c2);
  c.fillStyle = pg; rr(c, W / 2 - pw / 2, py, pw, 80, 40); c.fill();
  c.drawImage(badge, W / 2 - pw / 2 + 14, py + 8, 64, 64);
  c.fillStyle = '#fff'; c.textAlign = 'left'; c.textBaseline = 'middle'; c.fillText(pill, W / 2 - pw / 2 + 92, py + 42);
  c.globalAlpha = 1;
  // footer: invite + url
  c.globalAlpha = seg(t, 0.6, 0.95); c.textAlign = 'center'; c.textBaseline = 'alphabetic';
  c.fillStyle = '#fff'; c.font = `700 ${story ? 40 : 32}px ${FONT}`; c.fillText(d.invite, W / 2, H - (story ? 110 : 60) - (story ? 0 : 0));
  c.fillStyle = 'rgba(255,255,255,.6)'; c.font = `600 ${story ? 32 : 26}px ${FONT}`; c.fillText(d.url, W / 2, H - (story ? 60 : 24));
  c.globalAlpha = 1;
}

async function fontsReady() { try { await Promise.all([document.fonts.load(`900 100px ${FONT}`), document.fonts.load(`600 40px ${FONT}`)]); } catch { /* fall back to system font */ } }

export async function renderPng(fmt: ShareFormat, d: ShareData): Promise<Blob> {
  await fontsReady();
  const [W, H] = SIZES[fmt], cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  await drawCard(cv.getContext('2d')!, fmt, d, 1);
  return new Promise((res, rej) => cv.toBlob(b => (b ? res(b) : rej(new Error('toBlob failed'))), 'image/png'));
}

export function videoMime(): string | null {
  if (typeof MediaRecorder === 'undefined' || !HTMLCanvasElement.prototype.captureStream) return null;
  for (const m of ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']) if (MediaRecorder.isTypeSupported(m)) return m;
  return null;
}
/** ~4 s animated clip (MP4 where the browser can record it, else WebM). null = not supported -> use the PNG */
export async function renderVideo(fmt: ShareFormat, d: ShareData, seconds = 4): Promise<Blob | null> {
  const mime = videoMime(); if (!mime) return null;
  await fontsReady();
  const [W, H] = SIZES[fmt], cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const c = cv.getContext('2d')!;
  await drawCard(c, fmt, d, 0);
  const stream = cv.captureStream(30), rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 6_000_000 });
  const chunks: Blob[] = []; rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
  const done = new Promise<void>(r => { rec.onstop = () => r(); });
  rec.start(250);
  const t0 = performance.now(), total = seconds * 1000;
  await new Promise<void>(resolve => {
    const frame = async () => {
      const el = performance.now() - t0;
      await drawCard(c, fmt, d, Math.min(1, el / (total * 0.7)));   // animate in, then hold the final frame
      if (el < total) requestAnimationFrame(frame); else resolve();
    };
    requestAnimationFrame(frame);
  });
  rec.stop(); await done; stream.getTracks().forEach(tr => tr.stop());
  return new Blob(chunks, { type: mime.split(';')[0] });
}

/** Web Share API Level 2 (files) on phones -> WhatsApp, Instagram, TikTok, Telegram…; otherwise download */
export async function shareFile(blob: Blob, filename: string, text: string): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const file = new File([blob], filename, { type: blob.type });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], text }); return 'shared'; }
    catch (e) { if ((e as Error).name === 'AbortError') return 'cancelled'; }
  }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
  return 'downloaded';
}
export const whatsappLink = (text: string) => 'https://wa.me/?text=' + encodeURIComponent(text);
