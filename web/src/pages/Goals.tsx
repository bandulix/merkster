/* Photo a Lernziele sheet → review goals → optional questions → day-by-day programme. */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { METHOD_OF, readyOn, type ClarifyQuestion, type LearningGoal, type StudyTask } from '../../../shared/goals';
import type { KnowledgeKind, StudyMethod, Subject } from '../../../shared/types';
import { KNOWLEDGE_KINDS } from '../../../shared/goals';
import { useStore } from '../hooks';
import { api, ApiError } from '../lib/api';
import { joinPlan, matchPlan, publishPlan } from '../lib/planSync';
import { store } from '../lib/store';
import * as S from '../lib/schedule';
import { now, uid } from '../lib/util';
import { TopBar } from '../components/ui';
import { SUBJECTS, t, tp, uiLang, type Key } from '../i18n';

const KINDS = KNOWLEDGE_KINDS;
type Step = 'capture' | 'reading' | 'goals' | 'join' | 'ask' | 'material' | 'planning';
interface Match { planId: string; title: string; ownerName: string; memberCount: number; examDate: string | null; already: boolean }

export function GoalsPage() {
  const nav = useNavigate();
  useStore();
  const today = S.dayISO(now());
  const [step, setStep] = useState<Step>('capture');
  const [exam, setExam] = useState(S.addDays(today, 14));
  const [testId, setTestId] = useState<string | null>(null);
  const [subject, setSubject] = useState<Subject>('other');
  const [title, setTitle] = useState('');
  const [level, setLevel] = useState('');
  const [goals, setGoals] = useState<LearningGoal[]>([]);
  const [questions, setQuestions] = useState<ClarifyQuestion[]>([]);
  const [qi, setQi] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [custom, setCustom] = useState('');
  const [paste, setPaste] = useState('');
  const [showPaste, setShowPaste] = useState(false);
  const [match, setMatch] = useState<Match | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ensureTest = () => {
    if (testId && store.test(testId)) return store.test(testId)!;
    const test = store.createTest({ name: title || t('goals_title'), subject: subject === 'other' ? 'biology' : subject, foreign: null, native: uiLang() === 'de' ? 'de' : 'en', testDate: exam, format: 'mixed', articles: false });
    setTestId(test.id);
    return test;
  };

  const applyExtract = (res: { subject: Subject; title: string; level: string; goals: LearningGoal[]; questions: ClarifyQuestion[] }) => {
    const next = res.goals.map(g => ({ ...g, method: g.method || METHOD_OF[g.kind] }));
    setSubject(res.subject);
    setTitle(res.title);
    setLevel(res.level);
    setGoals(next);
    setQuestions(res.questions || []);
    setStep('goals');
  };

  const read = async (files: File[], text: string) => {
    setError(null);
    const test = ensureTest();
    if (exam !== test.testDate) store.updateTest(test.id, { testDate: exam });
    setStep('reading');
    try {
      const fd = new FormData();
      fd.append('meta', JSON.stringify({ testId: test.id, uiLang: uiLang(), subject, days: Math.max(0, S.daysBetween(today, exam)) }));
      if (text.trim()) fd.append('text', text.trim());
      files.forEach((f, i) => fd.append('image', f, f.name || `page-${i}.jpg`));
      const res = await api<{ subject: Subject; title: string; level: string; goals: LearningGoal[]; questions: ClarifyQuestion[] }>('/api/ai/goals', { form: fd });
      applyExtract(res);
    } catch (e) {
      const code = e instanceof ApiError ? e.code : '';
      setError(code === 'not_school_material' ? t('not_school_material') : code === 'ai_not_configured' ? t('ai_tip_admin') : t('ai_failed'));
      setStep('capture');
    }
  };

  const setGoal = (i: number, patch: Partial<LearningGoal>) => setGoals(list => list.map((g, k) => {
    if (k !== i) return g;
    const next = { ...g, ...patch };
    if (patch.kind && !patch.method) next.method = METHOD_OF[patch.kind];
    return next;
  }));

  const afterGoals = async () => {
    const clean = goals.map(g => ({ ...g, text: g.text.trim(), topic: g.topic.trim() || g.text.trim().slice(0, 80) })).filter(g => g.text.length >= 8);
    if (!clean.length) { setError(t('plan_empty')); return; }
    setGoals(clean);
    setError(null);
    try {
      const res = await matchPlan({ kind: 'goals', subject, texts: clean.map(g => g.text), examDate: exam });
      if (res.match && !res.match.already) { setMatch(res.match); setStep('join'); return; }
    } catch { /* offline: build a private plan */ }
    setQuestions(q => q);
    setQi(0);
    setStep(questions.length ? 'ask' : 'material');
  };

  const answer = (value: string) => {
    const q = questions[qi];
    const next = { ...answers, [q.kind]: value };
    setAnswers(next);
    setCustom('');
    if (qi + 1 < questions.length) setQi(qi + 1);
    else setStep('material');
  };

  const saveProgramme = async (list: LearningGoal[], ans: Record<string, string>, tasks: StudyTask[], material: 'photo' | 'research') => {
    const days = Math.max(1, S.daysBetween(today, exam));
    const minutes = Number(ans.minutes) || (days <= 3 ? 25 : days <= 14 ? 20 : 15);
    const lang = uiLang() === 'de' ? 'de' : 'en';
    const test = ensureTest();
    store.updateTest(test.id, {
      name: title || t('goals_title'), subject, testDate: exam, native: lang,
      study: { title: title || t('goals_title'), goals: list, minutesPerDay: minutes, examFormat: ans.exam || 'written', level: ans.level || level, joined: false, material }
    });
    if (tasks.length) {
      store.addItems(store.test(test.id)!, tasks.map(task => ({
        type: task.type, a: task.front, b: task.back, distractors: task.distractors,
        goalId: task.goalId, method: list.find(g => g.id === task.goalId)?.method || 'retrieval',
        activity: task.activity, phase: task.phase, readyOn: readyOn(task.phase, today, exam),
        source: task.source
      })));
    }
    try {
      const published = await publishPlan({ kind: 'goals', subject, title: title || t('goals_title'), texts: list.map(g => g.text), examDate: exam, testId: test.id, content: { goals: list, tasks } });
      store.updateTest(test.id, { study: { ...store.test(test.id)!.study!, sharedPlanId: published.planId } });
    } catch { /* the plan still lives on this device */ }
    return test.id;
  };

  const choosePhoto = () => {
    const list = goals.map(g => ({ ...g, text: g.text.trim(), topic: g.topic.trim() || g.text.trim().slice(0, 80) })).filter(g => g.text.length >= 8);
    setStep('planning');
    void saveProgramme(list, answers, [], 'photo').then(id => nav('/test/' + id + '/import', { replace: true }));
  };

  const chooseResearch = async () => {
    const list = goals.map(g => ({ ...g, text: g.text.trim(), topic: g.topic.trim() || g.text.trim().slice(0, 80) })).filter(g => g.text.length >= 8);
    setError(null);
    setStep('planning');
    const lang = uiLang() === 'de' ? 'de' : 'en';
    try {
      const res = await api<{ cards: { goalId: string; front: string; back: string; source: StudyTask['source'] }[]; noSource: boolean }>('/api/ai/material/research', { body: { goals: list, lang, subject } });
      if (res.noSource || !res.cards?.length) { setError(t('material_no_source')); setStep('material'); return; }
      const tasks: StudyTask[] = res.cards.map(c => ({ goalId: c.goalId, activity: 'recall', type: 'qa', phase: 'learn', front: c.front, back: c.back, distractors: [], source: c.source }));
      const id = await saveProgramme(list, answers, tasks, 'research');
      nav('/test/' + id + '?fresh=1', { replace: true });
    } catch (e) {
      const code = e instanceof ApiError ? e.code : '';
      setError(code === 'ai_rate_limited' ? t('ai_rate_limited') : code === 'ai_not_configured' ? t('ai_tip_admin') : t('material_no_source'));
      setStep('material');
    }
  };

  const acceptJoin = async () => {
    if (!match) return;
    const test = ensureTest();
    setStep('planning');
    try {
      const res = await joinPlan(match.planId, test.id, exam);
      const content = res.content || {};
      const list = (content.goals || goals).map(g => ({ ...g, method: g.method || METHOD_OF[g.kind] }));
      const tasks = content.tasks || [];
      store.updateTest(test.id, {
        name: res.title || title || t('goals_title'), subject, testDate: exam,
        study: { title: res.title || title, goals: list, minutesPerDay: 20, examFormat: 'written', level, sharedPlanId: res.planId, joined: true }
      });
      store.addItems(store.test(test.id)!, tasks.map(task => ({
        type: task.type, a: task.front, b: task.back, distractors: task.distractors || [],
        goalId: task.goalId, method: list.find(g => g.id === task.goalId)?.method || 'retrieval',
        activity: task.activity, phase: task.phase, readyOn: readyOn(task.phase, today, exam),
        source: task.source
      })));
      nav('/test/' + test.id + '?fresh=1', { replace: true });
    } catch {
      setError(t('err_network'));
      setStep('join');
    }
  };

  const q = questions[qi];
  return (
    <section className="wizard page narrow" data-testid="goals-page">
      <TopBar title={t('goals_title')} back={() => (step === 'capture' ? nav(-1) : setStep('capture'))} />
      {error && <p className="ai-banner" role="status">{error}</p>}
      {step === 'capture' && (
        <div data-testid="goals-capture">
          <p className="lead">{t('goals_lead')}</p>
          <h2 className="q">{t('goals_date')}</h2>
          <div className="chips">{([[7, 'q_week'], [14, 'q_2weeks']] as const).map(([n, k]) => <button key={n} data-testid={'qdate-' + n} className={'pill' + (exam === S.addDays(today, n) ? ' on' : '')} onClick={() => setExam(S.addDays(today, n))}>{t(k)}</button>)}</div>
          <label className="field"><span>{t('wiz_date')}</span><input type="date" data-testid="goals-date" min={today} value={exam} onChange={e => e.target.value && setExam(e.target.value)} /></label>
          <p className="upload-notice" data-testid="upload-notice">{t('upload_notice')}</p>
          <div className="import-actions">
            <label className="btn primary big wide">📸 {t('take_photo')}<input type="file" accept="image/*" capture="environment" hidden onChange={e => { const f = [...(e.target.files || [])]; if (f.length) void read(f, ''); }} /></label>
            <label className="btn ghost big wide">{t('upload')}<input data-testid="file-input" type="file" accept="image/*,application/pdf,.pdf" hidden onChange={e => { const f = [...(e.target.files || [])]; if (f.length) void read(f, ''); }} /></label>
            <button className="btn link" data-testid="goals-paste" onClick={() => setShowPaste(v => !v)}>⌨️ {t('type_paste')}</button>
          </div>
          {showPaste && <>
            <textarea className="paste" data-testid="goals-text" rows={8} value={paste} onChange={e => setPaste(e.target.value)} placeholder={t('goals_found_sub')} />
            <button className="btn primary big wide" data-testid="goals-read-text" disabled={paste.trim().length < 8} onClick={() => void read([], paste)}>{t('goals_build')}</button>
          </>}
        </div>
      )}
      {step === 'reading' && <div className="empty-hero" data-testid="goals-reading"><div className="spinner" /><p>{t('goals_reading')}</p></div>}
      {step === 'planning' && <div className="empty-hero" data-testid="goals-planning"><div className="spinner" /><p>{t('goals_reading')}</p></div>}
      {step === 'goals' && (
        <div data-testid="goals-review">
          <h2 className="q">{t('goals_found')}</h2>
          <p className="muted">{title} · {SUBJECTS[subject]?.name[uiLang()] || subject}</p>
          <p className="muted small">{t('goals_found_sub')}</p>
          <ul className="goal-list">{goals.map((g, i) => (
            <li key={g.id} className="card goal-card" data-testid="goal-row">
              <input className="goal-topic" aria-label={t('goals_topic')} value={g.topic} onChange={e => setGoal(i, { topic: e.target.value })} />
              <textarea value={g.text} onChange={e => setGoal(i, { text: e.target.value })} />
              <div className="chips">{KINDS.map(k => <button key={k} type="button" className={'pill sm' + (g.kind === k ? ' on' : '')} onClick={() => setGoal(i, { kind: k as KnowledgeKind })}>{t(('kind_' + k) as Key)}</button>)}</div>
              <p className="method-line"><b data-testid="method-name">{t(('method_' + g.method) as Key)}</b> · {t(('method_why_' + g.method) as Key)}</p>
              <label className="field"><span>{t('plan_methods')}</span>
                <select value={g.method} onChange={e => setGoal(i, { method: e.target.value as StudyMethod })}>{(['retrieval', 'worked', 'elaboration', 'essay', 'timeline', 'mixed'] as StudyMethod[]).map(m => <option key={m} value={m}>{t(('method_' + m) as Key)}</option>)}</select>
              </label>
              <button className="btn link bad sm" onClick={() => setGoals(list => list.filter((_, k) => k !== i))}>{t('delete')}</button>
            </li>
          ))}</ul>
          <button className="btn ghost" onClick={() => setGoals(list => [...list, { id: uid(), text: '', topic: '', kind: 'facts', method: 'retrieval' }])}>+ {t('goals_add')}</button>
          <div className="wiz-foot"><button className="btn primary big wide" data-testid="goals-confirm" disabled={!goals.some(g => g.text.trim().length >= 8)} onClick={() => void afterGoals()}>{t('goals_build')}</button></div>
        </div>
      )}
      {step === 'join' && match && (
        <div className="dock-inline card" data-testid="join-sheet">
          <h2>{t('join_title', { name: match.ownerName })}</h2>
          <p>{tp('join_sub', match.memberCount)}</p>
          <p className="muted">{t('join_date', { date: exam })}</p>
          {match.examDate && match.examDate !== exam && <p className="muted small">{match.examDate}</p>}
          <div className="row-btns col">
            <button className="btn primary big" data-testid="join-accept" onClick={() => void acceptJoin()}>{t('join_accept')}</button>
            <button className="btn ghost" data-testid="join-own" onClick={() => { setMatch(null); if (questions.length) setStep('ask'); else setStep('material'); }}>{t('join_own')}</button>
          </div>
        </div>
      )}
      {step === 'material' && (
        <div data-testid="material-choice">
          <h2 className="q">{t('material_choice_title')}</h2>
          <p className="muted">{t('material_choice_sub')}</p>
          <div className="choice-list">
            <button type="button" className="choice-card" data-testid="material-photo" onClick={choosePhoto}>
              <b>{t('material_photo_title')}</b>
              <span>{t('material_photo_sub')}</span>
            </button>
            <button type="button" className="choice-card" data-testid="material-research" onClick={() => void chooseResearch()}>
              <b>{t('material_research_title')}</b>
              <span>{t('material_research_sub')}</span>
            </button>
          </div>
        </div>
      )}
      {step === 'ask' && q && (
        <div data-testid="clarify">
          <h2 className="q">{t('clarify_title')}</h2>
          <p data-testid="clarify-prompt">{q.prompt || t(('clarify_' + q.kind) as Key)}</p>
          {q.kind === 'minutes' && <div className="chips">{[10, 15, 20, 30, 45].map(n => <button key={n} className="pill" data-testid={'min-' + n} onClick={() => answer(String(n))}>{n}</button>)}</div>}
          {q.kind === 'exam' && <div className="chips">{(['written', 'oral', 'mixed', 'mc'] as const).map(k => <button key={k} className="pill" data-testid={'exam-' + k} onClick={() => answer(k)}>{t(('exam_' + k) as Key)}</button>)}</div>}
          {q.kind === 'level' && <div className="chips">{(['level_8', 'level_10', 'level_oberstufe'] as const).map(k => <button key={k} className="pill" data-testid={k} onClick={() => answer(t(k))}>{t(k)}</button>)}</div>}
          {(q.kind === 'material' || q.kind === 'scope') && <>
            <textarea className="paste" data-testid="clarify-text" rows={4} value={custom} onChange={e => setCustom(e.target.value)} />
            <button className="btn primary" data-testid="clarify-ok" disabled={custom.trim().length < 2} onClick={() => answer(custom.trim())}>{t('next')}</button>
          </>}
          <button className="btn link" data-testid="clarify-skip" onClick={() => answer('')}>{t('clarify_skip')}</button>
        </div>
      )}
    </section>
  );
}
