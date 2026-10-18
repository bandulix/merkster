import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { TESTS_PER_24H, recentTestCount } from '../../../shared/limits';
import type { Format, Lang, Subject } from '../../../shared/types';
import { useStore } from '../hooks';
import { api } from '../lib/api';
import { store } from '../lib/store';
import * as S from '../lib/schedule';
import { now } from '../lib/util';
import { TopBar } from '../components/ui';
import { flag, formatsFor, langName, SUBJECTS, t, uiLang } from '../i18n';

const ART: Partial<Record<Lang, string>> = { de: 'der/die/das', fr: 'le/la', es: 'el/la' };
export function NewTest() {
  const d = useStore(), nav = useNavigate();
  const today = S.dayISO(now());
  const [sp] = useSearchParams();
  const preSubj = (sp.get('subject') && sp.get('subject')! in SUBJECTS ? sp.get('subject') : null) as Subject | null, preLang = sp.get('foreign') as Lang | null;
  const [w, setW] = useState(() => ({ step: 1, subject: preSubj, foreign: (preLang || (d.settings.uiLang === 'de' ? 'en' : 'de')) as Lang, native: (d.settings.uiLang === 'de' ? 'de' : 'en') as Lang, name: preSubj ? (preSubj === 'languages' ? t('auto_name_lang', { lang: langName((preLang || 'en') as Lang) }) : t('auto_name', { subject: SUBJECTS[preSubj].name[uiLang()] })) : '', nameTouched: false, testDate: S.addDays(today, 7), format: 'mixed' as Format, articles: false }));
  const up = (p: Partial<typeof w>) => setW(x => {
    const n = { ...x, ...p };
    if (n.subject === 'languages' && n.foreign === n.native) n.foreign = n.native === 'de' ? 'en' : 'de';
    if (n.subject && !n.nameTouched) n.name = n.subject === 'languages' ? t('auto_name_lang', { lang: langName(n.foreign) }) : t('auto_name', { subject: SUBJECTS[n.subject].name[uiLang()] });
    return n;
  });
  const [blocked, setBlocked] = useState(() => recentTestCount(store.data.tests, now()) >= TESTS_PER_24H);
  const [busy, setBusy] = useState(false);
  const overLimit = async () => {
    const local = recentTestCount(store.data.tests, now());
    let serverUsed = 0;
    try { serverUsed = (await api<{ used: number }>('/api/tests/quota')).used; } catch { /* offline: the tests on this device still count */ }
    return Math.max(local, serverUsed) >= TESTS_PER_24H;
  };
  useEffect(() => { let cancel = false; void overLimit().then(hit => { if (!cancel) setBlocked(hit); }); return () => { cancel = true; }; }, [d.tests.length]);
  const canNext = w.step === 1 ? !!w.subject && !!w.name.trim() : w.step === 2 ? !!w.testDate : !!w.format;
  const next = async () => {
    if (busy) return;
    if (w.step < 3) return up({ step: w.step + 1 });
    setBusy(true);
    try {
      const hit = await overLimit();
      setBlocked(hit);
      if (hit) return;
      const test = store.createTest({ name: w.name.trim(), subject: w.subject!, foreign: w.subject === 'languages' ? w.foreign : null, native: w.native, testDate: w.testDate, format: w.format, articles: w.articles });
      nav('/test/' + test.id + '/import', { replace: true });
    } finally { setBusy(false); }
  };
  let body;
  if (w.step === 1) body = (<>
    <h2 className="q">{t('wiz_subject')}</h2>
    <div className="subject-grid">{(Object.keys(SUBJECTS) as Subject[]).map(k => <button key={k} data-testid={'subj-' + k} className={'subj' + (w.subject === k ? ' on' : '')} onClick={() => up({ subject: k, format: k === 'languages' ? w.format : 'mixed', native: k !== 'languages' && !['de', 'en', 'fr', 'es'].includes(w.native) ? 'de' : w.native })}><span>{SUBJECTS[k].icon}</span>{SUBJECTS[k].name[uiLang()]}</button>)}</div>
    {w.subject === 'languages' && <>
      <h3 className="q2">{t('wiz_which_lang')}</h3>
      <div className="chips">{(['en', 'fr', 'es', 'la', 'de'] as Lang[]).filter(l => l !== w.native).map(l => <button key={l} data-testid={'foreign-' + l} className={'pill' + (w.foreign === l ? ' on' : '')} onClick={() => up({ foreign: l, articles: l === 'de' })}>{flag(l)} {langName(l)}</button>)}</div>
      <h3 className="q2">{t('wiz_my_lang')}</h3>
      <div className="chips">{(['de', 'en'] as Lang[]).map(l => <button key={l} data-testid={'my-lang-' + l} className={'pill' + (w.native === l ? ' on' : '')} onClick={() => up({ native: l })}>{flag(l)} {langName(l)}</button>)}</div>
    </>}
    {w.subject && w.subject !== 'languages' && <>
      <h3 className="q2">{t('wiz_material_lang')}</h3>
      <div className="chips">{(['de', 'en', 'fr', 'es'] as Lang[]).map(l => <button key={l} data-testid={'native-' + l} className={'pill' + (w.native === l ? ' on' : '')} onClick={() => up({ native: l })}>{flag(l)} {langName(l)}</button>)}</div>
    </>}
    {w.subject && <label className="field"><span>{t('wiz_name')}</span><input data-testid="test-name" value={w.name} maxLength={60} onChange={e => up({ name: e.target.value, nameTouched: true })} /></label>}
  </>);
  else if (w.step === 2) body = (<>
    <h2 className="q">{t('wiz_when')}</h2>
    <div className="chips">{([[1, 'q_tomorrow'], [3, 'q_3days'], [7, 'q_week'], [14, 'q_2weeks']] as const).map(([n, k]) => <button key={n} data-testid={'qdate-' + n} className={'pill' + (w.testDate === S.addDays(today, n) ? ' on' : '')} onClick={() => up({ testDate: S.addDays(today, n) })}>{t(k)}</button>)}</div>
    <label className="field"><span>{t('wiz_date')}</span><input type="date" min={today} value={w.testDate} onChange={e => e.target.value && up({ testDate: e.target.value })} /></label>
    <p className="muted">{t('wiz_when_hint', { n: Math.max(0, S.daysBetween(today, w.testDate)) })}</p>
  </>);
  else body = (<>
    <h2 className="q">{t('wiz_format')}</h2><p className="muted">{t('wiz_format_hint')}</p>
    <div className="fmt-list">{formatsFor(w.subject!, w.foreign, w.native).map(o => <button key={o.id} data-testid={'fmt-' + o.id} className={'fmt' + (w.format === o.id ? ' on' : '')} onClick={() => up({ format: o.id })}><span className="fi">{o.icon}</span><span><b>{o.label}</b><small>{o.how}</small></span></button>)}</div>
    {w.subject === 'languages' && ART[w.foreign] && <label className="toggle"><input type="checkbox" checked={w.articles} onChange={e => up({ articles: e.target.checked })} /><span>{t('articles_count', { ex: ART[w.foreign]! })}</span></label>}
  </>);
  return (
    <section className="wizard page narrow">
      <TopBar title={t('new_test')} back={() => (w.step > 1 ? up({ step: w.step - 1 }) : nav(-1))} />
      <div className="wiz-prog">{[1, 2, 3].map(i => <i key={i} className={i <= w.step ? 'on' : ''} />)}</div>
      {blocked && <p className="ai-banner" data-testid="test-limit" role="status">{t('test_limit')}</p>}
      <div className="wiz-body pop-in" key={w.step}>{body}</div>
      <div className="wiz-foot"><button className="btn primary big wide" data-testid="wiz-next" disabled={!canNext || busy || (w.step === 3 && blocked)} onClick={next}>{w.step < 3 ? t('next') : '📸 ' + t('wiz_create')}</button></div>
    </section>
  );
}
