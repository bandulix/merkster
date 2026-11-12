/* Another explanation: on demand during a session, including a sketch. */
import { expect, test } from '@playwright/test';
import path from 'node:path';
import { googleLogin, newUser, pasteTest, SHOTS } from './helpers';

test('a card can be explained another way', async ({ browser }) => {
  const stamp = Date.now().toString(36);
  const { ctx, page } = await newUser(browser, { locale: 'de-DE', serviceWorkers: 'block' });
  await googleLogin(page, `explain.${stamp}@example.com`, 'Noa Klein');
  await page.getByTestId('ob-skip').click();
  await pasteTest(page, { subject: 'biology', name: 'Die Zelle', days: 7, lines: ['Zellkern – enthält die DNA', 'Mitochondrium – Kraftwerk der Zelle'] });
  if (await page.getByTestId('merki-continue').count()) await page.getByTestId('merki-continue').click();
  await page.getByTestId('practice-test').click();
  await expect(page.getByTestId('session')).toBeVisible();
  await page.getByTestId('explain-open').click();
  await expect(page.getByTestId('explain-text')).toContainText(/Tresor|Zellkern/);
  await page.screenshot({ path: path.join(SHOTS, 'mobile-74-explain.png'), animations: 'disabled' });
  await page.getByTestId('explain-sketch').click();
  await expect(page.getByTestId('explain-sketch')).toBeVisible();
  await page.screenshot({ path: path.join(SHOTS, 'mobile-75-explain-sketch.png'), animations: 'disabled' });
  await ctx.close();
});
