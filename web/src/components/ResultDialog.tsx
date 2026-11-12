/* "Wie lief die Prüfung?" — fast bottom sheet. Linked to a plan when one exists,
   or a free grade from the stats screen. Notes and mood stay on this device's sync
   payload but are never shown to classmates. */
import { useState } from 'react';
import { createPortal } from 'react-dom';
import type { ExamKind, GradeEntry, GradeScale, Mood } from '../../../shared/gradebook';
import { EXAM_KINDS, MOODS, adherencePct, scoreFor, toExamResult } from '../../../shared/gradebook';
import { DE_GRADES, fmtDeGrade, parseDeGrade } from '../../../shared/grades';
import type { Subject, Test } from '../../../shared/types';
import { SUBJECT_KEYS } from '../../../shared/types';
import { store } from '../lib/store';
import { pushGrades } from '../lib/planSync';
import * as S from '../lib/schedule';
import { confetti, now, toast, uid } from '../lib/util';
import { subjectIcon, subjectName, t, type Key } from '../i18n';

export function ResultDialog({ test, onClose, onSaved }: { test: Test; onClose: () => void; onSaved?: (best: boolean) => void }) {
  return <GradeSheet test={test} onClose={onClose} onSaved={onSaved} />;
}

export function GradeSheet({ test, existing, onClose, onSaved }: { test?: Test | null; existing?: GradeEntry | null; onClose: () => void; onSaved?: (best: boolean) => void }) {
  const linked = existing?.testId ? store.test(existing.testId) : test;
  const prior = existing || (linked ? (store.data.grades || []).find(g => g.testId === linked.id && !g.deleted) : null);
  const [subject, setSubject] = useState<Subject>(prior?.subject || linked?.subject || 'biology');
  const [title, setTitle] = useState(prior?.title || linked?.name || subjectName(subject));
  const [kind, setKind] = useState<ExamKind>(prior?.kind || 'klassenarbeit');
  const [date, setDate] = useState(prior?.date || linked?.testDate || S.dayISO(now()));
  const [system, setSystem] = useState<GradeScale>(prior?.system || (store.data.settings.grading === 'points15' || store.data.settings.grading === 'percent' ? store.data.settings.grading : 'de_grade'));
  const [grade, setGrade] = useState(prior?.system === 'de_grade' ? fmtDeGrade(prior.value) : '2');
  const [points, setPoints] = useState(prior?.system === 'points15' ? prior.value : 10);
  const [percent, setPercent] = useState(prior?.system === 'percent' ? prior.value : 80);
  const [mood, setMood] = useState<Mood | null>(prior?.mood || null);
  const [note, setNote] = useState(prior?.note || '');
  const value = system === 'de_grade' ? parseDeGrade(grade) : system === 'points15' ? points : percent;
  const ok = value != null && Number.isFinite(value);
  const save = () => {
    if (!ok || value == null) return;
    const withPlan = !!(linked && (linked.items.length > 0 || linked.study?.goals?.length));
    const planned = linked ? S.plan(linked).filter(p => p.kind !== 'morning').map(p => p.day) : [];
    const entry: GradeEntry = {
      id: prior?.id && !prior.id.startsWith('legacy-') ? prior.id : uid(),
      testId: linked?.id || null,
      subject, title: title.trim() || subjectName(subject), kind, date, system, value,
      score: scoreFor(system, value), mood, note: note.trim(),
      adherence: withPlan ? adherencePct(planned, linked?.days) : null,
      withPlan, updatedAt: now()
    };
    const prevBest = Math.max(-1, ...(store.data.grades || []).filter(g => !g.deleted && g.id !== entry.id).map(g => g.score), ...store.data.tests.filter(t => t.result && t.id !== linked?.id).map(t => t.result!.score ?? 0));
    const best = prevBest >= 0 && entry.score > prevBest;
    store.upsertGrade(entry);
    if (linked) store.updateTest(linked.id, { result: toExamResult(entry), resultSkipped: false });
    void pushGrades([entry]).catch(() => undefined);
    if (best) confetti();
    toast(best ? '🏆 ' + t('personal_best') : t('result_saved'), 'ok');
    onSaved?.(best);
    onClose();
  };
  const remove = () => {
    if (prior && !prior.id.startsWith('legacy-')) { store.removeGrade(prior.id); void pushGrades([{ ...prior, deleted: true, updatedAt: now() }]).catch(() => undefined); }
    if (linked) store.updateTest(linked.id, { result: null });
    onClose();
  };
  return createPortal(
    <div className="dock-back" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="dock" role="dialog" aria-modal="true" aria-label={t('grade_prompt')} data-testid="grade-sheet">
        <div className="dock-grab" aria-hidden />
        <h2>{t('grade_prompt')}</h2>
        <p className="muted">{t('grade_add')}</p>
        <label className="field"><span>{t('grade_subject')}</span>
          <select data-testid="grade-subject" value={subject} onChange={e => { const s = e.target.value as Subject; setSubject(s); if (!linked) setTitle(subjectName(s)); }}>
            {SUBJECT_KEYS.map(s => <option key={s} value={s}>{subjectIcon(s)} {subjectName(s)}</option>)}
          </select>
        </label>
        <label className="field"><span>{t('wiz_name')}</span><input data-testid="grade-title" value={title} maxLength={80} onChange={e => setTitle(e.target.value)} /></label>
        <p className="small">{t('grade_kind')}</p>
        <div className="chips">{EXAM_KINDS.map(k => <button key={k} type="button" data-testid={'kind-' + k} className={'pill sm' + (kind === k ? ' on' : '')} onClick={() => setKind(k)}>{t(('kind_' + k) as Key)}</button>)}</div>
        <label className="field"><span>{t('grade_when')}</span><input type="date" data-testid="grade-date" value={date} onChange={e => e.target.value && setDate(e.target.value)} /></label>
        <p className="small">{t('grade_scale')}</p>
        <div className="chips">
          <button type="button" data-testid="gs-de_grade" className={'pill sm' + (system === 'de_grade' ? ' on' : '')} onClick={() => setSystem('de_grade')}>{t('scale_de')}</button>
          <button type="button" data-testid="gs-points15" className={'pill sm' + (system === 'points15' ? ' on' : '')} onClick={() => setSystem('points15')}>{t('scale_points')}</button>
          <button type="button" data-testid="gs-percent" className={'pill sm' + (system === 'percent' ? ' on' : '')} onClick={() => setSystem('percent')}>{t('scale_percent')}</button>
        </div>
        {system === 'de_grade' && <div className="grade-grid">{DE_GRADES.map(g => <button key={g} type="button" data-testid={'grade-' + g} className={'grade' + (grade === g ? ' on' : '') + ' g' + g[0]} onClick={() => setGrade(g)}>{g}</button>)}</div>}
        {system === 'points15' && <div className="stepper" data-testid="grade-stepper">
          <button type="button" className="btn" onClick={() => setPoints(n => Math.max(0, n - 1))}>−</button>
          <b className="big-num">{points} P</b>
          <button type="button" className="btn" onClick={() => setPoints(n => Math.min(15, n + 1))}>+</button>
        </div>}
        {system === 'percent' && <label className="field"><span>%</span><input type="number" data-testid="result-value" min={0} max={100} value={percent} onChange={e => setPercent(Number(e.target.value))} /></label>}
        <p className="small">{t('grade_mood')}</p>
        <div className="moods" data-testid="grade-mood">{MOODS.map(m => <button key={m} type="button" className={'mood' + (mood === m ? ' on' : '')} data-testid={'mood-' + m} onClick={() => setMood(mood === m ? null : m)}>{t(('mood_' + m) as Key)}</button>)}</div>
        <label className="field"><span>{t('grade_note')}</span><input value={note} maxLength={300} onChange={e => setNote(e.target.value)} /></label>
        <div className="row-btns">
          {linked && !prior && <button className="btn link" onClick={() => { store.updateTest(linked.id, { resultSkipped: true }); onClose(); }}>{t('skip_result')}</button>}
          {(prior || linked?.result) && <button className="btn link bad" onClick={remove}>{t('delete')}</button>}
          <button className="btn primary big" disabled={!ok} data-testid="save-result" onClick={save}>{t('save')}</button>
        </div>
      </div>
    </div>,
    document.body
  );
}
