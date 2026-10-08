import { useState } from 'react';
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import type { Card, Format, GradeSystem } from '../../../shared/types';
import { GRADE_SYSTEMS } from '../../../shared/types';
import { fmtResult } from '../../../shared/grades';
import { practiceBefore } from '../../../shared/gamification';
import { useStore } from '../hooks';
import { store } from '../lib/store';
import * as S from '../lib/schedule';
import { canSpeak, countdown, fmtDay, now, speak } from '../lib/util';
import { extraEntries, startPractice } from '../lib/activeSession';
import { Ring, TopBar } from '../components/ui';
import { ResultDialog } from '../components/ResultDialog';
import { ShareSheet, type ShareWhat } from '../components/Share';
import { CheerChips } from '../components/Cheers';
import { EarnCards, ResultExtras } from '../components/Rewards';
import { cheersFor, useCheers } from '../lib/supporters';
import { formatsFor, t, testIcon, type Key } from '../i18n';

const PK: Record<string, Key> = { first: 'pk_first', next: 'pk_next', relearn: 'pk_relearn', night: 'pk_night', morning: 'pk_morning', 'first+night': 'pk_first' };

export function TestDetail() {
  const { id } = useParams(); const [sp] = useSearchParams(); const nav = useNavigate(); const d = useStore();
  const test = store.test(id); const ts = now(), today = S.dayISO(ts);
  const [q, setQ] = useState(''), [edit, setEdit] = useState<string | null>(null), [showSettings, setShowSettings] = useState(false);
  const [result, setResult] = useState(false), [share, setShare] = useState<ShareWhat | null>(null);
  const cheers = useCheers();
  if (!test) return <Navigate to="/" replace />;
  const cd = countdown(test), m = S.mastery(test), ph = S.phase(test, ts);
  const due = S.dueReviews(test, ts).length + S.newItems(test, ts).length;
  const go = () => { const e = S.buildSession([test], ts, d.settings.sessionSize).entries; if (startPractice(e.length ? e : extraEntries([test], d.settings.sessionSize))) nav('/practice'); };
  const fresh = sp.get('fresh') === '1' && test.items.length > 0 && !test.items.some(i => i.st.introduced);
  const plan = S.plan(test);
  const items = q ? test.items.filter(i => (i.term + ' ' + i.meaning).toLowerCase().includes(q.toLowerCase())) : test.items;
  const pb = practiceBefore(test, d.history);
  return (
    <section className="detail page">
      <TopBar title={<span className="td-title">{testIcon(test)} {test.name}</span>} back="/" right={<button className="icon-btn" data-testid="td-settings" aria-label={t('settings_test')} onClick={() => setShowSettings(s => !s)}>⚙️</button>} />
      <div className="td-hero pop-in">
        <Ring pct={m} size={96} stroke={9} />
        <div><span className={'cd ' + cd.cls}>{cd.label}</span><p className="muted">{fmtDay(test.testDate)} · {t('n_cards', { n: test.items.length })}</p>
          <p className="small">{t('pb_line', { s: pb.sessions, d: pb.days, m: pb.minutes })}</p></div>
      </div>
      {fresh && <div className="fresh-card pop-in"><h2>🎉 {t('fresh_title', { n: test.items.length })}</h2><p>{t('fresh_text', { n: plan.length })}</p></div>}
      {ph === 'past' ? (
        test.result
          ? <div className="card res-card"><span>{t('your_result')}</span><b className="big-num" data-testid="td-result">{fmtResult(test.result)}</b><div className="row-btns"><button className="btn ghost sm" onClick={() => setResult(true)}>✏️ {t('edit')}</button><button className="btn ghost sm" data-testid="td-share" onClick={() => setShare({ kind: 'result', test })}>📤 {t('share')}</button></div><CheerChips groups={cheersFor(cheers.data, 'result', test.id)} /><ResultExtras test={test} /></div>
          : <button className="ask-card" data-testid="td-ask-result" onClick={() => setResult(true)}><span className="tc-icon">📝</span><span><b>{t('how_did_it_go')}</b><small>{t('result_xp_hint')}</small></span><span className="btn primary sm">{t('enter_result')}</span></button>
      ) : test.items.length > 0 && <button className="btn primary big wide" data-testid="practice-test" onClick={go}>▶ {due ? t('practice_now') + ` (${due})` : t('practice_extra')}</button>}
      {!test.result && <EarnCards subject={test.subject} test={test} />}
      <div className="row-btns wrap">
        <button className="btn ghost" data-testid="add-cards" onClick={() => nav(`/test/${test.id}/import`)}>📸 {t('add_cards')}</button>
        {ph !== 'past' && test.testDate <= today && <button className="btn ghost" onClick={() => setResult(true)}>📝 {t('enter_result')}</button>}
      </div>
      {showSettings && <div className="card settings-card pop-in">
        <h3>{t('settings_test')}</h3>
        <label className="field"><span>{t('wiz_name')}</span><input defaultValue={test.name} maxLength={60} onBlur={e => e.target.value.trim() && store.updateTest(test.id, { name: e.target.value.trim() })} /></label>
        <label className="field"><span>{t('wiz_date')}</span><input type="date" data-testid="td-date" value={test.testDate} onChange={e => e.target.value && store.updateTest(test.id, { testDate: e.target.value })} /></label>
        <label className="field"><span>{t('wiz_format')}</span><select value={test.format} onChange={e => store.updateTest(test.id, { format: e.target.value as Format })}>{formatsFor(test.subject, test.foreign, test.native).map(o => <option key={o.id} value={o.id}>{o.icon} {o.label}</option>)}</select></label>
        <label className="field"><span>{t('td_grading')}</span><select data-testid="td-grading" value={test.grading || ''} onChange={e => store.updateTest(test.id, { grading: (e.target.value || null) as GradeSystem | null })}><option value="">{t('td_grading_default', { sys: t(('gs_' + d.settings.grading) as 'gs_de_grade') })}</option>{GRADE_SYSTEMS.map(g => <option key={g} value={g}>{t(('gs_' + g) as 'gs_de_grade')}</option>)}</select></label>
        <button className="btn link bad" onClick={() => { if (confirm(t('delete_confirm', { name: test.name }))) { store.deleteTest(test.id); nav('/', { replace: true }); } }}>🗑 {t('delete_test')}</button>
      </div>}
      {plan.length > 0 && <div className="card"><h3>{t('plan_title')}</h3>
        <ol className="timeline">{plan.map((p, i) => { const st = p.day < today ? (test.days.includes(p.day) ? 'done' : 'missed') : p.day === today ? 'today' : 'future'; return (
          <li key={i} className={'tl ' + st}><i /><span><b>{p.day === today ? t('due_today') : fmtDay(p.day)}</b><small>{t(PK[p.kind])}</small></span>{st === 'done' && '✓'}</li>); })}</ol>
        <p className="muted small">{t('plan_hint', { g: S.gapDays(test) })}</p></div>}
      <div className="card">
        <div className="sec-head"><h3>{t('n_cards', { n: test.items.length })}</h3>{test.items.length > 8 && <input className="search" placeholder={t('search')} value={q} onChange={e => setQ(e.target.value)} />}</div>
        <ul className="card-list" data-testid="card-list">{items.map(c => <CardRow key={c.id} c={c} testId={test.id} lang={test.subject === 'languages' ? test.foreign : null} editing={edit === c.id} setEdit={setEdit} />)}</ul>
      </div>
      {result && <ResultDialog test={test} onClose={() => setResult(false)} onSaved={best => best && setShare({ kind: 'result', test: store.test(test.id)!, best })} />}
      {share && <ShareSheet what={share} onClose={() => setShare(null)} />}
    </section>
  );
}
function CardRow({ c, testId, lang, editing, setEdit }: { c: Card; testId: string; lang: Parameters<typeof speak>[1]; editing: boolean; setEdit: (id: string | null) => void }) {
  const [a, setA] = useState(c.term), [b, setB] = useState(c.meaning);
  const lvl = Math.min(4, c.st.sessions);
  if (editing) return (
    <li className="crow editing"><textarea value={a} onChange={e => setA(e.target.value)} /><textarea value={b} onChange={e => setB(e.target.value)} />
      <div className="row-btns"><button className="btn link bad" onClick={() => store.deleteCard(testId, c.id)}>{t('delete')}</button><button className="btn primary sm" onClick={() => { if (a.trim() && b.trim()) store.updateCard(testId, c.id, { term: a.trim(), meaning: b.trim() }); setEdit(null); }}>{t('saved')}</button></div></li>);
  return (
    <li className="crow" onClick={() => setEdit(c.id)}>
      <span className="ct">{c.type === 'cloze' ? c.term.replace(/\[\[(.+?)\]\]/g, '_____') : c.term}</span><span className="cm">{c.meaning}</span>
      {lang && canSpeak() && <button className="icon-btn sm" aria-label={t('listen')} onClick={e => { e.stopPropagation(); speak(c.term, lang); }}>🔊</button>}
      <span className={'lvl l' + lvl} title={t('level') + ' ' + lvl}>{'●'.repeat(lvl) + '○'.repeat(4 - lvl)}</span>
    </li>);
}
