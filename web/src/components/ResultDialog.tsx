import { useState } from 'react';
import type { ExamResult, GradeSystem, Test } from '../../../shared/types';
import { GRADE_SYSTEMS } from '../../../shared/types';
import { DE_GRADES, fmtDeGrade, GRADE_SPECS, optionFor, parseDeGrade, toPct, validResult } from '../../../shared/grades';
import { store } from '../lib/store';
import { useAfterResult } from '../lib/rewards';
import { confetti, now, toast } from '../lib/util';
import { t, testIcon } from '../i18n';
import { Modal } from './ui';

/** the grading system a test uses: its own override, else the profile default */
export const testGrading = (test: Pick<Test, 'grading'>): GradeSystem => test.grading || store.data.settings.grading;

/** "How did it go?" – enter or edit the result of a test (self-reported) */
export function ResultDialog({ test, onClose, onSaved }: { test: Test; onClose: () => void; onSaved?: (best: boolean) => void }) {
  const r = test.result;
  const afterResult = useAfterResult();
  const [system, setSystem] = useState<GradeSystem>(r?.system || testGrading(test));
  const [grade, setGrade] = useState(r?.system === 'de_grade' ? fmtDeGrade(r.value) : '');
  const [pick, setPick] = useState<number | null>(r && r.system !== 'de_grade' && GRADE_SPECS[r.system].options ? r.value : null);
  const [num, setNum] = useState(r && !GRADE_SPECS[r.system].options ? String(r.value) : r?.system === 'points15' ? String(r.value) : '');
  const [max, setMax] = useState(r?.max ? String(r.max) : '');
  const [note, setNote] = useState(r?.note || '');
  const spec = GRADE_SPECS[system];
  const value = system === 'de_grade' ? parseDeGrade(grade) : system === 'points15' ? Number(num || 0) : spec.options ? pick : parseFloat(num.replace(',', '.'));
  const res: ExamResult = { system, value: value ?? NaN, enteredAt: r?.enteredAt || now(), ...(system === 'xofy' ? { max: parseFloat(max.replace(',', '.')) } : {}), ...(note.trim() ? { note: note.trim() } : {}) };
  const ok = validResult(res);
  const switchTo = (s: GradeSystem) => { setSystem(s); setPick(null); if (s === 'points15' && !num) setNum('10'); };
  const save = () => {
    if (!ok) return;
    const prevBest = Math.max(-1, ...store.data.tests.filter(x => x.id !== test.id && x.result).map(x => toPct(x.result!)));
    const best = prevBest >= 0 && toPct(res) > prevBest;
    const changed = !r || r.system !== res.system || r.value !== res.value || r.max !== res.max;
    store.updateTest(test.id, { result: { ...res, enteredAt: r && !changed ? res.enteredAt : now() }, resultSkipped: false });
    if (system !== testGrading(test) && !r) {
      if (test.grading) store.updateTest(test.id, { grading: system }); else store.setSettings({ grading: system });
    }
    if (best) confetti();
    toast(best ? '🏆 ' + t('personal_best') : t('result_saved'), 'ok');
    void afterResult();     // push now so supporter rewards are evaluated right away
    onSaved?.(best); onClose();
  };
  return (
    <Modal onClose={onClose} label={t('how_did_it_go')}>
      <h2>{testIcon(test)} {t('how_did_it_go')}</h2>
      <p className="muted">{test.name}</p>
      <div className="seg wrap">{GRADE_SYSTEMS.map(s => <button key={s} className={'pill sm' + (system === s ? ' on' : '')} data-testid={'gs-' + s} onClick={() => switchTo(s)}>{t(('gs_' + s) as 'gs_de_grade')}</button>)}</div>
      {system === 'de_grade' && <div className="grade-grid">{DE_GRADES.map(g => <button key={g} data-testid={'grade-' + g} className={'grade' + (grade === g ? ' on' : '') + ' g' + g[0]} onClick={() => setGrade(g)}>{g}</button>)}</div>}
      {spec.options && system !== 'de_grade' && system !== 'points15' && <div className={'grade-grid opts n' + spec.options.length}>{spec.options.map((o, i) => (
        <button key={o.label} data-testid={'grade-' + o.label} className={'grade' + (pick != null && optionFor(system, pick)?.label === o.label ? ' on' : '') + ' gq' + Math.min(6, 1 + Math.floor(i * 6 / spec.options!.length))} onClick={() => setPick(o.value)}>{o.label}</button>))}</div>}
      {system === 'points15' && <div className="points"><input type="range" data-testid="result-points" min={0} max={15} step={1} value={num || 0} onChange={e => setNum(e.target.value)} /><b className="big-num">{num || 0} P</b></div>}
      {(system === 'percent' || system === 'xofy') && <div className="row-in">
        <input type="number" inputMode="decimal" data-testid="result-value" min={0} placeholder={system === 'percent' ? '%' : t('points')} value={num} onChange={e => setNum(e.target.value)} />
        {system === 'xofy' && <><span>/</span><input type="number" inputMode="decimal" data-testid="result-max" min={1} placeholder={t('max_points')} value={max} onChange={e => setMax(e.target.value)} /></>}
      </div>}
      <label className="field"><span>{t('note_optional')}</span><input value={note} maxLength={300} onChange={e => setNote(e.target.value)} placeholder={t('note_ph')} /></label>
      <p className="muted small">💡 {t('result_xp_hint')} · <span className="chip xs">✍️ {t('self_reported')}</span></p>
      <div className="row-btns">
        {!r && <button className="btn link" onClick={() => { store.updateTest(test.id, { resultSkipped: true }); onClose(); }}>{t('skip_result')}</button>}
        {r && <button className="btn link bad" onClick={() => { store.updateTest(test.id, { result: null }); void afterResult(); onClose(); }}>{t('delete')}</button>}
        <button className="btn primary big" disabled={!ok} data-testid="save-result" onClick={save}>{t('save')}</button>
      </div>
    </Modal>
  );
}
