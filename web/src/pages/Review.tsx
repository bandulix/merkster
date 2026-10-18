import { useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import type { CardType, DraftRow } from '../../../shared/types';
import { useConfig } from '../hooks';
import { store } from '../lib/store';
import { canSpeak, speak, toast } from '../lib/util';
import { TopBar } from '../components/ui';
import { flag, langName, localizeNote, t } from '../i18n';
import type { Draft } from './Import';

function AutoText(p: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { const el = ref.current; if (el) { el.style.height = 'auto'; el.style.height = Math.min(160, el.scrollHeight + 2) + 'px'; } }, [p.value]);
  return <textarea ref={ref} rows={1} {...p} />;
}

export function Review() {
  const { id } = useParams(); const nav = useNavigate(); const cfg = useConfig();
  const test = store.test(id);
  const [draft, setDraftState] = useState<Draft | null>(() => store.getDraft<Draft>());
  if (!test) return <Navigate to="/" replace />;
  if (!draft || draft.testId !== test.id) return <Navigate to={`/test/${test.id}/import`} replace />;
  const isLang = test.subject === 'languages';
  const rows = draft.rows;
  const save = (d: Draft) => { store.setDraft(d); setDraftState({ ...d }); };
  const setRow = (i: number, patch: Partial<DraftRow>) => { const r = { ...rows[i], ...patch, low: false }; if (r.type === 'cloze' && patch.a !== undefined) { const m = r.a.match(/\[\[(.+?)\]\]/); if (m) r.b = m[1]; } const n = [...rows]; n[i] = r; save({ ...draft, rows: n }); };
  const good = rows.filter(r => r.a.trim() && r.b.trim()).length, low = rows.filter(r => r.low).length;
  const ph = (r: DraftRow, side: 'a' | 'b') => r.type === 'cloze' ? (side === 'a' ? t('ph_cloze') : t('ph_gap')) : r.type === 'qa' || r.type === 'mc' ? (side === 'a' ? t('ph_question') : t('ph_answer')) : isLang ? langName(side === 'a' ? test.foreign : test.native) : side === 'a' ? t('ph_term') : t('ph_def');
  return (
    <section className="review page">
      <TopBar title={t('review_title')} back={`/test/${test.id}/import`} />
      <div className="rev-summary pop-in">
        <div><b className="big-num" data-testid="cards-found">{good}</b> {t('cards_found')}{low > 0 && <> · <span className="warn">{t('n_to_check', { n: low })}</span></>}</div>
        <div className="muted small">{draft.method === 'ai' ? '✨ ' + t('via_ai') : draft.method === 'ocr' ? '🔍 ' + t('via_ocr') : ''}{draft.swapped ? ' · ' + t('swapped_auto') : ''}</div>
        {draft.unreadable.length > 0 && <div className="unread" data-testid="unreadable">⚠️ {t('unreadable')}: {draft.unreadable.map(localizeNote).join(' · ')}</div>}
        {draft.method === 'ocr' && !isLang && !cfg.data?.ai.configured && <div className="ai-banner strong small">✨ <span>{t('ai_better')} {t('ai_tip_admin')}</span></div>}
      </div>
      {draft.thumbs.length > 0 && <div className="thumbs">{draft.thumbs.map((src, i) => <img key={i} src={src} alt="" />)}</div>}
      <div className="col-head"><span>{isLang ? `${flag(test.foreign)} ${langName(test.foreign)}` : t('col_front')}</span>
        {isLang ? <button className="icon-btn swap" data-testid="swap" title={t('swap')} onClick={() => { save({ ...draft, swapped: false, rows: rows.map(r => ({ ...r, a: r.b, b: r.a })) }); toast(t('swapped')); }}>⇄</button> : <span />}
        <span>{isLang ? `${flag(test.native)} ${langName(test.native)}` : t('col_back')}</span></div>
      <div className="rlist" data-testid="review-rows">
        {rows.map((r, i) => (
          <div key={i} className={'rrow' + (r.low ? ' low' : '') + (!r.a.trim() || !r.b.trim() ? ' missing' : '')} data-testid="review-row">
            {!isLang && <select className="type-sel" value={r.type} onChange={e => { const ty = e.target.value as CardType; const n = { ...r, type: ty }; if (ty === 'cloze' && !/\[\[/.test(n.a) && n.b && n.a.includes(n.b)) n.a = n.a.replace(n.b, `[[${n.b}]]`); const all = [...rows]; all[i] = n; save({ ...draft, rows: all }); }}>
              {(['pair', 'qa', 'cloze', 'mc'] as const).map(k => <option key={k} value={k}>{t(('type_' + k) as 'type_pair')}</option>)}</select>}
            <div className="rcells">
              <AutoText data-f="a" value={r.a} placeholder={ph(r, 'a')} onChange={e => setRow(i, { a: e.target.value })} />
              <AutoText data-f="b" value={r.b} placeholder={ph(r, 'b')} onChange={e => setRow(i, { b: e.target.value })} />
              {r.type === 'mc' && <input className="dist" value={(r.distractors || []).join('; ')} placeholder={t('ph_distractors')} onChange={e => setRow(i, { distractors: e.target.value.split(/\s*;\s*/).filter(Boolean) })} />}
            </div>
            <div className="rtools">
              {r.low && <span className="badge-check" title={t('check_this')}>?</span>}
              {isLang && canSpeak() && <button className="icon-btn sm" aria-label={t('listen')} onClick={() => speak(r.a, test.foreign)}>🔊</button>}
              <button className="icon-btn sm del" aria-label={t('delete')} onClick={() => save({ ...draft, rows: rows.filter((_, k) => k !== i) })}>✕</button>
            </div>
          </div>))}
      </div>
      <div className="row-btns wrap">
        <button className="btn ghost" data-testid="add-row" onClick={() => save({ ...draft, rows: [...rows, { type: isLang ? 'pair' : 'qa', a: '', b: '', distractors: [] }] })}>+ {t('add_row')}</button>
        <button className="btn ghost" onClick={() => nav(`/test/${test.id}/import?merge=1`)}>📸 {t('add_page')}</button>
      </div>
      <div className="sticky-foot">
        <button className="btn link" onClick={() => { if (confirm(t('discard_confirm'))) { store.setDraft(null); nav('/test/' + test.id, { replace: true }); } }}>{t('discard')}</button>
        <button className="btn primary big" data-testid="save-cards" disabled={!good} onClick={() => { store.addItems(test, rows); store.setDraft(null); nav(`/test/${test.id}?fresh=1`, { replace: true }); }}>{t('save_n', { n: good })}</button>
      </div>
    </section>
  );
}
