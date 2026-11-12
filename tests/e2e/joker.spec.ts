/* The streak screen explains the weekly joker. */
import { expect, test } from '@playwright/test';
import path from 'node:path';
import { googleLogin, newUser, SHOTS } from './helpers';

test('the streak screen explains the weekly joker', async ({ browser }) => {
  const stamp = Date.now().toString(36);
  const { ctx, page } = await newUser(browser, { locale: 'de-DE', serviceWorkers: 'block' });
  await googleLogin(page, `joker.${stamp}@example.com`, 'Noa Klein');
  await page.getByTestId('ob-skip').click();
  await page.getByTestId('nav-me').click();
  await expect(page.getByTestId('joker-help')).toContainText('Joker');
  await expect(page.getByTestId('joker-line')).toBeVisible();
  await page.screenshot({ path: path.join(SHOTS, 'mobile-79-joker.png'), animations: 'disabled' });
  await ctx.close();
});
