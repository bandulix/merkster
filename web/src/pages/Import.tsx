import { useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import type { DraftRow, Test } from '../../../shared/types';
import { useConfig, useStore } from '../hooks';
import { store } from '../lib/store';
import { processFiles, type ImportResult, type Status } from '../lib/ocr';
import { orient, parseGeneral, parseText } from '../lib/parse';
import { ApiError } from '../lib/api';
import { toast } from '../lib/util';
import { Logo, TopBar } from '../components/ui';
import { demoRows, t, tp } from '../i18n';

export interface Draft { testId: string; rows: DraftRow[]; thumbs: string[]; method: string; swapped?: boolean; unreadable: string[]; unused?: number; aiError?: string | null }

/** bold the test name where {name} sits in the sentence (end in English, middle in German) */
export function ImportLead({ name }: { name: string }) {
  const [before, after = ''] = t('import_lead', { name: '\u0000' }).split('\u0000');
  return <p className="lead" data-testid="import-lead">{before}<b>{name}</b>{after}</p>;
}

/** put rows into the review draft (merging with an existing draft for "add another page") */
export function toReview(test: Test, res: Partial<Omit<ImportResult, 'method'>> & { rows: DraftRow[]; method: string }, merge: boolean) {
  const old = merge ? store.getDraft<Draft>() : null;
  const rows = res.rows.map(r => ({ type: r.type || 'pair', a: r.a || '', b: r.b || '', example: r.example || '', distractors: r.distractors || [], low: !!r.low, flags: r.flags || [] }));
  const draft: Draft = old && old.testId === test.id
    ? { ...old, rows: old.rows.concat(rows.filter(r => !old.rows.some(o => o.a === r.a && o.b === r.b))), thumbs: (old.thumbs || []).concat(res.thumbs || []), unreadable: (old.unreadable || []).concat(res.unreadable || []) }
    : { testId: test.id, rows, thumbs: res.thumbs || [], method: res.method, swapped: res.swapped, unreadable: res.unreadable || [], unused: res.unused || 0, aiError: res.aiError || null };
  store.setDraft(draft);
}

export function ImportPage() {
  const { id } = useParams(); const [sp] = useSearchParams(); const merge = sp.get('merge') === '1';
  useStore(); const nav = useNavigate(); const cfg = useConfig();
  const test = store.test(id);
  const [status, setStatus] = useState<Status | null>(null), [error, setError] = useState<string | null>(null);
  if (!test) return <div className="page"><TopBar title="" back="/" /></div>;
  const isLang = test.subject === 'languages', ai = !!cfg.data?.ai.configured;
  const onFiles = async (files: File[]) => {
    if (!files.length) return;
    setError(null); setStatus({ stage: 'load', progress: 0 });
    try {
      const res = await processFiles(files, test, ai, s => setStatus(s));
      if (res.aiError) toast(res.aiError === 'ai_rate_limited' ? t('ai_rate_limited') : t('ai_failed'), 'bad');
      if (res.pictureDropped) toast(tp('picture_limit_left', res.pictureDropped), 'bad');
      toReview(test, res, merge);
      nav('/test/' + test.id + '/review', { replace: true });
    } catch (e) {
      if (e instanceof ApiError && e.code === 'not_school_material') { setError('not_school_material'); setStatus(null); return; }
      if (e instanceof ApiError && e.code === 'picture_limit') { setError('picture_limit'); setStatus(null); return; }
      console.error('import failed', (e as Error).message); setError((e as Error).message || ''); setStatus(null);
    }
  };
  const pct = status ? Math.round((((status.page || 1) - 1) + (status.progress || 0)) / (status.of || 1) * 100) : 0;
  const label = status && ({ ai: t('st_ai'), load: t('st_load'), pdf: t('st_pdf'), prep: t('st_prep'), ocr: t('st_ocr') } as const)[status.stage];
  return (
    <section className="import page narrow">
      <TopBar title={t('add_cards')} back={merge ? `/test/${test.id}/review` : `/test/${test.id}`} />
      <ImportLead name={test.name} />
      {ai ? <div className="ai-banner on" data-testid="ai-on">✨ <span>{t('ai_on')}</span></div>
        : <div className={'ai-banner' + (isLang ? '' : ' strong')} data-testid="ai-off">{isLang ? '💡' : '✨'} <span>{isLang ? t('ai_tip_lang') : t('ai_tip_general')} {t('ai_tip_admin')}</span></div>}
      {error === 'picture_limit' && <div className="proc" data-testid="import-picture-limit"><b>{t('picture_limit')}</b><p className="muted">{t('pictures_max')}</p><button className="btn primary" onClick={() => setError(null)}>{t('try_again')}</button></div>}
      {error === 'not_school_material' && <div className="proc" data-testid="import-refused"><b>😕 {t('not_school_material')}</b><button className="btn primary" onClick={() => setError(null)}>{t('try_again')}</button></div>}
      {error != null && error !== 'picture_limit' && error !== 'not_school_material' && <div className="proc" data-testid="import-error"><b>😕 {t('import_failed')}</b><p className="muted">{error}</p><button className="btn primary" onClick={() => setError(null)}>{t('try_again')}</button></div>}
      {status ? (
        <div className="proc pop-in" data-testid="progress">
          <div className="scan"><Logo size={64} /><i /></div>
          <b>{label}</b><p className="muted">{status.of ? t('page_of', { p: status.page || 1, n: status.of }) : ''}</p>
          <div className="bar big"><i style={{ width: Math.max(4, pct) + '%' }} /></div>
        </div>
      ) : error == null && (<>
        <div className="import-empty" data-testid="import-empty">
          <div className="import-orb" aria-hidden="true">
            <svg viewBox="0 0 72 72" width="78" height="78">
              <rect x="12" y="8" width="34" height="46" rx="6" fill="#fff" stroke="#0d0f1e" strokeWidth="2.5" />
              <path d="M20 22h18M20 30h18M20 38h11" stroke="#0d0f1e" strokeWidth="2.5" strokeLinecap="round" />
              <circle cx="48" cy="48" r="16" fill="#0d0f1e" />
              <circle cx="48" cy="48" r="6.5" fill="#c6f432" />
              <rect x="43" y="34" width="10" height="5" rx="1.5" fill="#0d0f1e" />
            </svg>
          </div>
          <p className="import-line">{t('import_empty_line')}</p>
          <div className="import-actions">
            <label className="btn primary big wide"><input type="file" accept="image/*" capture="environment" hidden onChange={e => onFiles([...(e.target.files || [])])} />📸 {t('take_photo')}</label>
            <label className="btn ghost big wide"><input type="file" accept="image/*,application/pdf,.pdf" multiple hidden data-testid="file-input" onChange={e => onFiles([...(e.target.files || [])])} />🖼️ {t('upload')}</label>
            <button className="btn link" data-testid="paste-tile" onClick={() => nav(`/test/${test.id}/paste${merge ? '?merge=1' : ''}`)}>⌨️ {t('type_paste')}</button>
          </div>
        </div>
        <p className="muted" data-testid="pictures-max">{t('pictures_max')}</p>
        <details className="tips"><summary>📷 {t('photo_tips')}</summary><ul><li>{t('tip1')}</li><li>{t('tip2')}</li><li>{t('tip3')}</li></ul></details>
        <button className="btn link center-block" data-testid="use-demo" onClick={() => { toReview(test, { rows: demoRows(test), method: 'demo' }, merge); nav(`/test/${test.id}/review`, { replace: true }); }}>🎲 {t('use_demo')}</button>
      </>)}
    </section>
  );
}

export function PastePage() {
  const { id } = useParams(); const [sp] = useSearchParams(); const merge = sp.get('merge') === '1';
  const nav = useNavigate(); const test = store.test(id); const [txt, setTxt] = useState('');
  if (!test) return null;
  const isLang = test.subject === 'languages';
  const parse = () => {
    let rows: DraftRow[];
    if (isLang) {
      const r = parseText(txt);
      rows = r.rows.map(x => ({ type: 'pair' as const, a: x.a, b: x.b, low: x.low, flags: x.flags }));
      if (test.foreign && orient(rows, test.foreign, test.native, r.header).swap) rows.forEach(x => { const s = x.a; x.a = x.b; x.b = s; });
    } else rows = parseGeneral(txt).rows.map(x => ({ type: x.type || 'pair', a: x.a, b: x.b, low: x.low, flags: x.flags }));
    if (!rows.length) { toast(t('nothing_found'), 'bad'); return; }
    toReview(test, { rows, method: 'paste' }, merge); nav(`/test/${test.id}/review`, { replace: true });
  };
  const empty = () => { const ty = isLang ? 'pair' as const : 'qa' as const; toReview(test, { rows: [0, 1, 2].map(() => ({ type: ty, a: '', b: '' })), method: 'manual' }, merge); nav(`/test/${test.id}/review`, { replace: true }); };
  return (
    <section className="import page narrow">
      <TopBar title={t('type_paste')} back={`/test/${test.id}/import${merge ? '?merge=1' : ''}`} />
      <p className="muted">{isLang ? t('paste_hint_lang') : t('paste_hint_general')}</p>
      <textarea className="paste" data-testid="paste-text" rows={12} value={txt} onChange={e => setTxt(e.target.value)} placeholder={isLang ? t('paste_ph_lang') : t('paste_ph_general')} />
      <div className="row-btns"><button className="btn ghost" onClick={empty}>{t('start_empty')}</button><button className="btn primary big" data-testid="paste-parse" onClick={parse}>{t('read_list')}</button></div>
    </section>
  );
}
