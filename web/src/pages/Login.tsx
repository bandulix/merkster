import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { APP_NAME } from '../../../shared/brand';
import { useConfig } from '../hooks';
import { GoogleButton, Logo } from '../components/ui';
import { setUiLang, t, uiLang, type Key } from '../i18n';

const ERR: Record<string, Key> = { cancelled: 'err_cancelled', not_allowed: 'err_not_allowed', closed: 'err_registration_closed', expired: 'err_expired', rate_limited: 'err_rate_limited', not_configured: 'err_not_configured', provider_unreachable: 'err_network' };

export function Login() {
  const [, force] = useState(0); const [sp] = useSearchParams(); const cfg = useConfig();
  const err = sp.get('error'), next = sp.get('next') || '/';
  return (
    <div className="auth">
      <div className="auth-stars" aria-hidden />
      <div className="auth-card pop-in">
        <div className="auth-lang">{(['en', 'de'] as const).map(l => <button key={l} className={'pill sm' + (uiLang() === l ? ' on' : '')} onClick={() => { setUiLang(l); force(x => x + 1); }}>{l === 'en' ? 'English' : 'Deutsch'}</button>)}</div>
        <Logo size={96} className="auth-logo" />
        <h1 className="auth-title">{APP_NAME}</h1>
        <p className="auth-claim">{t('claim')}</p>
        <ul className="auth-points"><li>📸 {t('login_p1')}</li><li>🧠 {t('login_p2')}</li><li>🚀 {t('login_p3')}</li></ul>
        {err && <p className="err" role="alert" data-testid="auth-error">{t(ERR[err] || 'err_unknown')}</p>}
        {cfg.data && !cfg.data.auth.google
          ? <p className="warn-box">{t('err_not_configured')}</p>
          : <GoogleButton href={'/api/auth/google?next=' + encodeURIComponent(next.startsWith('/') ? next : '/')} label={t('continue_google')} />}
        {cfg.data?.auth.testProvider && <p className="muted small center" data-testid="test-provider">🧪 {t('test_provider')}</p>}
        <p className="muted small center auth-legal">{t('login_privacy')}</p>
      </div>
    </div>
  );
}
