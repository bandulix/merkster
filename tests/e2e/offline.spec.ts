/* Cards stay usable offline. Reminders are opt-in and name the quiet hours. */
import { expect, test } from '@playwright/test';
import path from 'node:path';
import { googleLogin, newUser, pasteTest, SHOTS } from './helpers';

test('today stays on the device, and reminders stay quiet by default', async ({ browser }) => {
  const stamp = Date.now().toString(36);
  const { ctx, page } = await newUser(browser, { locale: 'de-DE', serviceWorkers: 'block' });
  await googleLogin(page, `off.${stamp}@example.com`, 'Noa Klein');
  await page.getByTestId('ob-skip').click();
  await pasteTest(page, { subject: 'biology', name: 'Die Zelle', days: 7, lines: ['Zellkern – enthält die DNA', 'Membran – Grenze der Zelle'] });
  if (await page.getByTestId('merki-continue').count()) await page.getByTestId('merki-continue').click();
  await page.goto('/');
  await page.context().setOffline(true);
  await expect(page.getByTestId('offline-ready')).toBeVisible();
  await expect(page.getByTestId('test-card').first()).toContainText('Die Zelle');
  await page.screenshot({ path: path.join(SHOTS, 'mobile-76-offline.png'), animations: 'disabled' });
  await page.context().setOffline(false);
  await page.goto('/settings');
  await expect(page.getByTestId('push-quiet')).toContainText('20:00');
  await page.getByTestId('push-enable').check();
  await expect(page.getByTestId('push-enable')).toBeChecked();
  await page.screenshot({ path: path.join(SHOTS, 'mobile-77-push.png'), animations: 'disabled' });
  await ctx.close();
});
