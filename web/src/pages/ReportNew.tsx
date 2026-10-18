/* Add a report card: photo → AI proposes lines (or a quick manual form) → REVIEW: each line is matched to a subject
   (synonyms + fuzzy, with confidence), editable, ignorable → the student confirms. Nothing is stored before that. */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import type { GradeSystem } from '../../../shared/types';
import { GRADE_SYSTEMS } from '../../../shared/types';
import { GRADE_SPECS } from '../../../shared/grades';
import { CANON_SUBJECTS, customId, matchSubject, parseGradeText, schoolYearOf, TERM_KINDS, type ReportCard, type TermKind } from '../../../shared/reportcards';
import { useConfig, useStore } from '../hooks';
import { api, ApiError } from '../lib/api';
import { customSubjects, rcOptions, termStarts, useReportCards } from '../lib/reportcards';
import { dayISO } from '../lib/schedule';
import { now, toast } from '../lib/util';
import { shrink } from '../components/Rewards';
import { TopBar } from '../components/ui';
import { localizeNote, t, uiLang, type Key } from '../i18n';

interface Line { key: number; raw: string; subjectId: string; name: string; value: number | null; confidence: number; ignore: boolean; unreadable: boolean }
interface Extract { schoolYear: string; term: TermKind; termLabel: string; issuedOn: string; system: string; lines: { subject: string; grade: string; unreadable: boolean }[]; unreadable: string[] }
let K = 1;
const NEW = '__new__';

export default function ReportNew() {
  const d = useStore(), cfg = useConfig(), nav = useNavigate(), qc = useQueryClient(), L = uiLang();
  const cards = useReportCards().data || [];
  const custom = useMemo(() => customSubjects(cards), [cards]);
  const today = dayISO(now());
  const [step, setStep] = useState<'pick' | 'reading' | 'review'>('pick');
  const [meta, setMeta] = useState({ schoolYear: schoolYearOf(today, termStarts()), term: ([1, 2, 3].includes(new Date().getMonth() + 1) ? 'h1' : 'final') as TermKind, termLabel: '', issuedOn: today, system: d.settings.grading as GradeSystem });
  const [lines, setLines] = useState<Line[]>([]), [notes, setNotes] = useState<string[]>([]);
  const [photo, setPhoto] = useState<string | null>(null), [keepPhoto, setKeepPhoto] = useState(true), [busy, setBusy] = useState(false), [err, setErr] = useState('');
  const aiOn = !!cfg.data?.ai.configured;

  const fromExtract = (x: Extract) => {
    const sys = (GRADE_SYSTEMS as readonly string[]).includes(x.system) ? x.system as GradeSystem : meta.system;
    setMeta(m => ({ ...m, system: sys, schoolYear: x.schoolYear || m.schoolYear, term: x.term || m.term, termLabel: x.termLabel || '', issuedOn: x.issuedOn || m.issuedOn }));
    const used = new Set<string>();
    setLines(x.lines.map(l => {
      const m = matchSubject(l.subject, custom);
      const value = l.unreadable ? null : parseGradeText(l.grade, sys);
      let id = m.id || '';
      if (id && used.has(id)) id = '';            // a second line for the same subject → let the student decide
      if (id) used.add(id);
      return { key: K++, raw: l.subject, subjectId: m.ignore ? '' : id, name: l.subject, value, confidence: m.ignore ? 1 : m.confidence, ignore: m.ignore, unreadable: l.unreadable || value == null };
    }));
    setNotes(x.unreadable || []);
    setStep('review');
  };
  const onPhoto = async (f: File | undefined) => {
    if (!f) return;
    setErr(''); setStep('reading');
    try {
      const dataUrl = await shrink(f, 2000); setPhoto(dataUrl);
      const blob = await (await fetch(dataUrl)).blob();
      const form = new FormData(); form.append('image', blob, 'report.jpg');
      fromExtract(await api<Extract>('/api/ai/report-card', { form }));
    } catch (e) {
      if (e instanceof ApiError && e.code === 'not_school_material') { setPhoto(null); setErr(t('not_school_material')); setStep('pick'); return; }
      setErr(e instanceof ApiError && e.status === 503 ? t('rc_ai_off') : t('rc_ai_failed'));
      manual();
    }
  };
  const manual = () => { setLines(ls => ls.length ? ls : ['german', 'math', 'english'].map(id => ({ key: K++, raw: '', subjectId: id, name: CANON_SUBJECTS.find(c => c.id === id)!.name[L], value: null, confidence: 1, ignore: false, unreadable: false }))); setStep('review'); };
  const upd = (key: number, p: Partial<Line>) => setLines(ls => ls.map(l => (l.key === key ? { ...l, ...p } : l)));
  const active = lines.filter(l => !l.ignore);
  const dupIds = active.map(l => l.subjectId).filter((id, i, a) => id && a.indexOf(id) !== i);
  const ready = active.filter(l => l.subjectId && l.value != null);
  const confirm = async () => {
    setErr('');
    if (dupIds.length) { setErr(t('rc_dup', { name: subjLabel(dupIds[0]) })); return; }
    if (!ready.length) { setErr(t('rc_need_lines')); return; }
    setBusy(true);
    try {
      const body = { ...meta, lines: ready.map(l => ({ subjectId: l.subjectId, name: l.subjectId.startsWith('c_') ? l.name : CANON_SUBJECTS.find(c => c.id === l.subjectId)?.name.de || l.name, value: l.value })), photo: keepPhoto && photo ? photo : undefined };
      const r = await api<{ card: ReportCard; earned: number }>('/api/report-cards', { body });
      await Promise.all([qc.invalidateQueries({ queryKey: ['report-cards'] }), qc.invalidateQueries({ queryKey: ['rewards'] })]);
      toast(t('rc_saved'), 'ok');
      nav('/reports/' + r.card.id + '?unbox=1', { replace: true });
    } catch { toast(t('err_generic'), 'bad'); } finally { setBusy(false); }
  };
  const allCustom = [...custom, ...lines.filter(l => l.subjectId.startsWith('c_') && !custom.some(c => c.id === l.subjectId)).map(l => ({ id: l.subjectId, name: l.name }))];
  const subjLabel = (id: string) => CANON_SUBJECTS.find(c => c.id === id)?.name[L] || allCustom.find(c => c.id === id)?.name || id;
  const spec = GRADE_SPECS[meta.system], gradeOpts = spec.options ? (meta.system === 'de_grade' ? spec.options : rcOptions(meta.system)) : null;
  const confLevel = (c: number) => (c >= 0.95 ? 'high' : c >= 0.8 ? 'mid' : 'low');

  if (step === 'pick' || step === 'reading') return (
    <section className="page narrow rc-new" data-testid="rc-new">
      <TopBar title={'📜 ' + t('rc_add')} back="/reports" />
      {step === 'reading' ? <div className="empty-hero" data-testid="rc-reading"><div className="spinner" /><p>{t('rc_reading')}</p></div> : <>
        {aiOn ? <label className="big-choice" data-testid="rc-snap"><span className="bc-ic">📸</span><span><b>{t('rc_snap')}</b><small>{t('rc_snap_sub')}</small></span>
          <input type="file" accept="image/*" capture="environment" hidden data-testid="rc-photo-input" onChange={e => void onPhoto(e.target.files?.[0])} /></label>
          : <p className="note" data-testid="rc-ai-off">ℹ️ {t('rc_ai_off')}</p>}
        <button className="big-choice" data-testid="rc-manual" onClick={() => { setErr(''); manual(); }}><span className="bc-ic">✍️</span><span><b>{t('rc_manual')}</b><small>{t('rc_manual_sub')}</small></span></button>
        {err && <p className="err" data-testid="rc-refused">{err}</p>}
      </>}
    </section>);

  return (
    <section className="page narrow rc-new" data-testid="rc-review">
      <TopBar title={'✅ ' + t('rc_review')} back={() => setStep('pick')} />
      <p className="muted small">{t('rc_review_sub')}</p>
      {err && <p className="err" data-testid="rc-err">{err}</p>}
      <div className="card rc-meta">
        <div className="grid2">
          <label className="field"><span>{t('rc_school_year')}</span><input data-testid="rc-year" value={meta.schoolYear} maxLength={7} placeholder="2025/26" onChange={e => setMeta({ ...meta, schoolYear: e.target.value })} /></label>
          <label className="field"><span>{t('rc_issued')}</span><input type="date" data-testid="rc-issued" value={meta.issuedOn} onChange={e => setMeta({ ...meta, issuedOn: e.target.value })} /></label>
          <label className="field"><span>{t('rc_term')}</span><select data-testid="rc-term" value={meta.term} onChange={e => setMeta({ ...meta, term: e.target.value as TermKind })}>{TERM_KINDS.map(k => <option key={k} value={k}>{t(('rc_term_' + k) as Key)}</option>)}</select></label>
          <label className="field"><span>{t('rc_system')}</span><select data-testid="rc-system" value={meta.system} onChange={e => { const s = e.target.value as GradeSystem; setMeta({ ...meta, system: s }); setLines(ls => ls.map(l => ({ ...l, value: l.raw ? l.value : null }))); }}>{GRADE_SYSTEMS.map(s => <option key={s} value={s}>{t(('gs_' + s) as Key)}</option>)}</select></label>
        </div>
        {meta.term === 'custom' && <label className="field"><span>{t('rc_term_label')}</span><input data-testid="rc-term-label" value={meta.termLabel} maxLength={40} onChange={e => setMeta({ ...meta, termLabel: e.target.value })} /></label>}
      </div>
      {notes.length > 0 && <p className="note warn" data-testid="rc-notes">⚠️ {t('rc_unread_note', { what: notes.map(localizeNote).join('; ') })}</p>}
      <div className="rc-lines">{lines.map(l => {
        const lvl = confLevel(l.confidence);
        return (
          <div key={l.key} className={'rc-line' + (l.ignore ? ' ignored' : '') + (l.value == null && !l.ignore ? ' need' : '')} data-testid="rc-line" data-raw={l.raw}>
            {l.raw && <div className="rc-raw"><span className="muted small">„{l.raw}“</span>
              {!l.ignore && l.subjectId && <span className={'chip conf ' + lvl} data-testid="rc-conf" data-level={lvl}>{t(('rc_conf_' + lvl) as Key)}</span>}
              {l.ignore && <span className="chip" data-testid="rc-ignored">{t('rc_ignored')}</span>}</div>}
            {!l.ignore && <div className="rc-edit">
              <select data-testid="rc-subj" value={l.subjectId} className={l.subjectId ? '' : 'need'} onChange={e => {
                const v = e.target.value;
                if (v === NEW) upd(l.key, { subjectId: customId(l.raw || l.name), name: l.raw || l.name, confidence: 1 });
                else upd(l.key, { subjectId: v, confidence: 1 });
              }}>
                <option value="">{t('rc_pick_subject')}</option>
                {CANON_SUBJECTS.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name[L]}</option>)}
                {allCustom.map(c => <option key={c.id} value={c.id}>📘 {c.name}</option>)}
                {l.raw && !allCustom.some(c => c.id === customId(l.raw)) && <option value={NEW}>{t('rc_new_subject', { name: l.raw })}</option>}
              </select>
              {gradeOpts
                ? <select data-testid="rc-grade" value={l.value ?? ''} className={l.value == null ? 'need' : ''} onChange={e => upd(l.key, { value: e.target.value === '' ? null : Number(e.target.value), unreadable: false })}>
                    <option value="">{l.unreadable ? t('rc_unreadable') : t('rc_grade')}</option>
                    {gradeOpts.map(o => <option key={o.label} value={o.value}>{o.label}</option>)}</select>
                : <input type="number" data-testid="rc-grade" min={0} max={100} value={l.value ?? ''} placeholder="%" onChange={e => upd(l.key, { value: e.target.value === '' ? null : Number(e.target.value) })} />}
            </div>}
            <button className="btn link sm" data-testid="rc-ignore" onClick={() => upd(l.key, { ignore: !l.ignore })}>{l.ignore ? '↩︎ ' + t('undo') : '🚫 ' + t('rc_ignore')}</button>
          </div>);
      })}</div>
      <button className="btn ghost" data-testid="rc-add-line" onClick={() => setLines([...lines, { key: K++, raw: '', subjectId: '', name: '', value: null, confidence: 1, ignore: false, unreadable: false }])}>{t('rc_add_line')}</button>
      {photo && <label className="toggle"><input type="checkbox" data-testid="rc-keep-photo" checked={keepPhoto} onChange={e => setKeepPhoto(e.target.checked)} /><span>{t('rc_photo_keep')}</span></label>}
      <div className="sticky-cta"><button className="btn primary big" data-testid="rc-confirm" disabled={busy || !ready.length} onClick={() => void confirm()}>{busy ? '⏳' : '🎉 ' + t('rc_confirm_n', { n: ready.length })}</button></div>
    </section>
  );
}
