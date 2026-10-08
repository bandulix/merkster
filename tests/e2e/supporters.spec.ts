/* Supporters end-to-end with three real (mock-Google) accounts:
   Mia (student) invites Oma → Oma accepts → overview → reacts → Mia sees who cheered →
   privacy switches + revoked invite + removal → Oma loses access. Tom (second student) proves
   that one supporter can cheer for several kids. Also verifies Google profile pictures (avatars). */
import { expect, test, type Page } from '@playwright/test';
import path from 'node:path';
import { acceptInvite, apiCall, createInvite, dismissCelebrations, enterGrade, googleLogin, newUser, pairsOf, pasteTest, playSession, SHOTS, skipOnboarding } from './helpers';

const RUN = Date.now().toString(36);
const MIA = { email: `mia.${RUN}@example.com`, name: 'Mia Sommer' };
const OMA = { email: `gisela.${RUN}@example.com`, name: 'Gisela Sommer' };
const TOM = { email: `tom.nopic.${RUN}@example.com`, name: 'Tom Berger' };   // "nopic" → mock Google sends no picture
const BIO = ['Mitochondrium – Kraftwerk der Zelle', 'Ribosom – Proteinfabrik', 'Zellkern – enthält die DNA', 'Chloroplast – Ort der Fotosynthese', 'Zellmembran – Grenze der Zelle', 'Vakuole – Speicher der Pflanzenzelle'];
const MATH = ['Pi – 3,14', 'Primzahl – nur durch 1 und sich selbst teilbar', 'Hypotenuse – längste Seite im rechtwinkligen Dreieck', 'Radius – halber Durchmesser'];
const shot = (page: Page, name: string, full = false) => page.screenshot({ path: path.join(SHOTS, name), fullPage: full });

test.describe.configure({ mode: 'serial' });

test('supporters: invite → accept → cheer → student sees it → privacy → revoke → remove (+ avatars, multiple kids)', async ({ browser }) => {
  test.setTimeout(420_000);
  /* ---------- Mia: learns, gets a grade ---------- */
  const mia = await newUser(browser, { autoDismiss: true });
  await googleLogin(mia.page, MIA.email, MIA.name);
  await skipOnboarding(mia.page);
  const bioPath = await pasteTest(mia.page, { subject: 'biology', name: 'Bio: Die Zelle', days: 1, lines: BIO });
  await mia.page.getByTestId('practice-test').click();
  await playSession(mia.page, pairsOf(BIO));
  await dismissCelebrations(mia.page);
  await mia.page.getByTestId('done-home').click();
  await dismissCelebrations(mia.page);
  await enterGrade(mia.page, bioPath, '2+');

  // avatar: Mia's Google picture is cached on our server and served same-origin with a long cache
  const me = await apiCall(mia.page, 'GET', '/api/me');
  expect(me.body.user.avatar).toMatch(/^\/api\/avatars\/\d+\?v=[\w-]+&s=[\w-]+$/);
  const av = await mia.page.request.get(me.body.user.avatar);
  expect(av.status()).toBe(200);
  expect(av.headers()['content-type']).toBe('image/png');
  expect(av.headers()['cache-control']).toContain('immutable');
  const { last } = await (await mia.page.request.get('http://localhost:9090/__avatar_last')).json();
  expect(last.size).toBe(256);                                                       // we asked Google for =s256-c
  const forged = String(me.body.user.avatar).replace(/s=[\w-]+$/, 's=AAAAAAAAAAAAAAAAAAAAAA');
  expect((await mia.page.request.get(forged)).status()).toBe(404);
  await mia.page.goto('/me');
  await expect(mia.page.locator('.me-hero [data-testid="avatar-img"]').first()).toBeVisible();
  expect(await mia.page.locator('.me-hero [data-testid="avatar-img"]').first().evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth)).toBe(256);

  /* ---------- Mia invites Oma ---------- */
  const join1 = await createInvite(mia.page, 'grandma', 'Oma Gisela', 1);
  await expect(mia.page.getByTestId('invite-qr')).toBeVisible();
  await shot(mia.page, 'mobile-20-invite.png');

  /* ---------- Oma accepts (signs in with Google on the way) ---------- */
  const oma = await newUser(browser, { autoDismiss: true });
  await acceptInvite(oma.page, join1, OMA, 'Mia');
  await expect(oma.page.getByTestId('join-done')).toContainText('Mia');
  await shot(oma.page, 'mobile-21-join-done.png');
  await oma.page.getByTestId('join-go').click();
  await expect(oma.page).toHaveURL(/\/cheer$/);
  await expect(oma.page.getByTestId('kid-card')).toHaveCount(1);
  const miaId = await oma.page.getByTestId('kid-card').first().getAttribute('data-kid');
  expect(miaId).toMatch(/^\d+$/);
  await expect(oma.page.getByTestId('kid-card').first().getByTestId('avatar-img')).toBeVisible();
  await shot(oma.page, 'mobile-22-cheer-overview.png');

  // a single-use link can't be used twice
  const tom = await newUser(browser, { autoDismiss: true });
  await tom.page.goto(join1);
  await expect(tom.page.getByTestId('join-error')).toBeVisible();

  /* ---------- Oma cheers ---------- */
  await oma.page.getByTestId('kid-card').first().click();
  await expect(oma.page.getByTestId('kid-detail')).toBeVisible();
  await expect(oma.page.getByTestId('kid-latest-grade')).toHaveText('2+');
  const latest = oma.page.getByTestId('kid-result');
  await latest.getByTestId('react-❤️').click();
  await expect(latest.getByTestId('react-❤️')).toHaveAttribute('aria-pressed', 'true');
  await latest.getByTestId('react-🎉').click();
  await expect(latest.getByTestId('react-🎉')).toHaveAttribute('aria-pressed', 'true');
  await latest.getByTestId('react-msg').click();
  await latest.getByTestId('msg-proud').click();
  await expect(latest.locator('.react-mymsg')).toBeVisible();
  const ms = oma.page.getByTestId('kid-milestone').first();
  await ms.getByTestId('react-🔥').click();
  await expect(ms.getByTestId('react-🔥')).toHaveAttribute('aria-pressed', 'true');
  // supporters never get cards/content
  const kid = await apiCall(oma.page, 'GET', `/api/kids/${miaId}`);
  expect(JSON.stringify(kid.body)).not.toContain('Mitochondrium');
  expect(kid.body.kid.results[0].result.value).toBeCloseTo(1.7, 5);
  await shot(oma.page, 'mobile-23-kid-detail.png');

  /* ---------- Mia sees who cheered ---------- */
  await mia.page.goto('/');
  await expect(mia.page.getByTestId('cheer-pop')).toBeVisible({ timeout: 15000 });
  await expect(mia.page.getByTestId('cheer-pop-line')).toContainText('Oma Gisela');
  await expect(mia.page.getByTestId('cheer-pop').getByTestId('avatar-img').first()).toBeVisible();
  await mia.page.waitForTimeout(700);
  await shot(mia.page, 'mobile-24-cheer-pop.png');
  await mia.page.getByTestId('cheer-ok').click();
  await mia.page.goto(bioPath);
  await expect(mia.page.getByTestId('cheer-chips')).toContainText('Oma Gisela');
  await mia.page.goto('/me');
  await expect(mia.page.getByTestId('cheer-item')).toHaveCount(4);
  await expect(mia.page.getByTestId('my-supporters').getByTestId('avatar-img')).toBeVisible();
  await shot(mia.page, 'mobile-25-me-feed.png', true);
  await expect(mia.page.getByTestId('cheer-dot')).toHaveCount(0, { timeout: 8000 });

  /* ---------- Tom (no Google picture) → Oma cheers for two kids ---------- */
  await googleLogin(tom.page, TOM.email, TOM.name);
  await skipOnboarding(tom.page);
  const mathPath = await pasteTest(tom.page, { subject: 'math', name: 'Mathe: Geometrie', days: 3, lines: MATH });
  await enterGrade(tom.page, mathPath, '1');
  await tom.page.goto('/me');
  await expect(tom.page.locator('.me-hero [data-testid="avatar-initials"]').first()).toHaveText('TB');
  const join2 = await createInvite(tom.page, 'grandma', 'Oma', 1);
  await acceptInvite(oma.page, join2, undefined, 'Tom');
  await oma.page.getByTestId('join-go').click();
  await expect(oma.page.getByTestId('kid-card')).toHaveCount(2);
  await expect(oma.page.locator('[data-testid="kid-card"]').filter({ hasText: 'Tom' }).getByTestId('avatar-initials')).toBeVisible();
  await shot(oma.page, 'mobile-26-cheer-two-kids.png', true);
  // the same overview on a desktop
  const omaDesk = await newUser(browser, { mobile: false, autoDismiss: true });
  await googleLogin(omaDesk.page, OMA.email, OMA.name);
  await omaDesk.page.goto('/cheer');
  await expect(omaDesk.page.getByTestId('kid-card')).toHaveCount(2);
  await omaDesk.page.waitForTimeout(500);
  await shot(omaDesk.page, 'desktop-10-cheer-overview.png');
  await omaDesk.page.getByTestId('kid-card').filter({ hasText: 'Mia' }).click();
  await expect(omaDesk.page.getByTestId('kid-detail')).toBeVisible();
  await omaDesk.page.waitForTimeout(800);
  await shot(omaDesk.page, 'desktop-11-kid-detail.png');

  /* ---------- privacy: Mia hides results from Oma ---------- */
  await mia.page.goto('/supporters');
  const row = mia.page.locator('[data-testid="sup-row"][data-name="Oma Gisela"]');
  await expect(row).toBeVisible();
  await expect(row.getByTestId('avatar-img')).toBeVisible();
  await row.getByTestId('sup-results').uncheck();
  await expect.poll(async () => (await apiCall(oma.page, 'GET', `/api/kids/${miaId}`)).body.kid.results).toBeUndefined();
  const testId = bioPath.split('/').pop();
  expect((await apiCall(oma.page, 'POST', `/api/kids/${miaId}/react`, { kind: 'result', id: testId, reaction: '⭐', on: true })).status).toBe(403);
  await row.getByTestId('sup-results').check();
  await expect.poll(async () => (await apiCall(oma.page, 'GET', `/api/kids/${miaId}`)).body.kid.results?.length).toBe(1);
  // another user can't see Mia
  expect((await apiCall(tom.page, 'GET', `/api/kids/${miaId}`)).status).toBe(403);

  /* ---------- a revoked invite stops working ---------- */
  const join3 = await createInvite(mia.page, 'dad', 'Papa', 2);
  await mia.page.goto('/supporters');
  await mia.page.locator('[data-testid="inv-row"][data-status="open"]').getByTestId('inv-revoke').first().click();
  await expect(mia.page.locator('[data-testid="inv-row"][data-status="revoked"]')).toHaveCount(1);
  await tom.page.goto(join3);
  await expect(tom.page.getByTestId('join-error')).toBeVisible();

  /* ---------- Mia removes Oma → Oma loses access immediately ---------- */
  mia.page.once('dialog', d => d.accept());
  await row.getByTestId('sup-remove').click();
  await expect(mia.page.locator('[data-testid="sup-row"][data-name="Oma Gisela"]')).toHaveCount(0);
  expect((await apiCall(oma.page, 'GET', `/api/kids/${miaId}`)).status).toBe(403);
  await oma.page.goto(`/cheer/${miaId}`);
  await expect(oma.page.getByTestId('kid-no-access')).toBeVisible();
  await oma.page.goto('/cheer');
  await expect(oma.page.getByTestId('kid-card')).toHaveCount(1);
  // her cheers are gone too
  expect((await apiCall(mia.page, 'GET', '/api/cheers')).body.cheers).toHaveLength(0);

  /* ---------- GDPR export contains the supporter data ---------- */
  const exMia = (await apiCall(mia.page, 'GET', '/api/me/export')).body;
  expect(exMia.supporters.mySupporters).toHaveLength(0);
  expect(exMia.supporters.invites.length).toBeGreaterThanOrEqual(2);
  const exOma = (await apiCall(oma.page, 'GET', '/api/me/export')).body;
  expect(exOma.supporters.iSupport.map((x: { name: string }) => x.name)).toEqual([TOM.name]);
  expect(exOma.account.profilePicture.dataUrl).toMatch(/^data:image\/png;base64,/);

  for (const c of [mia, oma, tom, omaDesk]) await c.ctx.close();
});
