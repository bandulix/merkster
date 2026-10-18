/* Multi-supporter totals: GRAND TOTAL (per currency – EUR is never added to CHF) + a breakdown per supporter
   (avatar, name, subtotal, the rules that triggered it, non-money rewards). Used by the simulator, the reward pop,
   report cards, the rewards overview and the supporter views. */
import { useEffect, useRef, useState } from 'react';
import type { GradeSystem } from '../../../shared/types';
import { breakdown, type Breakdown, type EarnedView, type MoneyTotal, type PersonLite } from '../../../shared/rewards';
import { moneyList, rewardPeople, rewardText, ruleWhen } from '../lib/rewards';
import { whoName } from '../lib/supporters';
import { MiniAvatar } from './Cheers';
import { t } from '../i18n';

export const fmtMoney = (m: MoneyTotal[]) => (m.length ? moneyList(m) : '');
/** earned entries (student view: each has its supporter) → breakdown */
export const earnedBreakdown = (list: (EarnedView & { supporter: PersonLite })[]) =>
  breakdown(list.map(e => { const supporter = rewardPeople(e); return { supporterId: supporter.id, supporter, ruleId: e.ruleId || e.id, trigger: e.trigger, reward: e.reward }; }));

/** a number that counts up to its target (for the money counter) */
export function useCountUp(target: number, ms = 650) {
  const [v, setV] = useState(target), from = useRef(target);
  useEffect(() => {
    const start = performance.now(), a = from.current, reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || a === target) { setV(target); from.current = target; return; }
    let raf = 0;
    const step = (now: number) => { const k = Math.min(1, (now - start) / ms), e = 1 - Math.pow(1 - k, 3); setV(a + (target - a) * e); if (k < 1) raf = requestAnimationFrame(step); else from.current = target; };
    raf = requestAnimationFrame(step);
    return () => { cancelAnimationFrame(raf); from.current = target; };
  }, [target, ms]);
  return v;
}
function Counter({ m }: { m: MoneyTotal }) {
  const v = useCountUp(m.amount);
  return <span className="money-n" data-testid="grand-money" data-currency={m.currency} data-amount={m.amount}>{rewardText({ type: 'money', currency: m.currency, amount: Math.round(v * 100) / 100 })}</span>;
}
export function GrandTotal({ b, label, testid = 'grand-total', big = true }: { b: Breakdown; label?: string; testid?: string; big?: boolean }) {
  const other = b.perSupporter.flatMap(s => s.other);
  const [open, setOpen] = useState(false);
  const primary = b.grand[0], rest = b.grand.slice(1);
  return (
    <div className={'grand-total' + (big ? ' big' : '')} data-testid={testid}>
      <span className="gt-label">{label || t('grand_total')}</span>
      <div className="gt-money">{primary ? <Counter m={primary} /> : !other.length ? <span className="money-n zero" data-testid="grand-money" data-amount="0">–</span> : null}</div>
      {rest.length > 0 && (
        <button type="button" className="btn link sm gt-more" data-testid="more-currencies" onClick={() => setOpen(v => !v)}>
          {open ? rest.map((m, i) => <span key={m.currency}>{i > 0 ? ' + ' : ''}<Counter m={m} /></span>) : t('more_currencies', { n: b.grand.length })}
        </button>
      )}
      {other.length > 0 && <div className="gt-other" data-testid="grand-other">{b.grand.length ? '+ ' : ''}{other.map((x, i) => <span key={i} className="chip warm">🎁 {x}</span>)}</div>}
    </div>);
}
/** one row per supporter: avatar, name, subtotal, the rules that fired ("3× 5 € for every 1 or better = 15 €") */
export function SupporterBreakdownList({ b, sys, testid = 'sup-breakdown' }: { b: Breakdown<PersonLite>; sys: GradeSystem; testid?: string }) {
  if (!b.perSupporter.length) return null;
  return (
    <div className="sup-breakdown" data-testid={testid}>
      {b.perSupporter.map(s => (
        <div key={s.supporter.id} className="sb-row" data-testid="sb-row" data-name={whoName(s.supporter)}>
          <div className="sb-head">
            <MiniAvatar src={s.supporter.avatar} name={s.supporter.name} size={36} />
            <b className="grow">{whoName(s.supporter)}</b>
            <span className="sb-sub" data-testid="sb-subtotal">{fmtMoney(s.money)}{s.other.length ? (s.money.length ? ' + ' : '') + s.other.join(', ') : ''}</span>
          </div>
          <ul className="sb-items">{s.items.map((it, i) => (
            <li key={i} data-testid="sb-item"><span className="sb-n">{t('rw_n_items', { n: it.count })}</span> <b>{rewardText(it.reward)}</b> <span className="muted">{ruleWhen(it.trigger, sys)}</span>{it.money && it.count > 1 ? <b className="sb-eq"> = {rewardText({ type: 'money', ...it.money })}</b> : null}</li>))}
          </ul>
        </div>))}
    </div>);
}
export function TotalsBlock({ b, sys, label, testid }: { b: Breakdown<PersonLite>; sys: GradeSystem; label?: string; testid?: string }) {
  return <div className="totals-block" data-testid={testid}><GrandTotal b={b} label={label} /><SupporterBreakdownList b={b} sys={sys} /></div>;
}
