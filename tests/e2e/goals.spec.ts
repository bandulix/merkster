/* Lernziele: photo → goals → clarifying question → plan → practice,
   a second student joins the same sheet, grades and privacy. */
import { expect, test } from '@playwright/test';
import path from 'node:path';
import { dismissMerki, googleLogin, newUser, ROOT, SHOTS } from './helpers';

const FIX = path.join(ROOT, 'tests/fixtures/vocab-table.png');
const stamp = Date.now().toString(36);

test.describe.configure({ mode: 'serial' });

test('two students share a Lernziele sheet, then grades stay between them', async ({ browser }) => {
  const mia = await newUser(browser, { locale: 'de-DE', serviceWorkers: 'block' });
  await googleLogin(mia.page, `mia.goals.${stamp}@example.com`, 'Mia Schmidt');
  await expect(mia.page.getByTestId('onboarding')).toBeVisible();
  await mia.page.getByTestId('ob-skip').click();
  await mia.page.goto('/goals');
  await mia.page.getByTestId('qdate-14').click();
  await mia.page.screenshot({ path: path.join(SHOTS, 'mobile-40-goals-capture.png') });
  await mia.page.getByTestId('file-input').setInputFiles(FIX);
  await expect(mia.page.getByTestId('goals-review')).toBeVisible({ timeout: 60_000 });
  await expect(mia.page.getByTestId('goal-row').first()).toContainText('Zelle');
  await expect(mia.page.getByTestId('method-name').nth(2)).toContainText(/Lösungsbeispiele|Worked/);
  await mia.page.screenshot({ path: path.join(SHOTS, 'mobile-41-goals-review.png'), fullPage: true });
  await mia.page.getByTestId('goals-confirm').click();
  const join = mia.page.getByTestId('join-sheet');
  const clarify = mia.page.getByTestId('clarify');
  await expect(join.or(clarify)).toBeVisible({ timeout: 60_000 });
  if (await join.isVisible()) await mia.page.getByTestId('join-own').click();
  await expect(clarify).toBeVisible();
  await mia.page.screenshot({ path: path.join(SHOTS, 'mobile-42-clarify.png') });
  await mia.page.getByTestId('exam-written').click();
  await mia.page.getByTestId('min-20').click();
  await expect(mia.page.getByTestId('plan-overview')).toBeVisible({ timeout: 60_000 });
  await expect(mia.page.getByTestId('method-chip').first()).toBeVisible();
  await mia.page.screenshot({ path: path.join(SHOTS, 'mobile-43-plan.png'), fullPage: true });

  await dismissMerki(mia.page);
  await mia.page.getByTestId('practice-test').click();
  await expect(mia.page.getByTestId('session')).toBeVisible();
  await expect(mia.page.locator('.qcard').first()).toBeVisible();
  await mia.page.screenshot({ path: path.join(SHOTS, 'mobile-44-goals-practice.png') });
  // finish the short round so progress is posted for the shared plan
  for (let i = 0; i < 30 && await mia.page.getByTestId('session').count(); i++) {
    if (await mia.page.getByTestId('done').count()) break;
    const studied = mia.page.getByTestId('studied');
    if (await studied.count()) { await studied.click(); continue; }
    const reveal = mia.page.getByTestId('reveal');
    if (await reveal.count()) { await reveal.click(); if (await mia.page.getByTestId('self-yes').count()) await mia.page.getByTestId('self-yes').click(); continue; }
    const show = mia.page.getByTestId('mc-show');
    if (await show.count()) { await show.click(); await mia.page.getByTestId('mc-opt').first().click(); continue; }
    const dunno = mia.page.getByTestId('dunno');
    if (await dunno.count()) { await dunno.click(); }
    const next = mia.page.getByTestId('next');
    if (await next.count()) await next.click();
    else break;
  }
  await mia.page.getByTestId('done-home').click({ timeout: 20_000 }).catch(() => undefined);

  const lena = await newUser(browser, { locale: 'de-DE', serviceWorkers: 'block' });
  await googleLogin(lena.page, `lena.goals.${stamp}@example.com`, 'Lena Berger');
  await lena.page.getByTestId('ob-skip').click();
  await lena.page.goto('/goals');
  await lena.page.getByTestId('qdate-14').click();
  await lena.page.getByTestId('file-input').setInputFiles(FIX);
  await expect(lena.page.getByTestId('goals-review')).toBeVisible({ timeout: 60_000 });
  await lena.page.getByTestId('goals-confirm').click();
  await expect(lena.page.getByTestId('join-sheet')).toBeVisible();
  await expect(lena.page.getByTestId('join-sheet')).toContainText('Mia');
  await lena.page.screenshot({ path: path.join(SHOTS, 'mobile-45-join-plan.png') });
  await lena.page.getByTestId('join-accept').click();
  await expect(lena.page.getByTestId('together')).toBeVisible({ timeout: 30_000 });
  await expect(lena.page.getByTestId('member-row')).toHaveCount(2);
  await lena.page.screenshot({ path: path.join(SHOTS, 'mobile-46-together.png'), fullPage: true });
  await lena.page.getByTestId('activity-feed').scrollIntoViewIfNeeded();
  await expect(lena.page.getByTestId('feed-item').first()).toBeVisible();
  await lena.page.screenshot({ path: path.join(SHOTS, 'mobile-47-feed.png') });

  // Mia enters the exam grade, then a few older marks so the chart is not empty
  await mia.page.goto('/');
  await mia.page.getByTestId('test-card').first().click();
  await mia.page.getByTestId('add-grade-plan').click();
  await expect(mia.page.getByTestId('grade-sheet')).toBeVisible();
  await expect(mia.page.getByTestId('grade-subject')).toHaveValue('biology');
  await mia.page.screenshot({ path: path.join(SHOTS, 'mobile-48-grade-sheet.png') });
  await mia.page.getByTestId('grade-2').click();
  await mia.page.getByTestId('mood-good').click();
  await mia.page.getByTestId('save-result').click();
  await expect(mia.page.getByTestId('td-result')).toHaveText('2');
  await dismissMerki(mia.page);

  const seed = await mia.page.request.post('/api/grades', {
    headers: { 'content-type': 'application/json', 'x-merkster': '1' },
    data: { grades: [
      { id: 'hist23', subject: 'history', title: 'Weimarer Republik', kind: 'klassenarbeit', date: '2026-02-12', system: 'de_grade', value: 3, withPlan: false, mood: null, note: '', adherence: null },
      { id: 'biojan', subject: 'biology', title: 'Ökologie', kind: 'test', date: '2026-01-20', system: 'de_grade', value: 4, withPlan: false, mood: null, note: '', adherence: null },
      { id: 'mathok', subject: 'math', title: 'Quadratische Funktionen', kind: 'klausur', date: '2026-03-02', system: 'points15', value: 11, withPlan: true, adherence: 80, mood: 'great', note: '' }
    ] }
  });
  expect(seed.ok()).toBeTruthy();
  const dismiss = async () => {
    const ok = mia.page.getByTestId('cel-ok');
    await ok.waitFor({ state: 'visible', timeout: 4000 }).catch(() => undefined);
    for (let i = 0; i < 4; i++) {
      if (!(await ok.count())) break;
      await ok.click();
      await mia.page.waitForTimeout(200);
    }
    await expect(mia.page.locator('.celebrate')).toHaveCount(0);
  };
  await mia.page.goto('/results');
  await dismiss();
  await expect(mia.page.getByTestId('erfolgsquote')).toBeVisible();
  await expect(mia.page.getByTestId('grade-trend')).toBeVisible();
  await mia.page.screenshot({ path: path.join(SHOTS, 'mobile-49-stats.png'), fullPage: true });

  await mia.page.goto('/settings');
  await dismiss();
  await mia.page.getByTestId('grade-privacy').scrollIntoViewIfNeeded();
  await expect(mia.page.getByTestId('privacy-summary')).toHaveClass(/on/);
  await mia.page.screenshot({ path: path.join(SHOTS, 'mobile-50-privacy.png') });

  const compare = lena.page.getByTestId('compare-open').first();
  await compare.evaluate(el => el.scrollIntoView({ block: 'center', inline: 'nearest' }));
  await compare.click({ force: true });
  await expect(lena.page.getByTestId('compare-view')).toBeVisible();
  await expect(lena.page.getByTestId('compare-theirs')).toBeVisible();
  await expect(lena.page.getByTestId('compare-grades')).toHaveCount(0);
  await lena.page.screenshot({ path: path.join(SHOTS, 'mobile-51-compare.png'), fullPage: true });
  const compareUrl = new URL(lena.page.url());
  const miaId = compareUrl.pathname.split('/').pop()!;

  const otto = await newUser(browser, { locale: 'de-DE', serviceWorkers: 'block' });
  await googleLogin(otto.page, `otto.goals.${stamp}@example.com`, 'Otto Frei');
  await otto.page.getByTestId('ob-skip').click();
  const blocked = await otto.page.request.get('/api/social/compare/' + miaId);
  expect(blocked.status()).toBe(404);
  await otto.page.goto('/compare/' + miaId);
  await expect(otto.page.getByText('Plan oder deiner Klasse')).toBeVisible();

  await mia.ctx.close();
  await lena.ctx.close();
  await otto.ctx.close();
});
