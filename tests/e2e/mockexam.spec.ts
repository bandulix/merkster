/* Probeprüfung opens a few days before the exam and shows a score. */
import { expect, test } from '@playwright/test';
import path from 'node:path';
import { googleLogin, newUser, pasteTest, SHOTS } from './helpers';

test('a biology deck gets a practice test before the exam', async ({ browser }) => {
  const stamp = Date.now().toString(36);
  const { ctx, page } = await newUser(browser, { locale: 'de-DE', serviceWorkers: 'block' });
  await googleLogin(page, `probe.${stamp}@example.com`, 'Noa Klein');
  await page.getByTestId('ob-skip').click();
  await pasteTest(page, {
    subject: 'biology', name: 'Die Zelle', days: 3,
    lines: ['Zellkern – enthält die DNA', 'Mitochondrium – Kraftwerk der Zelle', 'Membran – Grenze der Zelle']
  });
  if (await page.getByTestId('merki-continue').count()) await page.getByTestId('merki-continue').click();
  await expect(page.getByTestId('mock-open')).toBeVisible();
  await page.getByTestId('mock-open').click();
  await page.screenshot({ path: path.join(SHOTS, 'mobile-71-mock-start.png'), animations: 'disabled' });
  await page.getByTestId('mock-start').click();
  await expect(page.getByTestId('mock-q').first()).toBeVisible();
  const n = await page.getByTestId('mock-q').count();
  for (let i = 0; i < n; i++) {
    const q = page.getByTestId('mock-q').nth(i);
    if (await q.getByTestId('mock-choice').count()) await q.getByTestId('mock-choice').first().click();
    else await q.getByTestId('mock-text').fill('Die Zelle hat Teile mit eigenen Aufgaben, zum Beispiel den Kern.');
  }
  await page.screenshot({ path: path.join(SHOTS, 'mobile-72-mock-paper.png'), animations: 'disabled' });
  await page.getByTestId('mock-send').click();
  await expect(page.getByTestId('mock-score')).toBeVisible();
  await expect(page.getByTestId('mock-grade')).toBeVisible();
  await page.screenshot({ path: path.join(SHOTS, 'mobile-73-mock-result.png'), animations: 'disabled' });
  await ctx.close();
});
