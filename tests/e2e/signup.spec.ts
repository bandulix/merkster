/* Registration codeword (SIGNUP_CODE) end-to-end, through the real mock-Google sign-in path.
   The server reads SIGNUP_CODE at start, so this spec adapts to how the app under test was started:
   - without SIGNUP_CODE: "no field, normal sign-up" (the rest is skipped)
   - with SIGNUP_CODE (and E2E_SIGNUP_CODE = the same value): new user without / with a wrong code is rejected (no account),
     the right code creates the account (before Google and after Google), existing users and invited supporters need no code. */
import { expect, test, type Page, type APIRequestContext } from '@playwright/test';
import { acceptInvite, apiCall, newUser } from './helpers';

const CODE = process.env.E2E_SIGNUP_CODE || '';
const RUN = Date.now().toString(36);
const NEW1 = { email: `neu.${RUN}@example.com`, name: 'Nele Neu' };
const NEW2 = { email: `vorab.${RUN}@example.com`, name: 'Vito Vorab' };
const OPA = { email: `opa.${RUN}@example.com`, name: 'Otto Opa' };
const OPEN = { email: `open.${RUN}@example.com`, name: 'Olli Offen' };

const codeRequired = async (request: APIRequestContext) => !!(await (await request.get('/api/config')).json()).auth.signupCode;
/** login page → (optional codeword) → Google button → mock Google form → wherever the server sends us */
async function signIn(page: Page, who: { email: string; name: string }, code?: string) {
  await page.goto('/login');
  if (code !== undefined) await page.getByTestId('signup-code').fill(code);
  await page.getByTestId('google-login').click();
  await page.waitForURL(/\/authorize/);
  await page.locator('#email').fill(who.email);
  await page.locator('#name').fill(who.name);
  await page.locator('#signin').click();
  await page.waitForURL(u => !/\/authorize|\/api\/auth/.test(u.pathname));
}
const me = async (page: Page) => (await apiCall(page, 'GET', '/api/me')).status;

test.describe.configure({ mode: 'serial' });

test('no SIGNUP_CODE: no codeword field, normal sign-up', async ({ browser, request }) => {
  test.skip(await codeRequired(request), 'server runs with SIGNUP_CODE');
  const { ctx, page } = await newUser(browser);
  await page.goto('/login');
  await expect(page.getByTestId('google-login')).toBeVisible();
  await expect(page.getByTestId('signup-code')).toHaveCount(0);
  expect((await (await page.request.post('/api/auth/signup-code', { headers: { 'x-merkster': '1', 'content-type': 'application/json' }, data: { code: 'x' } })).json())).toMatchObject({ ok: true, required: false });
  await signIn(page, OPEN);
  await expect(page).not.toHaveURL(/\/login/);
  expect(await me(page)).toBe(200);
  await ctx.close();
});

test.describe('with SIGNUP_CODE', () => {
  test.beforeEach(async ({ request }) => {
    test.skip(!(await codeRequired(request)), 'server runs without SIGNUP_CODE');
    test.skip(!CODE, 'set E2E_SIGNUP_CODE to the server’s SIGNUP_CODE');
  });

  test('the code is never sent to the browser', async ({ request }) => {
    const txt = await (await request.get('/api/config')).text();
    expect(txt).not.toContain(CODE);
    expect(JSON.parse(txt).auth.signupCode).toBe(true);
  });

  test('new user without a code / with a wrong code gets no account; the right code creates it', async ({ browser }) => {
    const { ctx, page } = await newUser(browser, { locale: 'de-DE' });
    await page.goto('/login');
    await expect(page.getByTestId('signup-code')).toBeVisible();
    // 1) no code → Google → parked, asked for the codeword, NO account / session
    await signIn(page, NEW1);
    await expect(page).toHaveURL(/\/login\?signup=code/);
    await expect(page.getByTestId('signup-code-step')).toContainText('Nele');
    await expect(page.getByTestId('signup-code-step')).toContainText(NEW1.email);
    expect(await me(page)).toBe(401);
    // 2) wrong code → clear error, still no account, can retry
    await page.getByTestId('signup-code').fill('ganz-falsch');
    await page.getByTestId('signup-complete').click();
    await expect(page.getByTestId('code-error')).toBeVisible();
    expect(await me(page)).toBe(401);
    // still a NEW user: signing in again without a code asks again (proves nothing was created)
    await page.getByTestId('signup-other').click();
    await page.waitForURL(/\/authorize/);
    await page.locator('#email').fill(NEW1.email); await page.locator('#name').fill(NEW1.name); await page.locator('#signin').click();
    await page.waitForURL(/\/login\?signup=code/);
    expect(await me(page)).toBe(401);
    // 3) right code (other case + spaces, as typed on a phone) → account + session
    await page.getByTestId('signup-code').fill('  ' + CODE.toUpperCase() + ' ');
    await page.getByTestId('signup-complete').click();
    await page.waitForURL(u => !/\/login/.test(u.pathname));
    expect(await me(page)).toBe(200);
    await ctx.close();
  });

  test('wrong code before Google is rejected on the login page; the right one goes straight in', async ({ browser }) => {
    const { ctx, page } = await newUser(browser);
    await page.goto('/login');
    await page.getByTestId('signup-code').fill('nope');
    await page.getByTestId('google-login').click();
    await expect(page.getByTestId('code-error')).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
    expect(await me(page)).toBe(401);
    await signIn(page, NEW2, CODE);
    await expect(page).not.toHaveURL(/\/login/);
    expect(await me(page)).toBe(200);
    await ctx.close();
  });

  test('existing user logs in without a code', async ({ browser }) => {
    const { ctx, page } = await newUser(browser);
    await signIn(page, NEW1);   // created in the test above
    await expect(page).not.toHaveURL(/\/login/);
    expect(await me(page)).toBe(200);
    await ctx.close();
  });

  test('invited supporter needs no code', async ({ browser }) => {
    // the student (existing account) creates an invite
    const kid = await newUser(browser);
    await signIn(kid.page, NEW2);
    const inv = await apiCall(kid.page, 'POST', '/api/invites', { relation: 'grandparent', label: 'Opa', maxUses: 1, days: 7 });
    expect(inv.status).toBe(201);
    const joinPath = new URL(inv.body.invite.url).pathname + new URL(inv.body.invite.url).hash;
    // Opa: brand-new Google account, no codeword
    const opa = await newUser(browser);
    await opa.page.goto(joinPath);
    await expect(opa.page.getByTestId('invite-no-code')).toBeVisible();
    await acceptInvite(opa.page, joinPath, OPA, 'Vito');
    await expect(opa.page.getByTestId('join-done')).toBeVisible();
    expect(await me(opa.page)).toBe(200);
    // a made-up invite token does not unlock sign-up
    const fake = await apiCall(opa.page, 'POST', '/api/auth/invite-pass', { token: 'A'.repeat(32) });
    expect(fake.status).toBe(404);
    await kid.ctx.close(); await opa.ctx.close();
  });
});
