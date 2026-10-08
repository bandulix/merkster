/* OCR accuracy: the on-device path (Tesseract in the browser, no AI). The server's /api/config is answered
   with "AI off" for this page only, so the import really runs Tesseract + the parser on the fixture photos.
   Measures pair-level accuracy against tests/fixtures/truth.json and writes a report to tests/output/ocr-report.json. */
import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { googleLogin, newUser, OUT, ROOT, skipOnboarding } from './helpers';

const FIX = path.join(ROOT, 'tests/fixtures');
const truth = JSON.parse(fs.readFileSync(path.join(FIX, 'truth.json'), 'utf8')) as Record<string, { lang: string | null; native: string; pairs: [string, string][] }>;
const norm = (s: string) => s.toLowerCase().normalize('NFC').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const lev = (a: string, b: string) => { const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]); for (let j = 1; j <= b.length; j++) d[0][j] = j; for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return d[a.length][b.length]; };
const MIN_PAIR_ACCURACY = 0.8;   // ≥ 80 % of pairs must come out exactly right (after case/punctuation normalisation)
const MIN_CHAR_ACCURACY = 0.95;  // and ≥ 95 % character accuracy overall
const REPORT = path.join(OUT, 'ocr-report.json');
// merged per fixture, so a failing fixture (worker restart) doesn't wipe the others' results
const report: Record<string, unknown> = fs.existsSync(REPORT) ? JSON.parse(fs.readFileSync(REPORT, 'utf8')) : {};

for (const [file, t] of Object.entries(truth)) {
  test(`on-device OCR accuracy: ${file}`, async ({ browser }) => {
    test.setTimeout(240_000);
    const { ctx, page } = await newUser(browser);
    await page.route('**/api/config', async r => { const res = await r.fetch(); const j = await res.json(); j.ai = { configured: false, model: null }; await r.fulfill({ response: res, json: j }); });
    await googleLogin(page, `ocr.${file.replace(/\W/g, '')}.${Date.now().toString(36)}@example.com`, 'OCR Test');
    await skipOnboarding(page);
    await page.getByTestId('nav-new').click();
    if (t.lang) { await page.getByTestId('subj-languages').click(); await page.getByTestId('my-lang-' + t.native).click(); await page.getByTestId('foreign-' + t.lang).click(); }
    else { await page.getByTestId('subj-biology').click(); await page.getByTestId('native-' + t.native).click(); }
    await page.getByTestId('test-name').fill('OCR ' + file);
    await page.getByTestId('wiz-next').click();
    await page.getByTestId('qdate-7').click();
    await page.getByTestId('wiz-next').click();
    await page.getByTestId('wiz-next').click();
    await expect(page.getByTestId('ai-on')).toHaveCount(0);
    const t0 = Date.now();
    await page.getByTestId('file-input').setInputFiles(path.join(FIX, file));
    await expect(page.getByTestId('review-rows')).toBeVisible({ timeout: 200_000 });
    const rows: [string, string][] = [];
    for (const row of await page.getByTestId('review-row').all()) rows.push([(await row.locator('[data-f="a"]').inputValue()).trim(), (await row.locator('[data-f="b"]').inputValue()).trim()]);
    let exact = 0, chars = 0, errs = 0;
    const detail = t.pairs.map(([a, b]) => {
      const want = norm(a) + ' | ' + norm(b);
      // best matching extracted row (either orientation)
      let best = { got: '', d: Infinity };
      for (const [x, y] of rows) for (const got of [norm(x) + ' | ' + norm(y), norm(y) + ' | ' + norm(x)]) { const d = lev(want, got); if (d < best.d) best = { got, d }; }
      chars += want.length; errs += Math.min(best.d, want.length);
      if (best.d === 0) exact++;
      return { want, got: best.got, distance: best.d };
    });
    const pairAcc = exact / t.pairs.length, charAcc = 1 - errs / chars;
    report[file] = { method: 'tesseract (on-device)', seconds: Math.round((Date.now() - t0) / 100) / 10, rows: rows.length, expected: t.pairs.length, exactPairs: exact, pairAccuracy: +pairAcc.toFixed(3), charAccuracy: +charAcc.toFixed(3), detail };
    fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(REPORT, JSON.stringify(report, null, 2));
    console.log(`OCR ${file}: ${exact}/${t.pairs.length} exact pairs, char accuracy ${(charAcc * 100).toFixed(1)} %`);
    expect(pairAcc).toBeGreaterThanOrEqual(MIN_PAIR_ACCURACY);
    expect(charAcc).toBeGreaterThanOrEqual(MIN_CHAR_ACCURACY);
    await ctx.close();
  });
}
