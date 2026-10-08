import { expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

export const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
export const SHOTS = path.join(ROOT, 'screenshots');
export const OUT = path.join(ROOT, 'tests/output');
fs.mkdirSync(SHOTS, { recursive: true }); fs.mkdirSync(OUT, { recursive: true });

export const MOBILE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
export const DESKTOP = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 };

export async function newUser(browser: Browser, opts: { locale?: string; mobile?: boolean; colorScheme?: 'light' | 'dark'; autoDismiss?: boolean } = {}): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({ ...(opts.mobile === false ? DESKTOP : MOBILE), locale: opts.locale || 'en-US', colorScheme: opts.colorScheme || 'light', acceptDownloads: true, timezoneId: 'Europe/Berlin' });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('[pageerror]', e.message));
  // level-up / badge moments can pop up at any time (they're time-based) – specs that don't test them let Playwright clear them
  if (opts.autoDismiss) await page.addLocatorHandler(page.locator('[data-testid="levelup"], [data-testid="badge-unlock"]'), async o => { await o.getByTestId('cel-ok').click(); }, { noWaitAfter: true });
  return { ctx, page };
}

/** Sign in through the mock Google (OIDC) provider – the real server code path (PKCE, state, nonce, id_token). */
export async function googleLogin(page: Page, email: string, name: string) {
  await page.goto('/');
  await expect(page).toHaveURL(/\/login/);
  await page.getByTestId('google-login').click();
  await page.waitForURL(/\/authorize/);
  await page.locator('#email').fill(email);
  await page.locator('#name').fill(name);
  await page.locator('#signin').click();
  await page.waitForURL(u => !/\/authorize|\/login/.test(u.pathname));
}

const clean = (s: string | null) => (s || '').replace(/🔊/g, '').replace(/\s+/g, ' ').trim();

/** Play a whole practice session like a diligent student: answers what it knows, says "don't know" otherwise
 *  and learns the solution, so the card is right when it comes back (retry-until-correct). */
export async function playSession(page: Page, known: Map<string, string>, opts: { onCard?: (n: number) => Promise<void> } = {}) {
  const stage = page.locator('.ses-stage');
  for (let n = 0; n < 400; n++) {
    try { await page.locator('[data-testid="done"], .ses-stage .qcard').first().waitFor({ timeout: 15000 }); }
    catch (e) { await page.screenshot({ path: path.join(OUT, 'debug-session.png') }); fs.writeFileSync(path.join(OUT, 'debug-session.html'), await page.content()); throw e; }
    if (await page.getByTestId('done').isVisible()) return n;
    await opts.onCard?.(n);
    const card = stage.locator('.qcard').first();
    const tid = (await card.getAttribute('data-testid')) || '';
    const stepKey = await page.getByTestId('ses-count').textContent();
    if (tid === 'card-study') {
      const prompt = clean(await card.locator('.prompt').first().innerText());
      const ans = await card.getByTestId('study-answer').count() ? clean(await card.getByTestId('study-answer').innerText()) : '';
      if (ans) { known.set(prompt, ans); known.set(ans, prompt); }
      await card.getByTestId('studied').click();
    } else if (tid === 'card-mc') {
      await card.getByTestId('mc-show').click();
      const prompt = clean(await card.getByTestId('prompt').innerText());
      const ans = known.get(prompt);
      const opts2 = card.getByTestId('mc-opt');
      const target = ans ? opts2.filter({ hasText: ans }).first() : opts2.first();
      await (await target.count() ? target : opts2.first()).click();
      const sol = page.locator('.sheet .sol');
      if (await sol.count()) known.set(prompt, clean(await sol.innerText()));
      await clickNext(page);
    } else if (tid === 'card-match') {
      for (let round = 0; round < 2; round++) {
        await page.waitForTimeout(500);
        const keys = await card.locator('[data-testid="m-l"]:not([disabled])').evaluateAll(els => els.map(e => e.getAttribute('data-k')!));
        for (const k of keys) { await stage.locator(`[data-testid="m-l"][data-k="${k}"]`).click(); await stage.locator(`[data-testid="m-r"][data-k="${k}"]`).click(); }
        if (await page.getByTestId('sheet').count()) break;
      }
      await clickNext(page);
    } else if (tid === 'card-sentence') {
      const term = clean(await card.locator('.prompt').innerText());
      await card.getByTestId('answer').fill(`I really like ${term} and I use it every day.`);
      await card.getByTestId('check').click();
      await clickNext(page);
    } else {
      const promptEl = card.getByTestId('prompt');
      const key = clean(await (await promptEl.count() ? promptEl : card.locator('.prompt')).first().innerText());
      const ans = known.get(key);
      const input = card.getByTestId('answer');
      if (await card.getByTestId('reveal').count()) {
        await input.fill(ans || '');
        await card.getByTestId('reveal').click();
        if (await page.getByTestId('self-yes').count()) {
          if (!ans) known.set(key, clean(await page.locator('.sheet .sol').innerText()));
          await page.getByTestId(ans ? 'self-yes' : 'self-no').click();
        }
        await clickNext(page);
      } else if (ans) {
        await input.fill(ans); await card.getByTestId('check').click();
        if (await page.getByTestId('retry').count()) { await page.getByTestId('retry').click(); await card.getByTestId('dunno').click(); }
        if (await page.getByTestId('solution').count()) known.set(key, clean(await page.getByTestId('solution').innerText()));
        await clickNext(page);
      } else {
        await card.getByTestId('dunno').click();
        known.set(key, clean(await page.getByTestId('solution').innerText()));
        await clickNext(page);
      }
    }
    // wait until the stage moved on (count changes, a new card mounts, or the session ends)
    await expect.poll(async () => (await page.getByTestId('done').isVisible()) || (await page.getByTestId('sheet').count()) === 0 || (await page.getByTestId('ses-count').textContent()) !== stepKey, { timeout: 8000 }).toBeTruthy();
    await page.waitForTimeout(80);
  }
  throw new Error('session did not finish');
}
async function clickNext(page: Page) {
  await page.waitForTimeout(150);
  const b = page.getByTestId('sheet').getByRole('button').last();   // primary button ("continue"/"got it") is last
  try { await b.click({ timeout: 2500 }); } catch { /* auto-advanced */ }
}

export const isoDay = (offset = 0) => { const d = new Date(Date.now() + offset * 864e5); return d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' }); };
/** PNG width/height from the IHDR chunk */
export const pngSize = (buf: Buffer) => ({ w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) });

/** Clear any level-up / badge overlays so the underlying page is interactable. */
export async function dismissCelebrations(page: Page) {
  for (let i = 0; i < 6; i++) {
    const cel = page.locator('[data-testid="levelup"], [data-testid="badge-unlock"]');
    if (!(await cel.count())) return;
    await cel.first().getByTestId('cel-ok').click();
    await page.waitForTimeout(250);
  }
}

/** new student: skip onboarding */
export async function skipOnboarding(page: Page) {
  await expect(page.getByTestId('onboarding')).toBeVisible();
  await page.getByTestId('ob-skip').click();
}
/** create a test from pasted "term – meaning" lines; returns the test path (/test/<id>) */
export async function pasteTest(page: Page, o: { subject: string; name: string; days: 1 | 3 | 7 | 14; lines: string[]; foreign?: string }) {
  await page.getByTestId('nav-new').click();
  await page.getByTestId('subj-' + o.subject).click();
  if (o.foreign) await page.getByTestId('foreign-' + o.foreign).click();
  await page.getByTestId('test-name').fill(o.name);
  await page.getByTestId('wiz-next').click();
  await page.getByTestId('qdate-' + o.days).click();
  await page.getByTestId('wiz-next').click();
  await page.getByTestId('wiz-next').click();
  await page.getByTestId('paste-tile').click();
  await page.getByTestId('paste-text').fill(o.lines.join('\n'));
  await page.getByTestId('paste-parse').click();
  await expect(page.getByTestId('cards-found')).toHaveText(String(o.lines.length));
  await page.getByTestId('save-cards').click();
  await expect(page.getByTestId('card-list').locator('li')).toHaveCount(o.lines.length);
  return new URL(page.url()).pathname;
}
/** the test happened yesterday → enter a German grade */
export async function enterGrade(page: Page, testPath: string, grade: string) {
  await page.goto(testPath);
  await page.getByTestId('td-settings').click();
  await page.getByTestId('td-date').fill(isoDay(-1));
  await page.getByTestId('td-ask-result').click();
  await page.getByTestId('gs-de_grade').click();
  await page.getByTestId('grade-' + grade).click();
  await page.getByTestId('save-result').click();
  await expect(page.getByTestId('td-result')).toHaveText(grade);
  await dismissCelebrations(page);
}
export const pairsOf = (lines: string[]) => { const m = new Map<string, string>(); for (const l of lines) { const [a, b] = l.split(' – '); m.set(a, b); m.set(b, a); } return m; };

/** API call from a signed-in page (cookie + CSRF header) */
export async function apiCall(page: Page, method: 'GET' | 'POST' | 'PATCH' | 'DELETE' | 'PUT', url: string, data?: unknown) {
  const r = await page.request.fetch(url, { method, headers: { 'x-merkster': '1', 'content-type': 'application/json' }, data: data === undefined ? undefined : JSON.stringify(data) });
  let body: any = null; try { body = await r.json(); } catch { /* not json */ }
  return { status: r.status(), body };
}
/** student creates an invite on /supporters, returns "/join#<token>" */
export async function createInvite(page: Page, rel: string, label: string, uses: 1 | 2 | 5 = 1) {
  await page.goto('/supporters');
  await page.getByTestId('invite-new').click();
  await page.getByTestId('rel-' + rel).click();
  await page.getByTestId('inv-label').fill(label);
  await page.getByTestId('inv-uses-' + uses).click();
  await page.getByTestId('inv-create').click();
  const url = await page.getByTestId('invite-url').inputValue();
  expect(url).toMatch(/\/join#[A-Za-z0-9_-]{32}$/);
  const u = new URL(url);
  return u.pathname + u.hash;
}
/** someone opens an invite link: signs in with Google if needed, accepts, lands on the cheering overview */
export async function acceptInvite(page: Page, joinPath: string, who?: { email: string; name: string }, studentName?: string) {
  await page.goto(joinPath);
  await expect(page.getByTestId('join')).toBeVisible();
  if (studentName) await expect(page.getByTestId('join-title')).toContainText(studentName);
  if (who && !(await page.getByTestId('join-accept').count())) {
    await page.getByTestId('join').getByTestId('google-login').click();
    await page.waitForURL(/\/authorize/);
    await page.locator('#email').fill(who.email);
    await page.locator('#name').fill(who.name);
    await page.locator('#signin').click();
    await page.waitForURL(/\/join/);
  }
  await page.getByTestId('join-accept').click();
  await expect(page.getByTestId('join-done')).toBeVisible();
}
