import { useEffect, useState, type MouseEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { APP_NAME } from '../../../shared/brand';
import { useConfig } from '../hooks';
import { api, ApiError } from '../lib/api';
import { GoogleButton, Logo } from '../components/ui';
import { setUiLang, t, uiLang, type Key } from '../i18n';

const ERR: Record<string, Key> = { cancelled: 'err_cancelled', not_allowed: 'err_not_allowed', closed: 'err_registration_closed', expired: 'err_expired', rate_limited: 'err_rate_limited', not_configured: 'err_not_configured', provider_unreachable: 'err_network', signup_expired: 'err_signup_expired' };
const codeErr = (e: unknown): Key => { const c = e instanceof ApiError ? e.code : ''; return c === 'bad_code' ? 'code_wrong' : c === 'rate_limited' ? 'err_rate_limited' : c === 'network' ? 'err_network' : c === 'expired' ? 'err_signup_expired' : (ERR[c] || 'err_unknown'); };

/** the codeword input (only shown when the server has SIGNUP_CODE set – the code itself never reaches the browser) */
function CodeField({ value, onChange, bad, hint, onEnter }: { value: string; onChange: (v: string) => void; bad: boolean; hint?: string; onEnter?: () => void }) {
  return (
    <div className="auth-code">
      <label htmlFor="signup-code">🔑 {t('code_label')}</label>
      <input id="signup-code" data-testid="signup-code" className={bad ? 'bad' : ''} type="text" autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false} maxLength={200}
        placeholder={t('code_ph')} value={value} onChange={e => onChange(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && onEnter) { e.preventDefault(); onEnter(); } }} />
      {hint && <p className="hint">{hint}</p>}
    </div>
  );
}

export function Login() {
  const [, force] = useState(0); const [sp, setSp] = useSearchParams(); const cfg = useConfig();
  const err = sp.get('error'), next = sp.get('next') || '/', step = sp.get('signup');
  const [code, setCode] = useState(''), [codeErrKey, setCodeErrKey] = useState<Key | null>(null), [busy, setBusy] = useState(false);
  const needCode = !!cfg.data?.auth.signupCode;
  const googleHref = '/api/auth/google?next=' + encodeURIComponent(next.startsWith('/') ? next : '/');
  // after Google: a new account that still needs the codeword (no account exists yet)
  const pending = useQuery({ queryKey: ['signup-pending'], queryFn: () => api<{ pending: boolean; name?: string | null; email?: string | null }>('/api/auth/signup/pending'), enabled: step === 'code', retry: 0, staleTime: 0 });
  useEffect(() => { setCodeErrKey(null); }, [code]);

  /* before Google: check a typed codeword, then go to Google. Empty = existing account, go straight on. */
  const goGoogle = async (e: MouseEvent<HTMLAnchorElement> | null) => {
    if (!needCode || !code.trim()) { if (!e) location.assign(googleHref); return; }   // (a click: the link itself navigates)
    e?.preventDefault();
    if (busy) return;
    setBusy(true);
    try { await api('/api/auth/signup-code', { body: { code } }); location.assign(googleHref); }
    catch (x) { setCodeErrKey(codeErr(x)); setBusy(false); }
  };
  const complete = async () => {
    if (busy || !code.trim()) { if (!code.trim()) setCodeErrKey('code_wrong'); return; }
    setBusy(true);
    try { const r = await api<{ next: string }>('/api/auth/signup/complete', { body: { code } }); location.assign(r.next || '/'); }
    catch (x) {
      const k = codeErr(x); setBusy(false);
      if (x instanceof ApiError && x.code !== 'bad_code' && x.code !== 'rate_limited' && x.code !== 'network') { setSp({ error: x.code === 'expired' ? 'signup_expired' : x.code }, { replace: true }); return; }
      setCodeErrKey(k);
    }
  };
  const otherAccount = async () => { try { await api('/api/auth/signup/cancel', { body: {} }); } catch { /* ignore */ } location.assign('/api/auth/google?next=%2F'); };

  const langs = <div className="auth-lang">{(['en', 'de'] as const).map(l => <button key={l} className={'pill sm' + (uiLang() === l ? ' on' : '')} onClick={() => { setUiLang(l); force(x => x + 1); }}>{l === 'en' ? 'English' : 'Deutsch'}</button>)}</div>;

  if (step === 'code' && pending.data?.pending) {
    const p = pending.data;
    return (
      <div className="auth">
        <div className="auth-stars" aria-hidden />
        <div className="auth-card pop-in" data-testid="signup-code-step">
          {langs}
          <Logo size={72} className="auth-logo" />
          <h1 className="auth-title sm">{p.name ? t('code_new_title', { name: p.name }) : t('code_new_title_anon')}</h1>
          <p className="auth-claim sm">{p.email ? t('code_new_sub', { email: p.email }) : t('code_new_sub_anon')}</p>
          <CodeField value={code} onChange={setCode} bad={!!codeErrKey} onEnter={complete} />
          {codeErrKey && <p className="err" role="alert" data-testid="code-error">{t(codeErrKey)}</p>}
          <button className="btn start big wide auth-code-btn" data-testid="signup-complete" disabled={busy} onClick={complete}>{busy ? t('code_checking') : '🚀 ' + t('code_create')}</button>
          <p className="muted small center">{t('code_no_code')}</p>
          <button className="auth-link" data-testid="signup-other" onClick={otherAccount}>{t('code_other_account')}</button>
        </div>
      </div>
    );
  }
  const shownErr = err || (step === 'code' && pending.data && !pending.data.pending ? 'signup_expired' : null);
  return (
    <div className="auth">
      <div className="auth-stars" aria-hidden />
      <div className="auth-card pop-in">
        {langs}
        <Logo size={96} className="auth-logo" />
        <h1 className="auth-title">{APP_NAME}</h1>
        <p className="auth-claim">{t('claim')}</p>
        <ul className="auth-points"><li>📸 {t('login_p1')}</li><li>🧠 {t('login_p2')}</li><li>🚀 {t('login_p3')}</li></ul>
        {shownErr && <p className="err" role="alert" data-testid="auth-error">{t(ERR[shownErr] || 'err_unknown')}</p>}
        {cfg.data && !cfg.data.auth.google
          ? <p className="warn-box">{t('err_not_configured')}</p>
          : <>
            {needCode && <CodeField value={code} onChange={setCode} bad={!!codeErrKey} hint={t('code_hint')} onEnter={() => goGoogle(null)} />}
            {codeErrKey && <p className="err" role="alert" data-testid="code-error">{t(codeErrKey)}</p>}
            <GoogleButton href={googleHref} label={busy ? t('code_checking') : t('continue_google')} onClick={goGoogle} />
          </>}
        {cfg.data?.auth.testProvider && <p className="muted small center" data-testid="test-provider">🧪 {t('test_provider')}</p>}
        <p className="muted small center auth-legal">{t('login_privacy')}</p>
      </div>
    </div>
  );
}
