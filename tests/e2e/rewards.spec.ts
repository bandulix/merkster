/* Supporter rewards end-to-end.
   1) "5 € per 1": Oma sets a rule → Ben enters a 1 → both sides see it → Oma marks it paid → verified → grading switch warning.
   2) Report cards with THREE supporters: mock AI extraction → review/match → confirm → unboxing → rewards per supporter
      (grand total per currency + breakdown) → simulator never creates rewards → supporters only see their own amounts
      (until the student allows it) → a supporter reacts on the report card. */
import { expect, test, type Page } from '@playwright/test';
import path from 'node:path';
import { acceptInvite, apiCall, createInvite, dismissCelebrations, enterGrade, googleLogin, isoDay, newUser, pasteTest, ROOT, SHOTS, skipOnboarding, calm } from './helpers';

const RUN = Date.now().toString(36);
const shot = async (page: Page, name: string, full = false, fx = false) => { if (!fx) await calm(page); await page.screenshot({ path: path.join(SHOTS, name), fullPage: full }); };
const BIO = ['Mitochondrium – Kraftwerk der Zelle', 'Ribosom – Proteinfabrik', 'Zellkern – enthält die DNA', 'Zellmembran – Grenze der Zelle'];
test.describe.configure({ mode: 'serial' });

async function setGrading(page: Page, sys: string) {
  await page.goto('/settings');
  await page.getByTestId('grading').selectOption(sys);
}
async function openKid(page: Page, name: string) {
  await page.goto('/cheer');
  await page.getByTestId('kid-card').filter({ hasText: name }).first().click();
  await expect(page.getByTestId('kid-detail')).toBeVisible();
  return new URL(page.url()).pathname.split('/').pop()!;
}
async function newRule(page: Page, o: { kind: string; grade?: string; mode?: 'at_least' | 'exactly'; subject?: string; avg?: string; money?: [string, string]; text?: string }) {
  const before = await page.getByTestId('rule-row').count();
  await page.getByTestId('rule-new').click();
  await page.getByTestId('rt-' + o.kind).click();
  if (o.subject) await page.getByTestId('rule-rc-subject').selectOption(o.subject);
  if (o.grade) await page.getByTestId('rg-' + o.grade).click();
  if (o.mode) await page.getByTestId('rm-' + o.mode).click();
  if (o.avg) await page.getByTestId('rule-avg').fill(o.avg);
  if (o.money) { await page.getByTestId('rw-money').click(); await page.getByTestId('rule-amount').fill(o.money[0]); await page.getByTestId('rule-currency').selectOption(o.money[1]); }
  if (o.text) { await page.getByTestId('rw-other').click(); await page.getByTestId('rule-text').fill(o.text); }
  await expect(page.getByTestId('rule-preview-live')).toBeVisible();
  await page.getByTestId('rule-save').click();
  await expect(page.getByTestId('rule-row')).toHaveCount(before + 1);
}
const grand = (page: Page, scope: string, cur: string) => page.getByTestId(scope).locator(`[data-testid="grand-money"][data-currency="${cur}"]`).first();

test('rewards: "5 € per 1" – rule → earned on both sides → mark paid → verified → grading switch warning', async ({ browser }) => {
  test.setTimeout(300_000);
  const ben = await newUser(browser, { autoDismiss: true }), oma = await newUser(browser, { autoDismiss: true });
  await googleLogin(ben.page, `ben.${RUN}@example.com`, 'Ben Kraus');
  await skipOnboarding(ben.page);
  await setGrading(ben.page, 'de_grade');
  const bio = await pasteTest(ben.page, { subject: 'biology', name: 'Bio: Zellen', days: 3, lines: BIO });
  const join = await createInvite(ben.page, 'grandma', 'Oma Ilse', 1);
  await acceptInvite(oma.page, join, { email: `ilse.${RUN}@example.com`, name: 'Ilse Kraus' }, 'Ben');

  // Oma: "5 € for every 1"
  await openKid(oma.page, 'Ben');
  await newRule(oma.page, { kind: 'grade', grade: '1', mode: 'at_least', money: ['5', 'EUR'] });
  await expect(oma.page.getByTestId('rule-preview').first()).toContainText('5');
  await shot(oma.page, 'mobile-27-rule-editor.png');

  // Ben sees what he can earn, then gets a 1 → the reward pops up
  await ben.page.goto(bio);
  await expect(ben.page.getByTestId('earn-card')).toHaveCount(1);
  await enterGrade(ben.page, bio, '1');
  await expect(ben.page.getByTestId('reward-pop')).toBeVisible({ timeout: 20_000 });
  await expect(ben.page.getByTestId('reward-pop-amount')).toContainText('5');
  await shot(ben.page, 'mobile-28-reward-pop.png');
  await ben.page.getByTestId('reward-ok').click();
  await dismissCelebrations(ben.page);
  await ben.page.goto('/rewards');
  await expect(ben.page.getByTestId('rw-item')).toHaveCount(1);
  await expect(ben.page.getByTestId('rw-item').first()).toHaveAttribute('data-status', 'open');
  await expect(grand(ben.page, 'rw-grand', 'EUR')).toHaveAttribute('data-amount', '5');

  // Oma: open list → mark paid
  await oma.page.goto('/cheer/rewards');
  await expect(oma.page.getByTestId('given-item')).toHaveCount(1);
  await expect(oma.page.getByTestId('given-line').first()).toContainText('5');
  await shot(oma.page, 'mobile-29-given-rewards.png');
  await oma.page.getByTestId('mark-paid').click();
  await expect(oma.page.getByTestId('given-paid')).toBeVisible();
  await ben.page.reload();
  await expect(ben.page.getByTestId('rw-item').first()).toHaveAttribute('data-status', 'paid');
  // "Oma marked it as done" pops up once
  await expect(ben.page.getByTestId('reward-pop')).toBeVisible({ timeout: 20_000 });
  await ben.page.getByTestId('reward-ok').click();
  await expect(ben.page.getByTestId('reward-pop')).toHaveCount(0);
  await ben.page.getByTestId('rw-f-open').click();
  await expect(ben.page.getByTestId('rw-grand').getByTestId('grand-money')).toHaveAttribute('data-amount', '0');
  await ben.page.getByTestId('rw-f-paid').click();
  await expect(grand(ben.page, 'rw-grand', 'EUR')).toHaveAttribute('data-amount', '5');

  // the result is self-reported until Oma verifies it
  await openKid(oma.page, 'Ben');
  await expect(oma.page.getByTestId('res-status').first()).toContainText(/self-reported/i);
  await oma.page.getByTestId('verify-btn').first().click();
  await expect(oma.page.getByTestId('res-status').first()).toContainText(/verified/i);

  // Ben switches to US letter grades → Oma sees how her rule is converted
  await setGrading(ben.page, 'us_letter');
  await ben.page.goto('/');            // let the profile sync
  await expect.poll(async () => (await apiCall(oma.page, 'GET', '/api/kids')).body.kids[0].grading, { timeout: 20_000 }).toBe('us_letter');
  await oma.page.reload();
  await expect(oma.page.getByTestId('rule-converted')).toBeVisible();
  await ben.ctx.close(); await oma.ctx.close();
});

test('report cards: AI extraction → review → confirm → rewards from 3 supporters (totals per currency) → simulator → privacy → reactions', async ({ browser }) => {
  test.setTimeout(420_000);
  const lea = await newUser(browser, { autoDismiss: true }), oma = await newUser(browser, { autoDismiss: true }), opa = await newUser(browser, { autoDismiss: true }), papa = await newUser(browser, { autoDismiss: true });
  await googleLogin(lea.page, `lea.${RUN}@example.com`, 'Lea Brandt');
  await skipOnboarding(lea.page);
  await setGrading(lea.page, 'de_grade');
  // a Biology test this term with a 2 – the report card says 1 → "better than your tests"
  const bio = await pasteTest(lea.page, { subject: 'biology', name: 'Bio: Zellen', days: 3, lines: BIO });
  await enterGrade(lea.page, bio, '2');

  const sup = [
    { u: oma, rel: 'grandma', label: 'Oma', email: `oma.${RUN}@example.com`, name: 'Helga Brandt' },
    { u: opa, rel: 'grandpa', label: 'Opa Fritz', email: `fritz.${RUN}@example.com`, name: 'Fritz Meier' },
    { u: papa, rel: 'dad', label: 'Papa', email: `papa.${RUN}@example.com`, name: 'Jan Brandt' }
  ];
  for (const s of sup) { const j = await createInvite(lea.page, s.rel, s.label, 1); await acceptInvite(s.u.page, j, { email: s.email, name: s.name }, 'Lea'); }

  // three supporters, different rules and currencies
  await openKid(oma.page, 'Lea');
  await newRule(oma.page, { kind: 'rc_each', grade: '1', mode: 'at_least', money: ['5', 'EUR'] });       // 5 € for every 1
  await newRule(oma.page, { kind: 'rc_avg', avg: '2.0', text: 'Pizza night' });                          // Ø 2.0 or better → pizza
  await openKid(opa.page, 'Lea');
  await newRule(opa.page, { kind: 'rc_subject', subject: 'math', grade: '1', money: ['10', 'CHF'] });    // 10 CHF for a 1 in Maths
  await openKid(papa.page, 'Lea');
  await newRule(papa.page, { kind: 'rc_floor', grade: '3', money: ['20', 'EUR'] });                     // no grade worse than 3 → 20 €
  await shot(papa.page, 'mobile-30-rc-rule.png');

  // Lea: snap the report card → mock AI → review
  await lea.page.goto('/reports');
  await shot(lea.page, 'mobile-31-reports-empty.png');
  await lea.page.getByTestId('rc-add').click();
  await lea.page.getByTestId('rc-photo-input').setInputFiles(path.join(ROOT, 'tests/fixtures/zeugnis.png'));
  await expect(lea.page.getByTestId('rc-review')).toBeVisible({ timeout: 30_000 });
  const line = (raw: string) => lea.page.locator(`[data-testid="rc-line"][data-raw="${raw}"]`);
  await expect(lea.page.getByTestId('rc-line')).toHaveCount(12);
  await expect(line('Mathematik').getByTestId('rc-subj')).toHaveValue('math');
  await expect(line('Mathematik').getByTestId('rc-conf')).toHaveAttribute('data-level', 'high');
  await expect(line('Erdk.').getByTestId('rc-subj')).toHaveValue('geography');
  await expect(line('Englisch').getByTestId('rc-grade')).toHaveValue('1');          // "sehr gut" → 1
  await expect(line('Verhalten').getByTestId('rc-ignored')).toBeVisible();          // conduct is ignored
  await expect(line('Ev. Religion').getByTestId('rc-grade')).toHaveValue('');       // unreadable → the student fills it in
  await expect(lea.page.getByTestId('rc-notes')).toBeVisible();
  await expect(lea.page.getByTestId('rc-confirm')).toContainText('9');              // nothing saved yet; 9 complete lines
  await line('Ev. Religion').getByTestId('rc-grade').selectOption('2');
  await expect(line('Darstellendes Spiel').getByTestId('rc-subj')).toHaveValue('');
  await line('Darstellendes Spiel').getByTestId('rc-subj').selectOption('__new__');   // one tap: new subject
  // this report card closes the current term (so it lines up with the Biology test)
  const today = isoDay(0), y = Number(today.slice(0, 4)), m = Number(today.slice(5, 7));
  const sy = m >= 8 ? `${y}/${String(y + 1).slice(2)}` : `${y - 1}/${String(y).slice(2)}`;
  await lea.page.getByTestId('rc-year').fill(sy);
  await lea.page.getByTestId('rc-issued').fill(today);
  await expect((await apiCall(lea.page, 'GET', '/api/report-cards')).body.cards).toHaveLength(0);
  await shot(lea.page, 'mobile-32-rc-review.png');
  await lea.page.getByTestId('rc-confirm').click();

  // unboxing
  await expect(lea.page.getByTestId('rc-unbox')).toBeVisible();
  await lea.page.getByTestId('rc-unbox-open').click();
  await expect(lea.page.getByTestId('rc-unbox-line')).toHaveCount(11);
  await expect(lea.page.getByTestId('rc-unbox-avg')).toContainText(/1[.,]6/);
  // 5 ones × 5 € (Oma) + 20 € (Papa) = 45 € · 10 CHF (Opa) – never added together · + Pizza night
  await expect(grand(lea.page, 'rc-unbox-rewards', 'EUR')).toHaveAttribute('data-amount', '45');
  await expect(grand(lea.page, 'rc-unbox-rewards', 'CHF')).toHaveAttribute('data-amount', '10');
  await expect(lea.page.getByTestId('rc-unbox-rewards').getByTestId('grand-other')).toContainText('Pizza night');
  await expect(lea.page.getByTestId('rc-unbox-rewards').getByTestId('sb-row')).toHaveCount(3);
  await lea.page.waitForTimeout(3500);    // let the confetti settle
  await shot(lea.page, 'mobile-33-rc-unbox.png');
  await lea.page.getByTestId('rc-unbox-done').click();
  // the reward pop: grand total + per-supporter breakdown
  await expect(lea.page.getByTestId('reward-pop')).toBeVisible({ timeout: 20_000 });
  await expect(lea.page.getByTestId('reward-pop-breakdown').getByTestId('sb-row')).toHaveCount(3);
  await expect(lea.page.getByTestId('reward-pop-amount')).toContainText('45');
  await expect(lea.page.getByTestId('reward-pop-amount')).toContainText('10');
  await lea.page.waitForTimeout(3500);
  await shot(lea.page, 'mobile-34-reward-pop-multi.png');
  await lea.page.getByTestId('reward-ok').click();
  await dismissCelebrations(lea.page);

  // detail: report card vs. the term's tests
  const bioRow = lea.page.locator('[data-testid="rc-row"][data-subject="biology"]');
  await expect(bioRow.getByTestId('rc-exam-avg')).toContainText('2');
  await expect(bioRow.getByTestId('rc-gap')).toHaveAttribute('data-kind', 'better');
  await expect(lea.page.getByTestId('rc-nudge').first()).toBeVisible();                // "Track Maths next term?"
  await expect(grand(lea.page, 'rc-rewards', 'EUR')).toHaveAttribute('data-amount', '45');
  await lea.page.waitForTimeout(3000);
  await shot(lea.page, 'mobile-35-rc-detail.png');

  // rewards overview: grand total + per supporter, filters
  await lea.page.goto('/rewards');
  await expect(grand(lea.page, 'rw-grand', 'EUR')).toHaveAttribute('data-amount', '45');
  await expect(grand(lea.page, 'rw-grand', 'CHF')).toHaveAttribute('data-amount', '10');
  const rows = lea.page.getByTestId('rw-breakdown').getByTestId('sb-row');
  await expect(rows).toHaveCount(3);
  await expect(rows.filter({ hasText: 'Oma' }).getByTestId('sb-subtotal')).toContainText('25');
  await expect(rows.filter({ hasText: 'Oma' }).getByTestId('sb-subtotal')).toContainText('Pizza night');
  await expect(rows.filter({ hasText: 'Oma' }).getByTestId('sb-item').first()).toContainText('5×');
  await expect(rows.filter({ hasText: 'Opa' }).getByTestId('sb-subtotal')).toContainText('10');
  await expect(rows.filter({ hasText: 'Papa' }).getByTestId('sb-subtotal')).toContainText('20');
  await shot(lea.page, 'mobile-36-rewards-overview.png');
  await lea.page.getByTestId('rw-f-sup').selectOption({ label: 'Papa' });
  await expect(grand(lea.page, 'rw-grand', 'EUR')).toHaveAttribute('data-amount', '20');
  await lea.page.getByTestId('rw-r-term').click();
  await expect(grand(lea.page, 'rw-grand', 'EUR')).toHaveAttribute('data-amount', '20');
  const earnedCount = (await apiCall(lea.page, 'GET', '/api/rewards')).body.earned.length;
  expect(earnedCount).toBe(8);

  // simulator: same engine, never stores anything
  await lea.page.goto('/reports/simulate');
  await expect(lea.page.getByTestId('sim-label')).toBeVisible();
  await expect(lea.page.getByTestId('sim-subj')).toHaveCount(11);
  await lea.page.getByTestId('sim-all-1').click();
  await expect(grand(lea.page, 'sim-total', 'EUR')).toHaveAttribute('data-amount', '75');   // 11×5 + 20
  await expect(grand(lea.page, 'sim-total', 'CHF')).toHaveAttribute('data-amount', '10');
  await lea.page.getByTestId('sim-all-2').click();
  await expect(grand(lea.page, 'sim-total', 'EUR')).toHaveAttribute('data-amount', '20');
  await expect(lea.page.getByTestId('sim-hint').first()).toContainText('+');
  await lea.page.locator('[data-testid="sim-subj"][data-subject="math"]').getByTestId('sim-better').click();
  await expect(grand(lea.page, 'sim-total', 'EUR')).toHaveAttribute('data-amount', '25');
  await expect(grand(lea.page, 'sim-total', 'CHF')).toHaveAttribute('data-amount', '10');
  await expect(lea.page.getByTestId('sim-breakdown').getByTestId('sb-row')).toHaveCount(3);
  await lea.page.waitForTimeout(800);
  await shot(lea.page, 'mobile-37-simulator.png');
  expect((await apiCall(lea.page, 'GET', '/api/rewards')).body.earned.length).toBe(earnedCount);

  // supporters only see THEIR rules and amounts
  const kidId = await openKid(oma.page, 'Lea');
  const omaView = (await apiCall(oma.page, 'GET', `/api/kids/${kidId}/rewards`)).body;
  expect(omaView.others).toBeUndefined();
  expect(omaView.earned).toHaveLength(6);
  expect(omaView.earned.every((e: { reward: { currency?: string } }) => e.reward.currency !== 'CHF')).toBe(true);
  const papaView = (await apiCall(papa.page, 'GET', `/api/kids/${kidId}/rewards`)).body;
  expect(papaView.earned).toHaveLength(1);
  expect(papaView.rules).toHaveLength(1);
  expect(JSON.stringify(papaView)).not.toContain('Pizza');
  await expect(oma.page.getByTestId('kid-others-hidden')).toBeVisible();
  await expect(grand(oma.page, 'kid-my-total', 'EUR')).toHaveAttribute('data-amount', '25');

  // Oma sees the report card (not the photo – not allowed) and reacts
  await expect(oma.page.getByTestId('kid-rc')).toHaveCount(1);
  await expect(oma.page.getByTestId('kid-rc-line')).toHaveCount(11);
  await expect(oma.page.getByTestId('kid-rc-photo-btn')).toHaveCount(0);
  const cardId = await oma.page.getByTestId('kid-rc').first().getAttribute('data-card');
  expect((await apiCall(oma.page, 'GET', `/api/kids/${kidId}/report-cards/${cardId}/photo`)).status).toBe(403);
  await oma.page.getByTestId('kid-rc').first().getByTestId('react-🎉').click();
  await expect(oma.page.getByTestId('kid-rc').first().getByTestId('react-🎉')).toHaveAttribute('aria-pressed', 'true');
  await oma.page.getByTestId('kid-rcs').scrollIntoViewIfNeeded();
  await shot(oma.page, 'mobile-38-kid-report-card.png');

  // Lea: the cheer arrives; then she lets supporters see each other and allows Oma to see photos
  await lea.page.goto('/');
  await expect(lea.page.getByTestId('cheer-pop')).toBeVisible({ timeout: 20_000 });
  await expect(lea.page.getByTestId('cheer-pop-line')).toContainText('report card');
  await lea.page.getByTestId('cheer-ok').click();
  await lea.page.goto('/supporters');
  await lea.page.getByTestId('see-each-other').check();
  await expect.poll(async () => (await apiCall(lea.page, 'GET', '/api/supporters')).body.seeEachOther).toBe(true);
  const omaSup = (await apiCall(lea.page, 'GET', '/api/supporters')).body.supporters.find((s: { label: string }) => s.label === 'Oma');
  expect((await apiCall(lea.page, 'PATCH', `/api/supporters/${omaSup.id}`, { showPhotos: true })).status).toBe(200);
  await oma.page.reload();
  await expect(oma.page.getByTestId('kid-other')).toHaveCount(2);
  await expect(oma.page.getByTestId('kid-other').filter({ hasText: 'Papa' }).getByTestId('kid-other-total')).toContainText('20');
  await expect(oma.page.getByTestId('kid-rc-photo-btn')).toBeVisible();
  const ph = await oma.page.request.get(`/api/kids/${kidId}/report-cards/${cardId}/photo`);
  expect(ph.status()).toBe(200);
  expect(ph.headers()['content-type']).toMatch(/^image\//);
  // Opa still can't see the photo
  expect((await apiCall(opa.page, 'GET', `/api/kids/${kidId}/report-cards/${cardId}/photo`)).status).toBe(403);

  // desktop: report cards with trend + simulator
  const desk = await newUser(browser, { mobile: false, autoDismiss: true });
  await googleLogin(desk.page, `lea.${RUN}@example.com`, 'Lea Brandt');
  await desk.page.goto('/reports/' + cardId);
  await expect(desk.page.getByTestId('rc-detail')).toBeVisible();
  await dismissCelebrations(desk.page);
  await shot(desk.page, 'desktop-12-report-card.png');
  await desk.page.goto('/reports/simulate');
  await desk.page.getByTestId('sim-all-1').click();
  await desk.page.waitForTimeout(800);
  await shot(desk.page, 'desktop-13-simulator.png');
  for (const c of [lea, oma, opa, papa, desk]) await c.ctx.close();
});
