/* Brand sheet: logo, palette, type and real app screenshots (taken by the other specs) composed into brand/brand-sheet.png.
   Run after the other specs:  npx playwright test tests/e2e/brand.spec.ts */
import { test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, SHOTS } from './helpers';

const BRAND = path.join(ROOT, 'brand');
const img = (f: string) => { const p = path.join(SHOTS, f); return fs.existsSync(p) ? `data:image/png;base64,${fs.readFileSync(p).toString('base64')}` : null; };
const SCREENS: [string, string][] = [
  ['mobile-10-today.png', 'Today'], ['mobile-06-practice.png', 'Practice'], ['mobile-14-results.png', 'Results'],
  ['mobile-22-cheer-overview.png', 'Supporters'], ['mobile-33-rc-unbox.png', 'Report card'], ['mobile-36-rewards-overview.png', 'Rewards'], ['mobile-37-simulator.png', 'Simulator']
];

test('brand sheet + logo PNGs', async ({ browser }) => {
  fs.mkdirSync(BRAND, { recursive: true });
  const logo = fs.readFileSync(path.join(ROOT, 'web/public/icons/logo.svg'), 'utf8');
  const page = await browser.newPage({ viewport: { width: 1024, height: 1024 } });
  for (const size of [1024, 256, 64]) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<body style="margin:0;background:transparent">${logo.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body>`);
    await page.screenshot({ path: path.join(BRAND, `logo-${size}.png`), omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
  }
  const font = fs.readFileSync(path.join(ROOT, 'web/public/fonts/plus-jakarta-sans-latin-wght-normal.woff2')).toString('base64');
  const shots = SCREENS.map(([f, l]) => [img(f), l]).filter(([s]) => s) as [string, string][];
  const sw = (c: string, n: string) => `<div class="sw"><i style="background:${c}"></i><b>${n}</b><small>${c}</small></div>`;
  await page.setViewportSize({ width: 2400, height: 1500 });
  await page.setContent(`<html><head><style>
    @font-face{font-family:PJS;src:url(data:font/woff2;base64,${font}) format('woff2');font-weight:200 800}
    body{margin:0;width:2400px;height:1500px;font-family:PJS,sans-serif;background:radial-gradient(120% 90% at 100% 0%,rgba(61,90,254,.55),transparent 55%),radial-gradient(90% 80% at 0% 100%,rgba(198,244,50,.28),transparent 60%),#0d0f1e;color:#eef0f8;display:grid;grid-template-columns:640px 1fr;gap:56px;padding:72px;box-sizing:border-box}
    h1{font-size:120px;margin:24px 0 0;letter-spacing:-.04em;font-weight:800} .tag{font-size:34px;color:#c6f432;font-weight:700;margin:6px 0 40px}
    .sws{display:grid;grid-template-columns:repeat(2,1fr);gap:18px;margin-bottom:40px} .sw{display:grid;grid-template-columns:64px 1fr;grid-template-rows:auto auto;column-gap:16px;align-items:center}
    .sw i{grid-row:span 2;width:64px;height:64px;border-radius:18px;border:2px solid rgba(255,255,255,.15)} .sw b{font-size:24px} .sw small{font-size:18px;opacity:.7}
    .type{font-size:28px;line-height:1.4;opacity:.9} .type b{font-weight:800} .marks{display:flex;gap:24px;align-items:end;margin-top:36px}
    .marks div{background:#f4f5ef;border-radius:28px;padding:18px} .shots{display:flex;gap:26px;flex-wrap:wrap;align-content:center}
    figure{margin:0;text-align:center} figure img{width:220px;border-radius:30px;box-shadow:0 20px 50px rgba(0,0,0,.5);border:3px solid #262a47} figcaption{margin-top:12px;font-size:22px;font-weight:700;color:#c6f432}
  </style></head><body>
    <div>${logo.replace('<svg ', '<svg width="200" height="200" ')}
      <h1>Merkster</h1><p class="tag">Snap it. Drill it. Own the test.</p>
      <div class="sws">${sw('#0d0f1e', 'Ink')}${sw('#c6f432', 'Acid lime')}${sw('#ff5a36', 'Coral')}${sw('#3d5afe', 'Blue')}${sw('#00c2a8', 'Teal')}${sw('#ffd23f', 'Sun')}</div>
      <div class="type"><b>Plus Jakarta Sans</b> 200–800<br>Aa Bb Cc · Knipsen. Draufhaben. Test rocken.</div>
      <div class="marks"><div>${logo.replace('<svg ', '<svg width="96" height="96" ')}</div><div>${logo.replace('<svg ', '<svg width="48" height="48" ')}</div><div>${logo.replace('<svg ', '<svg width="24" height="24" ')}</div></div>
    </div>
    <div class="shots">${shots.map(([s, l]) => `<figure><img src="${s}"><figcaption>${l}</figcaption></figure>`).join('')}</div>
  </body></html>`);
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(BRAND, 'brand-sheet.png') });
  await page.close();
});
