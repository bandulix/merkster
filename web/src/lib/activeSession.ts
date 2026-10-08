/* The running practice session lives outside React state so re-renders/route changes don't lose it */
import type { Card, Test } from '../../../shared/types';
import { Practice, type Summary } from './practice';
import * as S from './schedule';
import { store } from './store';
import { now, toast } from './util';
import { t } from '../i18n';

let active: Practice | null = null;
let last: Summary | null = null;
export const getActive = () => active;
export const getLast = () => last;
/** mark user activity (answer typed, button pressed) for the active-minutes counter */
export const touchActive = () => active?.touch(now());

export function startPractice(entries: S.SessionEntry[]): boolean {
  if (!entries.length) { toast(t('nothing_due')); return false; }
  active = new Practice(id => store.test(id), entries, now(), (test: Test, item: Card, struggled: boolean) => {
    S.recordCriterion(test, item, now(), struggled);
    store.commit(); // persist + sync after every met card (progress survives a closed tab)
  });
  store.commit();
  return true;
}
function record(p: Practice): Summary {
  const ts = now(), sum = p.summary(ts), d = store.data, before = store.progress(ts);
  store.commit(() => {
    d.stats.sessions++; d.stats.answers += p.answers; d.stats.firstTry += sum.firstTry; d.stats.ms += sum.activeMs;
    store.addHistory({ day: S.dayISO(ts), at: ts, n: sum.done, firstTry: sum.firstTry, correct: sum.correct, ms: sum.ms, activeMs: sum.activeMs, tests: sum.tests });
    for (const id of sum.tests) { const x = store.test(id); if (x) { const day = S.dayISO(ts); if (!x.days.includes(day)) x.days.push(day); } }
  });
  const after = store.progress(ts);
  return { ...sum, xpBefore: before.xp, xpAfter: after.xp, levelBefore: before.level, levelAfter: after.level };
}
export function finishPractice(): Summary | null {
  if (!active) return null;
  last = record(active); active = null;
  return last;
}
/** leaving early still counts the work done (cards already met keep their schedule; XP for what you recalled) */
export function quitPractice() {
  if (active && active.done > 0) record(active);
  active = null;
}
/** an optional extra retrieval round (early review of the soonest-due cards) */
export function extraEntries(tests: Test[], size: number): S.SessionEntry[] {
  const entries: S.SessionEntry[] = [];
  for (const x of tests) x.items.filter(i => i.st?.introduced).sort((a, b) => (a.st.dueAt || 0) - (b.st.dueAt || 0)).slice(0, 8).forEach(i => entries.push({ testId: x.id, itemId: i.id, isNew: false, morning: false }));
  if (!entries.length) { const x = tests.find(a => a.items.length); if (x) x.items.slice(0, 8).forEach(i => entries.push({ testId: x.id, itemId: i.id, isNew: !i.st.introduced, morning: false })); }
  return entries.slice(0, size);
}
