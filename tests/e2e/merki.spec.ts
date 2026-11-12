/* Merki: young and teen on Today, the nudge card, an inline bubble, a grade moment, mute. */
import { expect, test, type Page } from '@playwright/test';
import path from 'node:path';
import { googleLogin, newUser, pasteTest, SHOTS } from './helpers';

async function clearPops(page: Page) {
  for (let i = 0; i < 3; i++) {
    const ok = page.getByTestId('cel-ok');
    if (!(await ok.count())) {
      await page.waitForTimeout(500);
      if (!(await ok.count())) return;
    }
    await ok.first().click({ force: true });
    await page.waitForTimeout(250);
  }
}

const shot = (page: import('@playwright/test').Page, name: string) =>
  page.screenshot({ path: path.join(SHOTS, name), animations: 'disabled' });

test('Merki greets a younger student, switches for a teen, and can be quiet', async ({ browser }) => {
  const stamp = Date.now().toString(36);
  const { ctx, page } = await newUser(browser, { locale: 'de-DE', serviceWorkers: 'block' });
  await googleLogin(page, `merki.${stamp}@example.com`, 'Noa Klein');
  await expect(page.getByTestId('onboarding')).toBeVisible();
  await page.getByTestId('year-young').click();
  await expect(page.getByTestId('merki-moment')).toBeVisible();
  await expect(page.getByTestId('merki')).toHaveAttribute('data-variant', 'young');
  await page.getByTestId('ob-skip').click();

  const testPath = await pasteTest(page, {
    subject: 'biology', name: 'Die Zelle', days: 7,
    lines: ['Zellkern – enthält die DNA', 'Mitochondrium – Kraftwerk der Zelle', 'Membran – Grenze der Zelle', 'Ribosom – baut Proteine']
  });

  await page.goto('/');
  await expect(page.getByTestId('merki-nudge')).toBeVisible();
  await expect(page.getByTestId('merki')).toHaveAttribute('data-variant', 'young');
  await expect(page.getByTestId('merki-bubble')).toHaveCount(1);
  await expect(page.getByTestId('test-card').filter({ hasText: 'Die Zelle' }).first()).toBeVisible();
  await shot(page, 'mobile-61-merki-young.png');
  await page.getByTestId('merki-nudge').screenshot({ path: path.join(SHOTS, 'mobile-64-merki-nudge.png'), animations: 'disabled' });

  await page.goto(testPath);
  await expect(page.getByTestId('merki-inline')).toBeVisible();
  await expect(page.getByTestId('merki-bubble')).toContainText('Die Zelle');
  await expect(page.getByTestId('merki-bubble')).toHaveCount(1);
  await shot(page, 'mobile-62-merki-inline.png');

  await page.getByTestId('add-grade-plan').click();
  await page.getByTestId('gs-de_grade').click();
  await page.getByTestId('grade-2').click();
  await page.getByTestId('save-result').click();
  await expect(page.getByTestId('merki-screen')).toBeVisible();
  await expect(page.getByTestId('merki')).toHaveAttribute('data-variant', 'young');
  await expect(page.getByTestId('merki')).toHaveAttribute('data-pose', 'proud');
  await expect(page.getByTestId('merki-bubble')).toHaveCount(1);
  await shot(page, 'mobile-60-merki-moment.png');
  await page.getByTestId('merki-continue').click();
  await expect(page.getByTestId('merki-screen')).toHaveCount(0);
  await clearPops(page);

  await page.goto('/settings');
  await clearPops(page);
  await page.getByTestId('set-year-teen').click({ force: true });
  await page.goto('/');
  await clearPops(page);
  await expect(page.getByTestId('merki')).toHaveAttribute('data-variant', 'teen');
  await expect(page.getByTestId('merki-bubble')).toBeVisible();
  await expect(page.getByTestId('merki-bubble')).toHaveCount(1);
  await shot(page, 'mobile-63-merki-teen.png');

  await page.goto('/settings');
  await clearPops(page);
  await page.getByTestId('merki-mute').check({ force: true });
  await page.goto('/');
  await expect(page.getByTestId('merki-bubble')).toHaveCount(0);
  await expect(page.getByTestId('merki-quiet')).toBeVisible();
  await expect(page.getByTestId('merki')).toHaveAttribute('data-variant', 'teen');
  await ctx.close();
});
