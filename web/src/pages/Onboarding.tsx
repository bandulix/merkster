import { useRef } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useStore } from '../hooks';
import { store } from '../lib/store';
import { Logo } from '../components/ui';
import { GRADE_SYSTEMS, type GradeSystem } from '../../../shared/types';
import { t } from '../i18n';

export function Onboarding() {
  const step = Math.min(3, Math.max(1, Number(useParams().step) || 1));
  const d = useStore(), nav = useNavigate();
  const leaving = useRef(false);
  const done = (to: string) => { leaving.current = true; store.setSettings({ onboarded: true }); nav(to, { replace: true }); };
  // a new device may land here before the first sync finished – once the account turns out to be onboarded, leave
  if (d.settings.onboarded && !leaving.current) return <Navigate to="/" replace />;
  const art = step === 1 ? <Logo size={120} className="ob-logo" />
    : step === 2 ? <div className="ob-steps"><span>📸</span><i>→</i><span>🧠</span><i>→</i><span>🏆</span><i>→</i><span>🎁</span></div>
      : <div className="ob-cal">{[t('ob_d1'), t('ob_d2'), t('ob_d3'), '🌙', '☀️'].map((x, i) => <b key={i} style={{ ['--i' as string]: i }}>{x}</b>)}</div>;
  return (
    <section className="onboard" data-testid="onboarding">
      <div className="ob-lang">{(['en', 'de'] as const).map(l => <button key={l} className={'pill' + (d.settings.uiLang === l ? ' on' : '')} onClick={() => store.setSettings({ uiLang: l })}>{l === 'en' ? 'English' : 'Deutsch'}</button>)}</div>
      <div className="ob-art pop-in" key={step}>{art}</div>
      <h1 className="ob-title">{t(`ob${step}_title` as 'ob1_title')}</h1>
      <p className="ob-text">{t(`ob${step}_text` as 'ob1_text')}</p>
      {step === 3 && <p className="ob-text" data-testid="ob-parent">{t('ob_parent')}</p>}
      {step === 1 && <label className="ob-grading"><span>🎓 {t('ob_grading')}</span>
        <select className="select" data-testid="ob-grading" value={d.settings.grading} onChange={e => store.setSettings({ grading: e.target.value as GradeSystem })}>{GRADE_SYSTEMS.map(g => <option key={g} value={g}>{t(('gs_' + g) as 'gs_de_grade')}</option>)}</select>
        <small>{t('ob_grading_sub')}</small></label>}
      <div className="dots">{[1, 2, 3].map(i => <i key={i} className={i === step ? 'on' : ''} />)}</div>
      <div className="ob-actions">
        {step < 3
          ? <><button className="btn primary big wide" onClick={() => nav('/welcome/' + (step + 1))}>{t('next')}</button><button className="btn link" data-testid="ob-skip" onClick={() => done('/')}>{t('skip')}</button></>
          : <><button className="btn primary big wide" data-testid="ob-invite" onClick={() => done('/supporters?invite=mum')}>🎁 {t('parent_invite_cta')}</button><button className="btn ghost big wide" data-testid="ob-create" onClick={() => done('/new')}>📸 {t('ob_create')}</button><button className="btn link" onClick={() => done('/')}>{t('ob_look')}</button></>}
      </div>
    </section>
  );
}
