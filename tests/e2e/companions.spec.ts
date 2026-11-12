/* A companion replaces Merki, can be shared by code, and disappears when the owner revokes it. */
import { expect, test, type Page } from '@playwright/test';
import path from 'node:path';
import { googleLogin, newUser, SHOTS } from './helpers';

const shot = (page: Page, name: string) => page.screenshot({ path: path.join(SHOTS, name), animations: 'disabled' });

async function ready(page: Page) {
  await expect(page.getByTestId('onboarding')).toBeVisible();
  await page.getByTestId('year-young').click();
  await page.getByTestId('ob-skip').click();
  await page.getByTestId('nav-settings').click();
  await page.getByTestId('open-companions').click();
  await expect(page.getByTestId('companions')).toBeVisible();
}

test('create a companion, share it, and revoke it', async ({ browser }) => {
  const stamp = Date.now().toString(36);
  const a = await newUser(browser, { locale: 'de-DE', serviceWorkers: 'block' });
  await googleLogin(a.page, `lumo.${stamp}@example.com`, 'Noa Klein');
  await ready(a.page);
  await a.page.getByTestId('companion-create').click();
  await expect(a.page.getByTestId('companion-intro')).toBeVisible();
  await shot(a.page, 'mobile-65-companion-intro.png');
  await a.page.getByTestId('companion-next').click();
  await a.page.getByTestId('preset-moss').click();
  await a.page.getByTestId('look-next').click();
  await a.page.getByTestId('companion-name').fill('Lumo');
  await a.page.getByTestId('name-next').click();
  await a.page.getByTestId('trait-playful').click();
  await expect(a.page.getByTestId('companion-preview')).toContainText('Lumo');
  await shot(a.page, 'mobile-66-companion-preview.png');
  await a.page.getByTestId('companion-save').click();
  await expect(a.page.getByTestId('companion-card')).toContainText('Lumo');
  await shot(a.page, 'mobile-67-companion-gallery.png');
  await a.page.getByTestId('share-Lumo').click();
  await a.page.getByTestId('share-on').click();
  await expect(a.page.getByTestId('share-code')).toBeVisible();
  const code = (await a.page.getByTestId('share-code').innerText()).trim();
  await shot(a.page, 'mobile-68-companion-share.png');

  const b = await newUser(browser, { locale: 'de-DE', serviceWorkers: 'block' });
  await googleLogin(b.page, `lumo.b.${stamp}@example.com`, 'Lena Berger');
  await ready(b.page);
  await b.page.getByTestId('redeem-code').fill(code);
  await b.page.getByTestId('redeem-add').click();
  await expect(b.page.getByTestId('companion-card')).toContainText('Noa');
  await shot(b.page, 'mobile-69-companion-received.png');
  await b.page.getByTestId('use-Lumo').click();
  await b.page.goto('/');
  await expect(b.page.getByTestId('companion-face')).toHaveAttribute('data-name', 'Lumo');
  await expect(b.page.getByTestId('merki-bubble')).toContainText('Lumo');
  await shot(b.page, 'mobile-70-companion-home.png');

  await a.page.getByTestId('share-revoke').click();
  await b.page.goto('/');
  await expect(b.page.getByTestId('companion-face')).toHaveCount(0);
  await expect(b.page.getByTestId('merki')).toBeVisible();
  await a.ctx.close();
  await b.ctx.close();
});
