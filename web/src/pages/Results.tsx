/* Exam grades: average, success rate, trend, plan vs no plan, history. */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { GradeSystem, Test } from '../../../shared/types';
import { adherenceBands, adherencePct, averageScore, bySubject, collectGrades, erfolgsquote, formatScore, planEffect, targetFor, trendOf, DEFAULT_TARGET_SCORE } from '../../../shared/gradebook';
import { practiceBefore } from '../../../shared/gamification';
import { fmtResult, GRADE_SPECS } from '../../../shared/grades';
import { useStore } from '../hooks';
import { store } from '../lib/store';
import { fmtDay, now } from '../lib/util';
import * as S from '../lib/schedule';
import { ResultDialog, GradeSheet } from '../components/ResultDialog';
import { connectedPeople, pullGrades } from '../lib/planSync';
import { useQuery } from '@tanstack/react-query';
import { ResultsDashboard, type ResItem } from '../components/ResultsDashboard';
import { subjectIcon, subjectName, t, type Key } from '../i18n';

export default function Results() {
  const d = useStore(), ts = now();
  const sys: GradeSystem = d.settings.grading === 'points15' || d.settings.grading === 'percent' || d.settings.grading === 'de_grade' ? d.settings.grading : 'de_grade';
  const [edit, setEdit] = useState<Test | null>(null);
  const [free, setFree] = useState(false);
  useEffect(() => { void pullGrades().then(r => { for (const g of r.grades || []) if (!g.deleted) store.upsertGrade(g); }).catch(() => undefined); }, []);
  const people = useQuery({ queryKey: ['people'], queryFn: connectedPeople, retry: 0, staleTime: 15000 });
  const grades = collectGrades(d.tests, d.grades || [], test => adherencePct(S.plan(test).filter(p => p.kind !== 'morning').map(p => p.day), test.days));
  const targets = d.settings.gradeTargets;
  const quote = erfolgsquote(grades, targets);
  const avg = averageScore(grades);
  const trend = trendOf(grades);
  const effect = planEffect(grades);
  const bands = adherenceBands(grades);
  const subjects = bySubject(grades, targets);
  const pending = d.tests.filter(x => (S.phase(x, ts) === 'past' || x.testDate === S.dayISO(ts)) && !x.result && x.items.length && !(d.grades || []).some(g => g.testId === x.id && !g.deleted));
  const items: ResItem[] = d.tests.filter(x => x.result).map(x => ({ id: x.id, name: x.name, subject: x.subject, testDate: x.testDate, result: x.result!, icon: subjectIcon(x.subject), practice: practiceBefore(x, d.history) }));
  const targetScore = targets && Object.values(targets)[0] != null ? Object.values(targets)[0]! : DEFAULT_TARGET_SCORE;
  const spec = GRADE_SPECS[sys];
  const points = grades.map(g => ({ label: fmtDay(g.date), score: g.score, name: g.title }));
  return (
    <section className="results page">
      <header className="home-top"><div><p className="muted small">{t('stats_kicker')}</p><h1 className="page-title">{t('stats_title')}</h1></div>
        <button className="btn primary sm" data-testid="add-grade" onClick={() => setFree(true)}>{t('grade_add')}</button>
      </header>
      {pending.map(x => (
        <button key={x.id} className="ask-card pop-in" data-testid="ask-result" onClick={() => setEdit(x)}>
          <span className="tc-icon">{subjectIcon(x.subject)}</span><span><b>{t('grade_prompt')}</b><small>{x.name} · {fmtDay(x.testDate)}</small></span><span className="btn primary sm">{t('grade_add')}</span>
        </button>))}
      {!grades.length ? (
        <div className="empty-hero" data-testid="erfolg-empty"><div className="empty-emoji">📈</div><h2>{t('erfolg_title')}</h2><p className="muted">{t('erfolg_empty')}</p></div>
      ) : <>
        <div className="tiles" data-testid="erfolg-tiles">
          <div className="tile-stat"><span>{t('erfolg_title')}</span><b data-testid="erfolgsquote">{Math.round(quote.rate * 100)}%</b><small>{quote.hit}/{quote.total}</small></div>
          <div className="tile-stat"><span>{t('stats_avg')}</span><b>{avg == null ? '–' : formatScore(avg, sys)}</b></div>
          <div className="tile-stat"><span>{t('trend')}</span><b>{trend === 'up' ? '↗' : trend === 'down' ? '↘' : trend === 'flat' ? '→' : '–'}</b></div>
          <div className="tile-stat"><span>{t('stats_best')}</span><b>{formatScore(Math.max(...grades.map(g => g.score)), sys)}</b></div>
        </div>
        <p className="muted small">{t('erfolg_sub')}</p>
        {grades.length >= 2 && <div className="card chart-card" data-testid="grade-trend">
          <h3>{t('over_time')}</h3>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={points} margin={{ top: 10, right: 8, left: -18, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
              <Tooltip />
              <ReferenceLine y={targetScore} stroke="#c6f432" strokeDasharray="4 4" />
              <Line type="monotone" dataKey="score" stroke="#3d5afe" strokeWidth={3} dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>}
        <div className="card">
          <h3>{t('stats_plan')}</h3>
          <p className="muted small">{t('stats_plan_sub')}</p>
          {effect.withPlan && effect.without ? (
            <div className="tiles" data-testid="plan-vs">
              <div className="tile-stat"><span>{t('stats_plan')}</span><b>{formatScore(effect.withPlan.avg, sys)}</b><small>n={effect.withPlan.n}</small></div>
              <div className="tile-stat"><span>{t('stats_noplan')}</span><b>{formatScore(effect.without.avg, sys)}</b><small>n={effect.without.n}</small></div>
            </div>
          ) : <p className="muted small">{t('stats_plan_need')}</p>}
          {bands.length > 0 && <div data-testid="adherence">{bands.map(b => <p key={b.id}><b>{t(('adhere_' + b.id) as Key)}</b> · {formatScore(b.avg, sys)} <span className="muted">({b.n})</span></p>)}</div>}
        </div>
        {subjects.length > 0 && <div className="subj-grid">{subjects.map(s => (
          <div key={s.subject} className="card subj-card"><span className="tc-icon">{subjectIcon(s.subject)}</span><b>{subjectName(s.subject)}</b><span>⌀ {formatScore(s.avg, sys)}</span><small>{Math.round(s.rate * 100)}% · {t('erfolg_target')}: {formatScore(targetFor(s.subject, targets), 'de_grade')}</small></div>
        ))}</div>}
      </>}
      {items.length > 0 && <ResultsDashboard items={items} sys={sys} charts={grades.length < 2} />}
      {(people.data?.people.length || 0) > 0 && <div className="card"><h3>{t('compare_open')}</h3>
        {(people.data?.people || []).map(p => <Link key={p.id} className="member" data-testid="person-link" to={'/compare/' + p.id}><span className="avatar-letter">{p.name.slice(0, 1)}</span><b>{p.name}</b></Link>)}
      </div>}
      {edit && <ResultDialog test={edit} onClose={() => setEdit(null)} />}
      {free && <GradeSheet onClose={() => setFree(false)} />}
      <p className="muted small">{spec.lowerIsBetter ? t('erfolg_sub') : ''}</p>
    </section>
  );
}
