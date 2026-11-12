/* A shared plan suggests a weekly group goal. No ranking. */
import { expect, test } from '@playwright/test';
import path from 'node:path';
import { googleLogin, newUser, pasteTest, SHOTS } from './helpers';

test('a plan offers a cooperative week', async ({ browser }) => {
  const stamp = Date.now().toString(36);
  const { ctx, page } = await newUser(browser, { locale: 'de-DE', serviceWorkers: 'block' });
  await googleLogin(page, `week.${stamp}@example.com`, 'Noa Klein');
  await page.getByTestId('ob-skip').click();
  await pasteTest(page, { subject: 'biology', name: 'Die Zelle', days: 14, lines: ['Zellkern – enthält die DNA', 'Membran – Grenze der Zelle', 'Ribosom – baut Proteine'] });
  if (await page.getByTestId('merki-continue').count()) await page.getByTestId('merki-continue').click();
  await expect(page.getByTestId('challenge')).toBeVisible({ timeout: 20000 });
  await expect(page.getByTestId('challenge-count')).toHaveText('0/20');
  await page.getByTestId('challenge').scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(SHOTS, 'mobile-78-challenge.png'), animations: 'disabled' });
  await page.getByTestId('challenge-opt').click();
  await expect(page.getByTestId('challenge-opt')).toContainText(/mit/i);
  await ctx.close();
});
