/* Photo path shows the deletion notice. Research path shows a real source. */
import { expect, test } from '@playwright/test';
import path from 'node:path';
import { dismissMerki, googleLogin, newUser, ROOT } from './helpers';

const OUT = path.join(ROOT, 'docs/source-choice');
const FIX = path.join(ROOT, 'tests/fixtures/vocab-table.png');

async function shot(page: import('@playwright/test').Page, name: string) {
  await page.evaluate(() => document.fonts.ready);
  await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important}' });
  await page.screenshot({ path: path.join(OUT, name), animations: 'disabled' });
}

test('choose photos or a cited article', async ({ browser }) => {
  const stamp = Date.now().toString(36);
  const { ctx, page } = await newUser(browser, { locale: 'de-DE', serviceWorkers: 'block' });
  await googleLogin(page, `src.${stamp}@example.com`, 'Mia Schmidt');
  if (await page.getByTestId('year-mid').isVisible().catch(() => false)) await page.getByTestId('year-mid').click();
  await page.getByTestId('ob-skip').click();
  await page.goto('/goals');
  await page.getByTestId('qdate-14').click();
  await page.getByTestId('file-input').setInputFiles(FIX);
  await expect(page.getByTestId('goals-review')).toBeVisible({ timeout: 60_000 });
  await page.getByTestId('goals-confirm').click();
  const join = page.getByTestId('join-sheet');
  const clarify = page.getByTestId('clarify');
  await expect(join.or(clarify)).toBeVisible({ timeout: 60_000 });
  if (await join.isVisible()) await page.getByTestId('join-own').click();
  await expect(clarify).toBeVisible();
  await page.getByTestId('exam-written').click();
  await page.getByTestId('min-20').click();
  await expect(page.getByTestId('material-choice')).toBeVisible();
  await expect(page.getByTestId('material-photo')).toBeVisible();
  await expect(page.getByTestId('material-research')).toBeVisible();
  await shot(page, 'mobile-choice.png');
  await page.setViewportSize({ width: 1440, height: 900 });
  await shot(page, 'desktop-choice.png');
  await page.setViewportSize({ width: 390, height: 844 });

  await page.getByTestId('material-photo').click();
  await expect(page.getByTestId('upload-notice')).toContainText('gelöscht');
  await shot(page, 'mobile-notice.png');
  await page.setViewportSize({ width: 1440, height: 900 });
  await shot(page, 'desktop-notice.png');
  await page.setViewportSize({ width: 390, height: 844 });

  await page.goto(page.url().replace(/\/import$/, ''));
  await dismissMerki(page);
  await page.getByTestId('mode-research').click();
  await expect(page.getByTestId('card-source').first()).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('card-source').first()).toContainText('Wikipedia');
  await expect(page.getByTestId('card-source').first()).toHaveAttribute('href', /wikipedia\.org\/wiki\//);
  await page.getByTestId('card-source').first().scrollIntoViewIfNeeded();
  await shot(page, 'mobile-sources.png');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByTestId('card-source').first().scrollIntoViewIfNeeded();
  await shot(page, 'desktop-sources.png');
  await ctx.close();
});
