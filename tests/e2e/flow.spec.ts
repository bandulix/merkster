/* Full journey: mock Google login → onboarding → create test → photo import (server AI via mock LLM) → review
   → practice → XP / level-up → exam result → results dashboard → share image → persistence → isolation → offline. */
import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { calm, dismissCelebrations, googleLogin, isoDay, newUser, OUT, playSession, pngSize, ROOT, SHOTS } from './helpers';

const FIX = path.join(ROOT, 'tests/fixtures');
const STAMP = Date.now().toString(36);
const MIA = `mia.${STAMP}@example.com`, LEO = `leo.${STAMP}@example.com`;
let testUrl = '';
test.describe.configure({ mode: 'serial' });

test('student journey: login → import → practice → level up → result → dashboard → share', async ({ browser }) => {
  const { ctx, page } = await newUser(browser, { locale: 'de-DE' });
  await page.goto('/');
  await expect(page).toHaveURL(/\/login\?next=|\/login$/);
  await expect(page.getByTestId('google-login')).toBeVisible();
  await expect(page.getByTestId('test-provider')).toBeVisible();          // mock provider is announced in test mode
  await page.screenshot({ path: path.join(SHOTS, 'mobile-01-login.png') });

  await googleLogin(page, MIA, 'Mia Schmidt');
  await expect(page.getByTestId('onboarding')).toBeVisible();
  await page.screenshot({ path: path.join(SHOTS, 'mobile-02-onboarding.png') });
  for (let i = 0; i < 2; i++) await page.locator('.ob-actions .btn.primary').click();
  await page.getByTestId('ob-create').click();

  // wizard: English vocabulary, test tomorrow (all cards are introduced today), mixed format
  await page.getByTestId('subj-languages').click();
  await page.getByTestId('foreign-en').click();
  await page.getByTestId('test-name').fill('Englisch Unit 3');
  await page.screenshot({ path: path.join(SHOTS, 'mobile-03-new-test.png') });
  await page.getByTestId('wiz-next').click();
  await page.getByTestId('qdate-1').click();
  await page.getByTestId('wiz-next').click();
  await page.getByTestId('wiz-next').click();

  // photo import – server-side vision model (mock LLM)
  await expect(page.getByTestId('ai-on')).toBeVisible();
  await page.getByTestId('file-input').setInputFiles(path.join(FIX, 'vocab-table.png'));
  await expect(page.getByTestId('review-rows')).toBeVisible({ timeout: 60_000 });
  const found = Number(await page.getByTestId('cards-found').innerText());
  expect(found).toBeGreaterThanOrEqual(8);
  await expect(page.getByTestId('unreadable')).toBeVisible();
  await page.screenshot({ path: path.join(SHOTS, 'mobile-04-review.png') });
  const known = new Map<string, string>();
  for (const row of await page.getByTestId('review-row').all()) {
    const a = (await row.locator('[data-f="a"]').inputValue()).trim(), b = (await row.locator('[data-f="b"]').inputValue()).trim();
    if (a && b) { known.set(a, b); known.set(b, a); }
  }
  await page.getByTestId('save-cards').click();
  await expect(page.getByTestId('card-list').locator('li')).toHaveCount(found);
  testUrl = new URL(page.url()).pathname;
  await page.screenshot({ path: path.join(SHOTS, 'mobile-05-test-plan.png'), fullPage: true });

  // practice
  await page.getByTestId('practice-test').click();
  await expect(page.getByTestId('session')).toBeVisible();
  let shot = false;
  await playSession(page, known, { onCard: async n => { if (!shot && n >= 3 && await page.locator('[data-testid^="card-"]:not([data-testid="card-study"])').count()) { shot = true; await page.screenshot({ path: path.join(SHOTS, 'mobile-06-practice.png') }); } } });
  // celebrations may cover Done — grab the frame, then clear them
  await page.waitForSelector('[data-testid="done"], [data-testid="levelup"], [data-testid="badge-unlock"]', { timeout: 15000 });
  if (await page.getByTestId('levelup').isVisible().catch(() => false)) {
    await page.waitForTimeout(900);
    await page.screenshot({ path: path.join(SHOTS, 'mobile-07-level-up.png') });
  }
  for (let i = 0; i < 5 && await page.locator('[data-testid="levelup"], [data-testid="badge-unlock"]').count(); i++) {
    if (await page.getByTestId('badge-unlock').isVisible().catch(() => false) && i === 0)
      await page.screenshot({ path: path.join(SHOTS, 'mobile-08-badge.png') });
    await page.locator('[data-testid="levelup"], [data-testid="badge-unlock"]').first().getByTestId('cel-ok').click();
    await page.waitForTimeout(400);
  }
  await expect(page.getByTestId('done')).toBeVisible();
  const gain = await page.getByTestId('xp-gain').innerText();
  const xp = Number(/\+(\d+) XP/.exec(gain)![1]);
  expect(xp).toBeGreaterThanOrEqual(40);                                     // level 2 needs 40 XP
  await page.screenshot({ path: path.join(SHOTS, 'mobile-09-done.png') });
  await page.getByTestId('done-home').click();
  await expect(page.locator('[data-testid="level-chip"]:visible').first()).toContainText(/Level [23]|Lv\.? ?[23]/);
  await calm(page);
  await page.screenshot({ path: path.join(SHOTS, 'mobile-10-today.png') });

  // profile: level, xp, badges
  await page.getByTestId('nav-me').click();
  await expect(page.getByTestId('me-level')).toBeVisible();
  expect(Number((await page.getByTestId('me-xp').innerText()).replace(/\D/g, ''))).toBeGreaterThanOrEqual(xp);
  await expect(page.getByTestId('badges').locator('.badge-tile.got').first()).toBeVisible();
  await page.screenshot({ path: path.join(SHOTS, 'mobile-11-profile.png'), fullPage: true });

  // the test date passes (moved to yesterday in the test settings) → "How did it go?"
  await page.goto(testUrl);
  await page.getByTestId('td-settings').click();
  await page.getByTestId('td-date').fill(isoDay(-1));
  await page.getByTestId('td-ask-result').click();
  await page.getByTestId('gs-de_grade').click();
  await page.getByTestId('grade-2+').click();
  await page.screenshot({ path: path.join(SHOTS, 'mobile-12-result-entry.png') });
  await page.getByTestId('save-result').click();
  await expect(page.getByTestId('td-result')).toHaveText('2+');

  // share the result: story + square PNGs, rendered client-side
  await page.getByTestId('td-share').click();
  const preview = page.getByTestId('share-preview');
  await expect(preview).toBeVisible();
  await page.screenshot({ path: path.join(SHOTS, 'mobile-13-share-sheet.png') });
  for (const fmt of ['story', 'square'] as const) {
    await page.getByTestId('fmt-' + fmt).click();
    await page.waitForTimeout(300);
    const dl = page.waitForEvent('download');
    await page.getByTestId('share-png').click();
    const file = path.join(OUT, `share-result-${fmt}.png`);
    await (await dl).saveAs(file);
    const size = pngSize(fs.readFileSync(file));
    expect(size).toEqual(fmt === 'story' ? { w: 1080, h: 1920 } : { w: 1080, h: 1080 });
    fs.copyFileSync(file, path.join(SHOTS, `share-card-result-${fmt}.png`));
  }
  // privacy toggle: hide grade re-renders the preview
  const before = await preview.getAttribute('src');
  await page.getByTestId('hide-grade').check();
  await expect.poll(() => preview.getAttribute('src')).not.toBe(before);
  await page.keyboard.press('Escape');

  // results dashboard
  await page.getByTestId('nav-results').click();
  await expect(page.getByTestId('result-tiles')).toBeVisible();
  await expect(page.getByTestId('avg')).toContainText('2+');
  await expect(page.getByTestId('result-history')).toContainText('Englisch Unit 3');
  await page.waitForTimeout(800);                                           // recharts animation
  await page.screenshot({ path: path.join(SHOTS, 'mobile-14-results.png'), fullPage: true });

  // level share card (square) for the brand sheet
  await page.getByTestId('nav-me').click();
  await page.getByTestId('share-level').click();
  await page.getByTestId('fmt-story').click();
  const dl = page.waitForEvent('download');
  await page.getByTestId('share-png').click();
  await (await dl).saveAs(path.join(SHOTS, 'share-card-level-story.png'));
  await page.keyboard.press('Escape');

  // persistence: reload + the server has it
  await page.reload();
  await page.goto(testUrl);
  await expect(page.getByTestId('td-result')).toHaveText('2+');
  const exp = await page.request.get('/api/me/export');
  expect(exp.ok()).toBeTruthy();
  const body = await exp.json();
  expect(JSON.stringify(body)).toContain('Englisch Unit 3');
  expect(body.account.email).toBe(MIA);
  expect(JSON.stringify(body)).not.toMatch(/sk-mock|client-secret|token_hash|password/i);
  await ctx.close();
});

test('same account on a desktop browser: synced data + desktop screenshots + dark theme', async ({ browser }) => {
  const { ctx, page } = await newUser(browser, { locale: 'en-US', mobile: false });
  await googleLogin(page, MIA, 'Mia Schmidt');
  // the English test is over → it sits under "past tests"; synced from the phone
  await page.locator('details.past > summary').click();
  await expect(page.getByTestId('test-card').filter({ hasText: 'Englisch Unit 3' })).toBeVisible();
  await expect(page.locator('nav.nav')).toBeVisible();
  // paste import on desktop: a biology test next week
  await page.getByTestId('nav-new').click();
  await page.getByTestId('subj-biology').click();
  await page.getByTestId('test-name').fill('Bio: Die Zelle');
  await page.getByTestId('wiz-next').click();
  await page.getByTestId('qdate-7').click();
  await page.getByTestId('wiz-next').click();
  await page.getByTestId('wiz-next').click();
  await page.getByTestId('paste-tile').click();
  await page.getByTestId('paste-text').fill(['Zellkern – enthält die Erbinformation (DNA)', 'Mitochondrien – Kraftwerke der Zelle', 'Zellmembran – umgibt jede Zelle', 'Chloroplasten – Ort der Fotosynthese', 'Ribosomen – Proteinbiosynthese', 'Vakuole – speichert Wasser'].join('\n'));
  await page.getByTestId('paste-parse').click();
  await expect(page.getByTestId('cards-found')).toHaveText('6');
  await page.getByTestId('save-cards').click();
  await expect(page.getByTestId('card-list').locator('li')).toHaveCount(6);
  await page.getByTestId('nav-today').click();
  await expect(page.getByTestId('hero')).toBeVisible();
  await page.screenshot({ path: path.join(SHOTS, 'desktop-01-today.png') });
  await page.getByTestId('nav-results').click();
  await expect(page.getByTestId('result-tiles')).toBeVisible();
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(SHOTS, 'desktop-02-results.png') });
  await page.getByTestId('nav-me').click();
  await expect(page.getByTestId('me-level')).toBeVisible();
  await page.screenshot({ path: path.join(SHOTS, 'desktop-03-profile.png') });
  await page.goto(testUrl);
  await page.screenshot({ path: path.join(SHOTS, 'desktop-04-test.png') });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(SHOTS, 'desktop-05-today-dark.png') });
  await page.getByTestId('nav-me').click();
  await page.getByTestId('share-week').click();
  await page.getByTestId('fmt-square').click();
  const dl = page.waitForEvent('download');
  await page.getByTestId('share-png').click();
  await (await dl).saveAs(path.join(SHOTS, 'share-card-week-square.png'));
  // short animated clip (MediaRecorder); without the Web Share API it is downloaded
  const vdl = page.waitForEvent('download', { timeout: 60_000 });
  await page.getByTestId('share-video').click();
  const video = await vdl;
  expect(video.suggestedFilename()).toMatch(/\.(webm|mp4)$/);
  const vpath = path.join(OUT, 'share-week.' + video.suggestedFilename().split('.').pop());
  await video.saveAs(vpath);
  expect(fs.statSync(vpath).size).toBeGreaterThan(20_000);
  await ctx.close();
});

test('second student sees none of the first student\'s data', async ({ browser }) => {
  const { ctx, page } = await newUser(browser, { locale: 'en-US' });
  await googleLogin(page, LEO, 'Leo Example');
  await expect(page.getByTestId('onboarding')).toBeVisible();
  await page.getByTestId('ob-skip').click();
  await expect(page.getByTestId('empty-home')).toBeVisible();
  await expect(page.getByText('Englisch Unit 3')).toHaveCount(0);
  const exp = await (await page.request.get('/api/me/export')).json();
  expect(JSON.stringify(exp)).not.toContain('Englisch Unit 3');
  expect(exp.account.email).toBe(LEO);
  // someone else's test id is not reachable
  await page.goto(testUrl);
  await expect(page).toHaveURL(/\/$|\/welcome/);
  // not an admin → admin API refused
  expect((await page.request.get('/api/admin/users')).status()).toBe(403);
  await ctx.close();
});

test('installable PWA works offline after the first visit', async ({ browser }) => {
  const { ctx, page } = await newUser(browser, { locale: 'en-US' });
  await googleLogin(page, MIA, 'Mia Schmidt');
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBeTruthy();
  // first visit finished: data synced to this device (and written to IndexedDB)
  await expect(page.getByTestId('test-card').filter({ hasText: 'Bio: Die Zelle' })).toBeVisible();
  await page.waitForTimeout(500);
  const manifest = await (await page.request.get('/manifest.webmanifest')).json();
  expect(manifest.name).toBe('Merkster'); expect(manifest.short_name).toBe('Merkster');
  await ctx.setOffline(true);
  await page.reload();
  await expect(page.getByTestId('test-card').filter({ hasText: 'Bio: Die Zelle' })).toBeVisible();
  await expect(page.locator('[data-testid="sync-status"]:visible').first()).toBeVisible();
  await page.screenshot({ path: path.join(SHOTS, 'mobile-15-offline.png') });
  await ctx.setOffline(false);
  await ctx.close();
});

test('logout and account deletion', async ({ browser }) => {
  const { ctx, page } = await newUser(browser, { locale: 'en-US' });
  await googleLogin(page, LEO, 'Leo Example');
  await page.goto('/settings');
  await page.locator('details:has([data-testid="del-confirm"]) > summary').click();
  await page.getByTestId('del-confirm').fill('DELETE');
  page.once('dialog', d => d.accept());
  await page.getByTestId('delete-account').click();
  await expect(page).toHaveURL(/\/login/);
  expect((await page.request.get('/api/me')).status()).toBe(401);
  await ctx.close();
});
