// @ts-nocheck – assertion-heavy port of the original runner; inputs are intentionally loose
// Ported from the v0 node test runner: 42 behaviour checks for answer checking, parsing and scheduling.
import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import * as C from '../check';
import * as P from '../parse';
import * as S from '../schedule';
const t = (name: string, fn: () => void) => it(name, fn);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const ck = (u: string, tg: string, o?: C.CheckOptions) => C.check(u, tg, o);
// ---- check
t('exact', () => assert.equal(ck('table', 'table').result, 'correct'));
t('article optional', () => assert.ok(ck('Tisch', 'der Tisch', { lang: 'de' }).accepted));
t('article required missing', () => { const r = ck('Tisch', 'der Tisch', { lang: 'de', articles: true, strict: true }); assert.equal(r.result, 'almost'); assert.equal(r.accepted, false); assert.equal(r.why, 'missing_article'); });
t('wrong article required', () => { const r = ck('die Tisch', 'der Tisch', { lang: 'de', articles: true, strict: true }); assert.equal(r.accepted, false); assert.equal(r.why, 'article'); });
t('ae for ä', () => assert.equal(ck('Maedchen', 'das Mädchen', { lang: 'de', strict: true }).result, 'correct'));
t('ss for ß', () => assert.equal(ck('Strasse', 'die Straße', { lang: 'de', strict: true }).result, 'correct'));
t('missing umlaut strict = almost', () => { const r = ck('Madchen', 'das Mädchen', { lang: 'de', strict: true }); assert.equal(r.result, 'almost'); assert.equal(r.accepted, false); });
t('typo tolerant accepted', () => { const r = ck('freindly', 'friendly', { lang: 'en' }); assert.equal(r.result, 'almost'); assert.ok(r.accepted); });
t('typo strict not accepted', () => assert.equal(ck('freindly', 'friendly', { lang: 'en', strict: true }).accepted, false));
t('far wrong', () => assert.equal(ck('chair', 'table', { lang: 'en' }).result, 'wrong'));
t('alternatives', () => assert.ok(ck('desk', 'table; desk', { lang: 'en' }).accepted));
t('alt comma', () => assert.ok(ck('town', 'city, town', { lang: 'en' }).accepted));
t('to optional', () => assert.ok(ck('run', 'to run', { lang: 'en', strict: true }).accepted));
t('sb sth optional', () => assert.ok(ck('to give', 'to give sb sth', { lang: 'en' }).accepted));
t('plural notation stripped', () => assert.ok(ck('der Tisch', 'der Tisch, -e', { lang: 'de', strict: true }).accepted));
t('plural (pl.)', () => assert.ok(ck('child', 'child (pl. children)', { lang: 'en', strict: true }).accepted));
t('parens optional', () => assert.ok(ck('freuen', '(sich) freuen', { lang: 'de' }).accepted));
t('parens included', () => assert.ok(ck('sich freuen', '(sich) freuen', { lang: 'de' }).accepted));
t('accent strict almost', () => { const r = ck('ecole', "l'école", { lang: 'fr', strict: true }); assert.equal(r.result, 'almost'); assert.equal(r.why, 'accent'); });
t('accent tolerant ok', () => assert.ok(ck('ecole', "l'école", { lang: 'fr' }).accepted));
t('fr elision article', () => assert.ok(ck("l'école", "l'école", { lang: 'fr', strict: true }).accepted));
t('case strict de', () => assert.equal(ck('tisch', 'der Tisch', { lang: 'de', strict: true }).why, 'case'));
t('case tolerant', () => assert.ok(ck('tisch', 'Tisch', { lang: 'de' }).accepted));
t('user lists two meanings', () => assert.ok(ck('Tisch, Pult', 'der Tisch', { lang: 'de' }).accepted));
t('empty', () => assert.equal(ck('', 'x').result, 'wrong'));
t('containsTerm inflected', () => assert.ok(C.containsTerm('Er läuft jeden Morgen.', 'laufen', 'de') || C.containsTerm('Wir laufen jeden Morgen', 'laufen', 'de')));
t('containsTerm noun', () => assert.ok(C.containsTerm('My table is big.', 'the table', 'en')));
t('latin forms', () => assert.ok(ck('amicus', 'amicus, -i m.', { lang: 'la', strict: true }).accepted));
// ---- parse
const txt = `Englisch - Deutsch
1. table - der Tisch, -e
2. friendly = freundlich
3. to run: laufen
4) the window – das Fenster
• tired\tmüde
the teacher    der Lehrer, -
school -> die Schule`;
t('parse text', () => {
  const r = P.parseText(txt);
  assert.equal(r.rows.length, 7, JSON.stringify(r.rows));
  assert.deepEqual(r.rows.map(x => [x.a, x.b]), [['table', 'der Tisch, -e'], ['friendly', 'freundlich'], ['to run', 'laufen'], ['the window', 'das Fenster'], ['tired', 'müde'], ['the teacher', 'der Lehrer, -'], ['school', 'die Schule']]);
  assert.equal(r.header.la, 'en'); assert.equal(r.header.lb, 'de');
});
t('plural dash fix', () => { const s = P.splitLine('der Lehrer, - - teacher'); assert.equal(s.a, 'der Lehrer, -'); assert.equal(s.b, 'teacher'); });
t('orient features', () => {
  const rows = [{ a: 'der Tisch', b: 'table' }, { a: 'freundlich', b: 'friendly' }, { a: 'müde', b: 'tired' }, { a: 'laufen', b: 'to run' }];
  assert.equal(P.orient(rows, 'en', 'de', null).swap, true);
  assert.equal(P.orient(rows.map(r => ({ a: r.b, b: r.a })), 'en', 'de', null).swap, false);
});
t('orient french', () => {
  const rows = [{ a: "l'école", b: 'die Schule' }, { a: 'la fenêtre', b: 'das Fenster' }, { a: 'être fatigué', b: 'müde sein' }];
  assert.equal(P.orient(rows, 'fr', 'de', null).swap, false);
});
t('parse words two columns', () => {
  const W = (text, x0, y0) => ({ text, conf: 92, x0, y0, x1: x0 + text.length * 10, y1: y0 + 20 });
  const words = [W('English', 50, 10), W('German', 400, 10), W('table', 50, 50), W('der', 400, 50), W('Tisch', 440, 50),
    W('to', 50, 90), W('look', 80, 90), W('forward', 130, 90), W('sich', 400, 90), W('freuen', 450, 90),
    W('tired', 50, 130), W('müde', 400, 130), W('window', 50, 170), W('das', 400, 170), W('Fenster', 440, 170)];
  const r = P.parseWords(words);
  assert.equal(r.columns, 2);
  assert.deepEqual(r.rows.map(x => [x.a, x.b]), [['table', 'der Tisch'], ['to look forward', 'sich freuen'], ['tired', 'müde'], ['window', 'das Fenster']]);
  assert.equal(r.header.la, 'en');
});
// ---- schedule
const mk = (created, testDate, n) => ({ id: 't', created, testDate, items: Array.from({ length: n }, (_, k) => ({ id: 'i' + k, term: 'x' + k, meaning: 'y' + k })) });
t('gap daily for week', () => assert.equal(S.gapDays(mk('2026-10-08', '2026-10-15', 1)), 1));
t('gap 15% month', () => assert.equal(S.gapDays(mk('2026-10-08', '2026-11-07', 1)), 5));
t('new quota spreads', () => { const tt = mk('2026-10-08', '2026-10-15', 24); const now = new Date(2026, 9, 8, 10).getTime(); assert.equal(S.newQuota(tt, now), 4); });
t('criterion flow', () => {
  const tt = mk('2026-10-08', '2026-10-15', 1); const it = tt.items[0];
  let now = new Date(2026, 9, 8, 10).getTime();
  S.introduce(it, now); S.recordCriterion(tt, it, now, false);
  assert.equal(it.st.dueAt, now + 3 * 3600e3, 'later same day');
  now += 3 * 3600e3; assert.equal(S.dueReviews(tt, now).length, 1);
  S.recordCriterion(tt, it, now, false);
  assert.equal(S.dayISO(it.st.dueAt), '2026-10-09', 'next day');
  now = new Date(2026, 9, 9, 16).getTime(); S.recordCriterion(tt, it, now, true);
  assert.equal(S.dayISO(it.st.dueAt), '2026-10-10');
  now = new Date(2026, 9, 14, 19).getTime(); assert.equal(S.phase(tt, now), 'nightBefore');
  S.recordCriterion(tt, it, now, true); assert.equal(it.st.dueAt, null);
  now = new Date(2026, 9, 15, 7).getTime(); assert.equal(S.dueReviews(tt, now).length, 1, 'morning-of: missed only');
  S.recordCriterion(tt, it, now, false); assert.equal(S.dueReviews(tt, now).length, 0);
});
t('late evening first pass -> tomorrow', () => {
  const tt = mk('2026-10-08', '2026-10-30', 1); const it = tt.items[0]; const now = new Date(2026, 9, 8, 20).getTime();
  S.introduce(it, now); S.recordCriterion(tt, it, now, false); assert.equal(S.dayISO(it.st.dueAt), '2026-10-09');
});
t('cap at night before', () => {
  const tt = mk('2026-10-01', '2026-10-31', 1); const it = tt.items[0]; it.st = { introduced: true, sessions: 5 };
  S.recordCriterion(tt, it, new Date(2026, 9, 28, 12).getTime(), false); assert.equal(S.dayISO(it.st.dueAt), '2026-10-30');
});
t('plan', () => { const p = S.plan(mk('2026-10-08', '2026-10-15', 1)); assert.equal(p[0].kind, 'first'); assert.equal(p[p.length - 1].kind, 'morning'); assert.equal(p[p.length - 2].kind, 'night'); });
t('session build', () => { const tt = mk('2026-10-08', '2026-10-15', 30); const s = S.buildSession([tt], new Date(2026, 9, 8, 10).getTime(), 15); assert.equal(s.entries.length, 5); });
t('general parse', () => {
  const txt = `Die Zelle
1. Was ist die kleinste Einheit des Lebens? Die Zelle
2. Welche Organelle produziert Energie?
Die Mitochondrien
1789 – Beginn der Französischen Revolution
1815: Wiener Kongress
Photosynthese: Umwandlung von Lichtenergie in chemische Energie
Osmose - Diffusion von Wasser durch eine semipermeable Membran
The nucleus is the control centre of the cell.
Unter Diffusion versteht man die Bewegung von Teilchen vom Ort hoher zur niedrigen Konzentration.`;
  const r = P.parseGeneral(txt);
  const got = r.rows.map(x => [x.type, x.a, x.b]);
  const exp = [['qa', 'Was ist die kleinste Einheit des Lebens?', 'Die Zelle'], ['qa', 'Welche Organelle produziert Energie?', 'Die Mitochondrien'],
    ['pair', '1789', 'Beginn der Französischen Revolution'], ['pair', '1815', 'Wiener Kongress'],
    ['pair', 'Photosynthese', 'Umwandlung von Lichtenergie in chemische Energie'], ['pair', 'Osmose', 'Diffusion von Wasser durch eine semipermeable Membran'],
    ['cloze', 'The [[nucleus]] is the control centre of the cell.', 'nucleus'], ['pair', 'Diffusion', 'die Bewegung von Teilchen vom Ort hoher zur niedrigen Konzentration']];
  assert.deepEqual(got, exp, JSON.stringify(got, null, 1));
  assert.equal(r.unused, 1);
});
