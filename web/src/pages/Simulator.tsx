/* "What could I earn?" – report-card reward simulator. Pure what-if: runs the SAME engine (rules, caps,
   improvement vs. the last card, average thresholds) on a hypothetical card. Never stores anything. */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { GradeSystem } from '../../../shared/types';
import { moneyIn, simulateReportCard, type PersonLite, type SimRule } from '../../../shared/rewards';
import { avgOf, byIssued, examAverages, fmtAvg, lineScore, termOf, type ReportCard } from '../../../shared/reportcards';
import { isRcKind } from '../../../shared/rewards';
import { useStore } from '../hooks';
import { store } from '../lib/store';
import { useMyRewards, rewardText } from '../lib/rewards';
import { LOCALE, mySubjects, rcNearest, rcOptions, subjIcon, subjName, termStarts, useReportCards } from '../lib/reportcards';
import { dayISO } from '../lib/schedule';
import { now } from '../lib/util';
const isoToday = () => dayISO(now());
import { GrandTotal, SupporterBreakdownList } from '../components/Totals';
import { TopBar } from '../components/ui';
import { CANON_SUBJECTS } from '../../../shared/reportcards';
import { t, uiLang } from '../i18n';

type Grades = Record<string, number>;
function prefill(sys: GradeSystem, cards: ReportCard[], tests: ReturnType<typeof useStore>['tests']): { g: Grades; from: 'tests' | 'card' | 'none' } {
  const term = termOf(isoToday(), termStarts());
  const ex = examAverages(tests, term);
  const last = [...cards].sort(byIssued).pop();
  const g: Grades = {};
  if (ex.size) { for (const [k, v] of ex) g[k] = rcNearest(sys, v.avg).value; if (last) for (const l of last.lines) if (!(l.subjectId in g)) g[l.subjectId] = rcNearest(sys, l.score).value; return { g, from: 'tests' }; }
  if (last) { for (const l of last.lines) g[l.subjectId] = rcNearest(sys, l.score).value; return { g, from: 'card' }; }
  for (const id of mySubjects(tests, cards).slice(0, 8)) g[id] = rcOptions(sys)[1].value;
  if (!Object.keys(g).length) for (const id of ['german', 'math', 'english']) g[id] = rcOptions(sys)[1].value;
  return { g, from: 'none' };
}

export default function Simulator() {
  const d = useStore(), sys = d.settings.grading, L = uiLang();
  const cardsQ = useReportCards(!!store.userId), rw = useMyRewards(!!store.userId);
  const cards = cardsQ.data || [];
  const opts = rcOptions(sys);
  const initial = useMemo(() => prefill(sys, cards, d.tests), [sys, cardsQ.data]); // eslint-disable-line react-hooks/exhaustive-deps
  const [edits, setEdits] = useState<Grades | null>(null);
  const [extra, setExtra] = useState<string[]>([]);
  const grades: Grades = { ...initial.g, ...Object.fromEntries(extra.map(id => [id, (edits || initial.g)[id] ?? opts[1].value])), ...(edits || {}) };
  const ids = Object.keys(grades);
  const setG = (id: string, v: number) => setEdits({ ...grades, [id]: v });
  const rules: SimRule<PersonLite>[] = (rw.data?.rules || []).filter(r => r.active && isRcKind(r.trigger.kind)).map(r => ({ id: r.id, trigger: r.trigger, reward: r.reward, capPerMonth: r.capPerMonth, supporterId: r.supporter.id, supporter: r.supporter }));
  const earned = (rw.data?.earned || []).map(e => ({ ruleId: e.ruleId, key: e.sourceKey, at: e.earnedAt }));
  const prev = cards.map(c => ({ id: c.id, issuedOn: c.issuedOn, createdAt: c.createdAt, lines: c.lines, avgScore: c.avgScore }));
  const sim = (g: Grades) => { const lines = Object.entries(g).map(([subjectId, v]) => ({ subjectId, score: lineScore(sys, v) })); return simulateReportCard(rules, { issuedOn: isoToday(), lines, avgScore: avgOf(lines) }, prev, earned); };
  const b = sim(grades);
  const avg = avgOf(ids.map(id => ({ score: lineScore(sys, grades[id]) })));
  const cur = b.grand[0]?.currency || (rules.find(r => r.reward.type === 'money')?.reward as { currency?: 'EUR' } | undefined)?.currency || 'EUR';
  // "Improve Mathe from 3 to 2 → +10 €": one step better per subject, biggest gains first
  const hints = ids.map(id => {
    const i = opts.findIndex(o => o.value === grades[id]); if (i <= 0) return null;
    const better = opts[i - 1], gain = moneyIn(sim({ ...grades, [id]: better.value }), cur) - moneyIn(b, cur);
    return gain > 0 ? { id, from: opts[i].label, to: better.label, gain } : null;
  }).filter(Boolean).sort((a, c) => c!.gain - a!.gain).slice(0, 3) as { id: string; from: string; to: string; gain: number }[];
  const spread = (target: number) => {   // move every grade by the same score delta so the average lands near the target
    const delta = target - avg, g: Grades = {};
    for (const id of ids) g[id] = rcNearest(sys, Math.max(0, Math.min(100, lineScore(sys, grades[id]) + delta))).value;
    setEdits(g);
  };
  const addable = CANON_SUBJECTS.filter(c => !ids.includes(c.id));
  return (
    <section className="page narrow simulator" data-testid="simulator">
      <TopBar title={'🧮 ' + t('sim_title')} back="/reports" />
      <div className="sim-banner" data-testid="sim-label">🧪 {t('sim_label')}</div>
      <p className="muted small">{t('sim_sub')} {initial.from === 'tests' ? '· ' + t('sim_prefill_tests') : initial.from === 'card' ? '· ' + t('sim_prefill_card') : ''}</p>
      <div className="card sim-total-card">
        <GrandTotal b={b} label={t('sim_total')} testid="sim-total" />
        {!rules.length && <p className="muted small" data-testid="sim-none">{t('sim_none')}</p>}
        {hints.length > 0 && <ul className="sim-hints" data-testid="sim-hints">{hints.map(h => <li key={h.id} data-testid="sim-hint">💡 {t('sim_hint', { subject: subjName(h.id), from: h.from, to: h.to, amount: rewardText({ type: 'money', currency: cur, amount: h.gain }) })}</li>)}</ul>}
      </div>
      <SupporterBreakdownList b={b} sys={sys} testid="sim-breakdown" />
      <div className="card sim-controls">
        <div className="sim-row">
          <label className="field grow"><span>{t('sim_avg')}: <b data-testid="sim-avg">Ø {fmtAvg(sys, avg, LOCALE())}</b></span>
            <input type="range" min={0} max={100} step={1} value={Math.round(avg)} data-testid="sim-avg-slider" onChange={e => spread(Number(e.target.value))} /></label>
        </div>
        <div className="sim-row"><span className="muted small">{t('sim_set_all')}</span>
          <div className="seg wrap">{opts.slice(0, sys === 'percent' || sys === 'xofy' ? 0 : 8).map(o => <button key={o.label} className="pill sm" data-testid={'sim-all-' + o.label} onClick={() => setEdits(Object.fromEntries(ids.map(id => [id, o.value])))}>{o.label}</button>)}
            {(sys === 'percent' || sys === 'xofy') && [100, 90, 80, 70, 60].map(p => <button key={p} className="pill sm" data-testid={'sim-all-' + p} onClick={() => setEdits(Object.fromEntries(ids.map(id => [id, p])))}>{p} %</button>)}</div>
          <button className="btn link sm" data-testid="sim-reset" onClick={() => { setEdits(null); setExtra([]); }}>↺ {t('sim_reset')}</button>
        </div>
        <div className="sim-subjects">{ids.map(id => {
          const i = opts.findIndex(o => o.value === grades[id]), o = opts[i] || rcNearest(sys, lineScore(sys, grades[id]));
          return (
            <div key={id} className="sim-subj" data-testid="sim-subj" data-subject={id}>
              <span className="sim-ic">{subjIcon(id)}</span><span className="grow">{subjName(id, cards.flatMap(c => c.lines).find(l => l.subjectId === id)?.name)}</span>
              <button className="icon-btn sm" aria-label="−" data-testid="sim-worse" disabled={i >= opts.length - 1} onClick={() => setG(id, opts[Math.min(opts.length - 1, i + 1)].value)}>−</button>
              <b className="sim-grade" data-testid="sim-grade">{o.label}</b>
              <button className="icon-btn sm" aria-label="+" data-testid="sim-better" disabled={i <= 0} onClick={() => setG(id, opts[Math.max(0, i - 1)].value)}>+</button>
            </div>);
        })}</div>
        {addable.length > 0 && <select className="sim-add" value="" data-testid="sim-add" onChange={e => { if (e.target.value) { setExtra([...extra, e.target.value]); setEdits({ ...grades, [e.target.value]: opts[1].value }); } }}>
          <option value="">{t('rc_add_line')}</option>{addable.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name[L]}</option>)}</select>}
      </div>
      <p className="muted xsmall center">🤝 {t('rewards_disclaimer')}</p>
      <p className="center"><Link className="btn ghost" to="/reports/new">📜 {t('rc_add')}</Link></p>
    </section>
  );
}
