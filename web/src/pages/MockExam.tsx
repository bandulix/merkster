/* A short practice test a few days before the exam. Results stay on this account. */
import { useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { leadDays, mockOpen } from '../../../shared/mockexam';
import { useStore } from '../hooks';
import { store } from '../lib/store';
import { api } from '../lib/api';
import * as S from '../lib/schedule';
import { now, toast } from '../lib/util';
import { t, uiLang } from '../i18n';
import { TopBar } from '../components/ui';
import { MerkiSay } from '../components/MerkiSay';

type Q = { id: string; goalId: string; prompt: string; kind: 'mc' | 'short' | 'free'; choices: string[] };
type Result = { score: number; grade: string; weak: string[]; extra: { goalId: string; prompt: string; answer: string }[] };

export function MockExamPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const d = useStore();
  const test = store.test(id);
  const [paper, setPaper] = useState<{ id: string; questions: Q[] } | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [timed, setTimed] = useState(false);
  const [left, setLeft] = useState(15 * 60);
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  if (!test) return <Navigate to="/" replace />;
  const days = S.daysLeft(test, now());
  const lead = leadDays(d.settings.mockLead);
  if (!paper && !mockOpen(days, lead)) return <Navigate to={'/test/' + test.id} replace />;

  const start = async () => {
    setBusy(true);
    try {
      const res = await api<{ id: string; questions: Q[] }>('/api/mock-exam', { body: {
        testId: test.id, planId: test.study?.sharedPlanId || null, lang: uiLang() === 'en' ? 'en' : 'de',
        daysLeft: days, lead, goals: test.study?.goals || [],
        cards: test.items.slice(0, 40).map(c => ({ id: c.id, term: c.term, meaning: c.meaning, goalId: c.study?.goalId }))
      } });
      setPaper(res);
      if (timed) {
        const tick = window.setInterval(() => setLeft(s => {
          if (s <= 1) { window.clearInterval(tick); return 0; }
          return s - 1;
        }), 1000);
      }
    } catch { toast(t('err_network'), 'bad'); }
    finally { setBusy(false); }
  };
  const handIn = async () => {
    if (!paper) return;
    setBusy(true);
    try {
      const res = await api<Result>('/api/mock-exam/' + paper.id + '/grade', { body: { daysLeft: days, answers: paper.questions.map(q => ({ id: q.id, text: answers[q.id] || '' })) } });
      if (res.extra.length) {
        store.addItems(test, res.extra.filter(e => e.prompt && e.answer).map(e => ({ type: 'qa' as const, a: e.prompt, b: e.answer, goalId: e.goalId, method: 'retrieval' as const, activity: 'recall' as const })));
      }
      setResult(res);
    } catch { toast(t('err_network'), 'bad'); }
    finally { setBusy(false); }
  };

  return (
    <section className="page narrow" data-testid="mock-exam">
      <TopBar title={t('mock_title')} back={'/test/' + test.id} />
      <p className="muted small">{t('mock_note')}</p>
      {!paper && !result && (
        <div className="card">
          <h2>{test.name}</h2>
          <div className="chips">
            <button type="button" className={'pill' + (!timed ? ' on' : '')} data-testid="mock-untimed" onClick={() => setTimed(false)}>{t('mock_untimed')}</button>
            <button type="button" className={'pill' + (timed ? ' on' : '')} data-testid="mock-timed" onClick={() => setTimed(true)}>{t('mock_timed')}</button>
          </div>
          <button className="btn primary big wide" data-testid="mock-start" disabled={busy} onClick={start}>{t('mock_start')}</button>
        </div>
      )}
      {paper && !result && <>
        {timed && <p className="chip" data-testid="mock-clock">{Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}</p>}
        {paper.questions.map((q, i) => (
          <div key={q.id} className="card" data-testid="mock-q">
            <b>{i + 1}. {q.prompt}</b>
            {q.kind === 'mc' ? <div className="opts">{q.choices.map(c => (
              <button key={c} type="button" className={'opt' + (answers[q.id] === c ? ' picked' : '')} data-testid="mock-choice" onClick={() => setAnswers(a => ({ ...a, [q.id]: c }))}>{c}</button>
            ))}</div> : <textarea data-testid="mock-text" value={answers[q.id] || ''} maxLength={500} onChange={e => setAnswers(a => ({ ...a, [q.id]: e.target.value }))} />}
          </div>
        ))}
        <button className="btn primary big wide" data-testid="mock-send" disabled={busy} onClick={handIn}>{t('mock_send')}</button>
      </>}
      {result && (
        <div data-testid="mock-result">
          <MerkiSay trigger="mock_done" placement="inline" />
          <div className="tiles">
            <div className="tile-stat"><span>{t('mock_score')}</span><b data-testid="mock-score">{result.score}%</b></div>
            <div className="tile-stat"><span>{t('mock_grade')}</span><b data-testid="mock-grade">{result.grade}</b></div>
          </div>
          <div className="card">
            <h3>{t('mock_weak')}</h3>
            {result.weak.length ? <ul>{result.extra.map(e => <li key={e.goalId}>{e.prompt}</li>)}</ul> : <p>{t('mock_none')}</p>}
            {result.extra.length > 0 && <p className="small muted">{t('mock_extra')}</p>}
          </div>
          <button className="btn primary big wide" onClick={() => nav('/test/' + test.id)}>{t('continue')}</button>
        </div>
      )}
    </section>
  );
}
