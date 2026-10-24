/* Results dashboard (charts, tiles, history) – used by the student's own Results page and, read-only, by supporters. */
import { useState, type ReactNode } from 'react';
import { Bar, CartesianGrid, ComposedChart, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { ExamResult, GradeSystem, Subject } from '../../../shared/types';
import { fmtPctIn, fmtResult, fromPct, GRADE_SPECS, toPct } from '../../../shared/grades';
import { fmtDay } from '../lib/util';
import { subjectIcon, subjectName, t, tp } from '../i18n';

export interface ResItem { id: string; name: string; subject: Subject; testDate: string; result: ExamResult; icon: string; practice?: { sessions: number; days: number; minutes: number } | null }
const COLORS = ['#3d5afe', '#ff5a36', '#00c2a8', '#a6e00f', '#ffd23f', '#0d0f1e', '#7a8cff', '#ff9a7f'];

export function ResultsDashboard({ items, sys, rowExtra, rowActions }: { items: ResItem[]; sys: GradeSystem; rowExtra?: (x: ResItem) => ReactNode; rowActions?: (x: ResItem) => ReactNode }) {
  const [filter, setFilter] = useState<Subject | 'all'>('all');
  const done = [...items].sort((a, b) => a.testDate.localeCompare(b.testDate));
  const subjects = [...new Set(done.map(x => x.subject))];
  const shown = filter === 'all' ? done : done.filter(x => x.subject === filter);
  const pcts = shown.map(x => toPct(x.result));
  const avg = pcts.length ? pcts.reduce((a, b) => a + b, 0) / pcts.length : null;
  const best = shown.length ? shown.reduce((a, b) => (toPct(b.result) > toPct(a.result) ? b : a)) : null;
  const trend = (() => { if (pcts.length < 2) return null; const k = Math.min(3, Math.floor(pcts.length / 2)); const a = pcts.slice(-k), b = pcts.slice(-2 * k, -k); const diff = a.reduce((x, y) => x + y, 0) / k - b.reduce((x, y) => x + y, 0) / k; return diff > 3 ? 'up' : diff < -3 ? 'down' : 'flat'; })();
  const yv = (pct: number) => +fromPct(pct, sys).toFixed(2);
  const spec = GRADE_SPECS[sys], cont = !spec.options;
  const domain: [number, number] = sys === 'de_grade' ? [1, 6] : [spec.min, spec.max];
  /** an axis value (in the system's own scale) → its label: "2", "B", "11", "70" */
  const axisLabel = (v: number) => cont || sys === 'points15' || sys === 'de_grade' ? String(Math.round(v)) : fmtPctIn(toPct({ system: sys, value: v }), sys);
  const tipLabel = (v: number) => fmtPctIn(cont ? v : toPct({ system: sys, value: v }), sys);
  const timeline = shown.map(x => ({ date: x.testDate, label: fmtDay(x.testDate), [x.subject]: yv(toPct(x.result)), name: x.name, res: fmtResult(x.result) }));
  const withPractice = shown.some(x => x.practice);
  const pvr = shown.map(x => ({ name: x.name.length > 14 ? x.name.slice(0, 13) + '…' : x.name, minutes: x.practice?.minutes ?? 0, sessions: x.practice?.sessions ?? 0, result: yv(toPct(x.result)) }));
  const perSubject = subjects.map(s => { const ps = done.filter(x => x.subject === s).map(x => toPct(x.result)); return { s, n: ps.length, avg: ps.reduce((a, b) => a + b, 0) / ps.length, best: Math.max(...ps) }; });
  const chartsReady = shown.length >= 2;
  return (<>
    {subjects.length > 1 && <div className="chips">{(['all', ...subjects] as const).map(s => <button key={s} className={'pill sm' + (filter === s ? ' on' : '')} onClick={() => setFilter(s as Subject | 'all')}>{s === 'all' ? t('all_subjects') : subjectIcon(s as Subject) + ' ' + subjectName(s as Subject)}</button>)}</div>}
    <div className="tiles" data-testid="result-tiles">
      <div className="tile-stat"><span>{t('average')}</span><b data-testid="avg">{avg != null ? fmtPctIn(avg, sys) : '–'}</b></div>
      <div className="tile-stat"><span>{t('best_result')}</span><b>{best ? fmtResult(best.result) : '–'}</b><small>{best?.name}</small></div>
      <div className="tile-stat"><span>{t('trend')}</span><b className={'trend ' + (trend || '')}>{trend === 'up' ? '↗' : trend === 'down' ? '↘' : trend === 'flat' ? '→' : '–'}</b><small>{trend ? t(('trend_' + trend) as 'trend_up') : t('trend_need')}</small></div>
      <div className="tile-stat"><span>{t('results_n')}</span><b>{shown.length}</b></div>
    </div>
    {!chartsReady && <p className="muted small" data-testid="charts-locked">{tp('charts_need_more', Math.max(1, 2 - shown.length))}</p>}
    {chartsReady && <div className="card chart-card" data-testid="chart-over-time"><h3>{t('over_time')}</h3>
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={timeline} margin={{ top: 10, right: 12, left: -18, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" className="grid" />
          <XAxis dataKey="label" tick={{ fontSize: 12 }} />
          <YAxis domain={domain} reversed={spec.lowerIsBetter} tickFormatter={axisLabel} tick={{ fontSize: 12 }} allowDecimals={sys === 'ch_grade' || sys === 'us_letter'} />
          <Tooltip formatter={(v: number) => tipLabel(v)} />
          {subjects.length > 1 && <Legend formatter={v => subjectName(v as Subject)} />}
          {subjects.map((s, i) => <Line key={s} type="monotone" dataKey={s} name={s} stroke={COLORS[i % COLORS.length]} strokeWidth={3} dot={{ r: 5 }} connectNulls isAnimationActive />)}
        </LineChart>
      </ResponsiveContainer>
    </div>}
    {chartsReady && withPractice && <div className="card chart-card" data-testid="chart-practice"><h3>{t('practice_vs_result')}</h3><p className="muted small">{t('practice_vs_result_sub')}</p>
      <ResponsiveContainer width="100%" height={240}>
        <ComposedChart data={pvr} margin={{ top: 10, right: 0, left: -18, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" className="grid" />
          <XAxis dataKey="name" tick={{ fontSize: 11 }} />
          <YAxis yAxisId="m" tick={{ fontSize: 12 }} />
          <YAxis yAxisId="r" orientation="right" domain={domain} reversed={spec.lowerIsBetter} tickFormatter={axisLabel} tick={{ fontSize: 12 }} allowDecimals={sys === 'ch_grade' || sys === 'us_letter'} />
          <Tooltip />
          <Legend formatter={v => (v === 'minutes' ? t('active_min') : v === 'sessions' ? t('sessions') : t('result'))} />
          <Bar yAxisId="m" dataKey="minutes" fill="#00c2a8" radius={[8, 8, 0, 0]} />
          <Bar yAxisId="m" dataKey="sessions" fill="#7a8cff" radius={[8, 8, 0, 0]} />
          <Line yAxisId="r" type="monotone" dataKey="result" stroke="#ff5a36" strokeWidth={3} dot={{ r: 6 }} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>}
    {perSubject.length > 0 && <div className="subj-grid">{perSubject.map(x => <div key={x.s} className="card subj-card"><span className="tc-icon">{subjectIcon(x.s)}</span><b>{subjectName(x.s)}</b><span>⌀ {fmtPctIn(x.avg, sys)}</span><small>{t('best_result')}: {fmtPctIn(x.best, sys)} · {tp('results_count', x.n)}</small></div>)}</div>}
    <h3 className="sec-title">{t('history')}</h3>
    <div className="res-list" data-testid="result-history">{[...shown].reverse().map(x => (
      <div key={x.id} className="res-item" data-testid="res-item">
        <div className="res-row">
          <span className="tc-icon">{x.icon}</span>
          <span className="res-main"><b>{x.name}</b><small>{fmtDay(x.testDate)}{x.practice ? ' · ' + t('pb_line', { s: x.practice.sessions, d: x.practice.days, m: x.practice.minutes }) : ''}</small>{x.result.note && <small className="muted">“{x.result.note}”</small>}</span>
          <b className="res-grade" data-testid="res-grade">{fmtResult(x.result)}</b>
          {rowActions?.(x)}
        </div>
        {rowExtra?.(x)}
      </div>))}</div>
  </>);
}
