/* A connected classmate's grades, framed as a profile — not a ranking of weak marks. */
import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, Navigate, useParams } from 'react-router-dom';
import { collectGrades, erfolgsquote, formatScore } from '../../../shared/gradebook';
import { adherencePct } from '../../../shared/gradebook';
import * as S from '../lib/schedule';
import { store } from '../lib/store';
import { useStore } from '../hooks';
import { compareWith, pullGrades } from '../lib/planSync';
import { ApiError } from '../lib/api';
import { TopBar } from '../components/ui';
import { fmtResult } from '../../../shared/grades';
import { t } from '../i18n';

export function ComparePage() {
  useStore();
  const { id } = useParams();
  useEffect(() => { void pullGrades().then(r => { for (const g of r.grades || []) if (!g.deleted) store.upsertGrade(g); }).catch(() => undefined); }, []);
  const q = useQuery({ queryKey: ['compare', id], queryFn: () => compareWith(id!), enabled: !!id, retry: 0 });
  if (!id) return <Navigate to="/results" replace />;
  const mine = collectGrades(store.data.tests, store.data.grades || [], test => adherencePct(S.plan(test).filter(p => p.kind !== 'morning').map(p => p.day), test.days));
  const myQ = erfolgsquote(mine, store.data.settings.gradeTargets);
  const myAvg = mine.length ? mine.reduce((s, g) => s + g.score, 0) / mine.length : null;
  const sys = store.data.settings.grading === 'points15' || store.data.settings.grading === 'percent' ? store.data.settings.grading : 'de_grade';
  const other = q.data;
  const denied = q.error instanceof ApiError && q.error.status === 404;
  return (
    <section className="page narrow" data-testid="compare-view">
      <TopBar title={t('compare_title', { name: other?.name || '…' })} back="/results" />
      {q.isLoading && <p className="muted">{t('loading')}</p>}
      {denied && <div className="empty-hero"><p>{t('not_connected')}</p></div>}
      {other && other.privacy === 'hide' && <div className="card"><h2>{other.name}</h2><p>{t('compare_hidden', { name: other.name })}</p></div>}
      {other && other.privacy !== 'hide' && other.summary && (
        <>
          <div className="card compare-head">
            <span className="avatar-letter lg">{other.name.slice(0, 1).toUpperCase()}</span>
            <div><h2>{other.name}</h2><p className="muted small">{other.summary.rate >= 0.5 ? t('compare_kudos', { name: other.name }) : t('compare_both')}</p></div>
          </div>
          <div className="compare-board">
            <div className="compare-col you" data-testid="compare-you">
              <span>{t('compare_you')}</span>
              {mine.length && myAvg != null ? <>
                <b>{formatScore(myAvg, sys)}</b>
                <small>{Math.round(myQ.rate * 100)}% · {myQ.hit}/{myQ.total}</small>
              </> : <>
                <p>{t('compare_you_empty')}</p>
                <Link className="btn primary sm" to="/results">{t('grade_add')}</Link>
              </>}
            </div>
            <div className="compare-col them" data-testid="compare-theirs">
              <span>{other.name}</span>
              {other.summary.n ? <>
                <b>{formatScore(other.summary.avg, sys)}</b>
                <small data-testid="compare-rate">{Math.round(other.summary.rate * 100)}%{other.summary.trend === 'up' ? ' ↗' : other.summary.trend === 'down' ? ' ↘' : ''}</small>
              </> : <p>{t('compare_empty')}</p>}
            </div>
          </div>
          {other.privacy === 'grades' && other.grades && (
            <ul className="feed" data-testid="compare-grades">{other.grades.map((g, i) => (
              <li key={i} className={g.metTarget ? 'met' : ''}>
                <b>{g.title}</b>
                <span>{fmtResult({ system: g.system as 'de_grade', value: g.value })}</span>
                {g.metTarget && <small>{t('compare_met')}</small>}
              </li>
            ))}</ul>
          )}
          {other.summary.n === 0 && <p className="muted">{t('compare_empty')}</p>}
        </>
      )}
    </section>
  );
}
