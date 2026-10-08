/* Rank badge art: one SVG per rank (hexagon frame in the rank colours + an emblem).
   Pure strings so the same art renders in React, in <img> (data: URL), on share-card canvases and in brand/ranks/*.svg. */
import { RANKS, type Rank } from './gamification';

const star = (cx: number, cy: number, n: number, ro: number, ri: number, rot = -90) => {
  const pts: string[] = [];
  for (let i = 0; i < n * 2; i++) { const r = i % 2 ? ri : ro, a = (rot + i * 180 / n) * Math.PI / 180; pts.push(`${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`); }
  return `<polygon points="${pts.join(' ')}" fill="#fff" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/>`;
};
const EMBLEM: Record<string, (c: string) => string> = {
  rookie: () => `<circle cx="50" cy="52" r="13" fill="#fff"/><circle cx="50" cy="52" r="22" fill="none" stroke="#fff" stroke-width="3" stroke-dasharray="4 6" opacity=".8"/><circle cx="71" cy="44" r="4" fill="#fff"/>`,
  spark: () => star(50, 50, 4, 25, 8) + `<circle cx="70" cy="30" r="3" fill="#fff"/><circle cx="31" cy="69" r="2.5" fill="#fff"/>`,
  comet: () => `<path d="M58 44 L24 74" stroke="#fff" stroke-width="7" stroke-linecap="round" opacity=".45"/><path d="M60 50 L32 74" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity=".7"/><path d="M52 40 L30 58" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".6"/><circle cx="62" cy="40" r="12" fill="#fff"/>`,
  rocket: c => `<path d="M50 20 C63 30 66 47 61 62 L39 62 C34 47 37 30 50 20Z" fill="#fff"/><circle cx="50" cy="40" r="6" fill="${c}"/><path d="M39 52 L29 66 L39 62Z M61 52 L71 66 L61 62Z" fill="#fff"/><path d="M43 65 L50 81 L57 65Z" fill="#fde047"/>`,
  satellite: () => `<circle cx="50" cy="50" r="14" fill="#fff"/><ellipse cx="50" cy="50" rx="28" ry="9" fill="none" stroke="#fff" stroke-width="4" transform="rotate(-22 50 50)"/><circle cx="74" cy="34" r="3.5" fill="#fff"/>`,
  nova: () => star(50, 50, 8, 26, 11) + `<circle cx="50" cy="50" r="7" fill="#fde047"/>`,
  pulsar: () => `<path d="M50 14 L50 86" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity=".55"/><circle cx="50" cy="50" r="8" fill="#fff"/><circle cx="50" cy="50" r="16" fill="none" stroke="#fff" stroke-width="3"/><circle cx="50" cy="50" r="25" fill="none" stroke="#fff" stroke-width="2.5" opacity=".6"/>`,
  supernova: () => star(50, 50, 12, 30, 14, -90) + `<circle cx="50" cy="50" r="9" fill="#fde047"/>`,
  galaxy: () => `<path d="M50 50 m-5 0 a5 5 0 1 1 10 0 a11 11 0 1 1 -20 3 a17 17 0 1 1 33 -7 a24 24 0 1 1 -44 11" fill="none" stroke="#fff" stroke-width="4.5" stroke-linecap="round"/><circle cx="50" cy="50" r="4" fill="#fff"/><circle cx="72" cy="28" r="2.5" fill="#fff"/><circle cx="26" cy="72" r="2" fill="#fff"/>`,
  legend: c => `<path d="M26 66 L28 36 L41 50 L50 28 L59 50 L72 36 L74 66Z" fill="#fff" stroke="#fff" stroke-width="2" stroke-linejoin="round"/><rect x="26" y="68" width="48" height="7" rx="3" fill="#fff"/><circle cx="50" cy="58" r="4.5" fill="${c}"/><circle cx="38" cy="60" r="3" fill="${c}"/><circle cx="62" cy="60" r="3" fill="${c}"/>`
};
const HEX = '50,4 90,27 90,73 50,96 10,73 10,27';
const HEX_IN = '50,13 82,31.5 82,68.5 50,87 18,68.5 18,31.5';

export function rankSVG(rank: Rank, uid = rank.id): string {
  const i = RANKS.indexOf(rank), g = `g-${uid}`, s = `s-${uid}`;
  const rays = i >= 5 ? Array.from({ length: 12 }, (_, k) => `<path d="M50 50 L${(50 + 60 * Math.cos(k * Math.PI / 6)).toFixed(1)} ${(50 + 60 * Math.sin(k * Math.PI / 6)).toFixed(1)}" stroke="${rank.glow}" stroke-width="${k % 2 ? 2 : 4}" opacity=".45"/>`).join('') : '';
  const np = Math.min(3, i % 3 + (i ? 1 : 0));
  const pips = Array.from({ length: np }, (_, k) => `<circle cx="${50 + (k - (np - 1) / 2) * 9}" cy="92" r="3" fill="${rank.glow}"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-10 -10 120 120" role="img" aria-label="${rank.name.en}">
<defs><linearGradient id="${g}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${rank.c1}"/><stop offset="1" stop-color="${rank.c2}"/></linearGradient>
<radialGradient id="${s}" cx=".35" cy=".25" r=".8"><stop offset="0" stop-color="#fff" stop-opacity=".45"/><stop offset=".6" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>
${rays}<polygon points="${HEX}" fill="url(#${g})" stroke="${rank.glow}" stroke-width="${i >= 8 ? 5 : 3}" stroke-linejoin="round"/>
<polygon points="${HEX_IN}" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="2" stroke-linejoin="round"/>
<polygon points="${HEX}" fill="url(#${s})"/>${EMBLEM[rank.id](rank.c2)}${pips}</svg>`;
}
export const rankDataUrl = (rank: Rank) => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(rankSVG(rank));
