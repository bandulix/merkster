/* Exam results dashboard: results over time per subject, averages, best, trend, practice vs. result, history + cheers. */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { Test } from '../../../shared/types';
import { practiceBefore } from '../../../shared/gamification';
import { useStore } from '../hooks';
import { store } from '../lib/store';
import { fmtDay, now } from '../lib/util';
import * as S from '../lib/schedule';
import { cheersFor, useCheers } from '../lib/supporters';
import { ResultDialog } from '../components/ResultDialog';
import { ShareSheet, type ShareWhat } from '../components/Share';
import { CheerChips } from '../components/Cheers';
import { ResultsDashboard, type ResItem } from '../components/ResultsDashboard';
import { t, testIcon } from '../i18n';
import KidDetail from './KidDetail';
import Rewards from './Rewards';
import GivenRewards from './GivenRewards';
import ReportCards, { ReportDetail } from './ReportCards';
import ReportNew from './ReportNew';
import Simulator from './Simulator';
export { KidDetail, Rewards, GivenRewards, ReportCards, ReportDetail, ReportNew, Simulator };

export default function Results() {
  const d = useStore(), ts = now(), sys = d.settings.grading;
  const cheers = useCheers();
  const [edit, setEdit] = useState<Test | null>(null), [share, setShare] = useState<ShareWhat | null>(null);
  const pending = d.tests.filter(x => S.phase(x, ts) === 'past' || x.testDate === S.dayISO(ts)).filter(x => !x.result && x.items.length);
  const items: ResItem[] = d.tests.filter(x => x.result).map(x => ({ id: x.id, name: x.name, subject: x.subject, testDate: x.testDate, result: x.result!, icon: testIcon(x), practice: practiceBefore(x, d.history) }));
  return (
    <section className="results page">
      <header className="home-top"><div><p className="muted small">{t('results_kicker')}</p><h1 className="page-title">{t('tab_results')}</h1></div><span className="chip">{t(('gs_' + sys) as 'gs_de_grade')}</span></header>
      <Link className="card sim-link" to="/reports" data-testid="results-reports"><span className="nudge-ic">📜</span><span className="grow"><b>{t('results_reports')}</b><small className="muted">{t('sim_title')}</small></span><span>→</span></Link>
      {pending.map(x => (
        <button key={x.id} className="ask-card pop-in" data-testid="ask-result" onClick={() => setEdit(x)}>
          <span className="tc-icon">{testIcon(x)}</span><span><b>{t('how_did_it_go')}</b><small>{x.name} · {fmtDay(x.testDate)}</small></span><span className="btn primary sm">{t('enter_result')}</span>
        </button>))}
      {!items.length ? (
        <div className="empty-hero"><div className="empty-emoji">📊</div><h2>{t('results_empty')}</h2><p className="muted">{t('results_empty_sub')}</p></div>
      ) : <>
        <ResultsDashboard items={items} sys={sys}
          rowExtra={x => <CheerChips groups={cheersFor(cheers.data, 'result', x.id)} compact />}
          rowActions={x => <>
            <button className="icon-btn sm" aria-label={t('share')} onClick={() => setShare({ kind: 'result', test: store.test(x.id)! })}>📤</button>
            <button className="icon-btn sm" aria-label={t('edit')} onClick={() => setEdit(store.test(x.id)!)}>✏️</button></>} />
        <p className="muted small center">💚 {t('results_kind')}</p>
      </>}
      {edit && <ResultDialog test={edit} onClose={() => setEdit(null)} onSaved={best => { const x = store.test(edit.id); if (x?.result) setShare(best ? { kind: 'result', test: x, best } : null); }} />}
      {share && <ShareSheet what={share} onClose={() => setShare(null)} />}
    </section>
  );
}
