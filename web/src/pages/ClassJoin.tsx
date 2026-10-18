/* /class#<token> – a classmate opens the link, signs in, and joins the class. */
import { useEffect, useState, type MouseEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { APP_NAME } from '../../../shared/brand';
import type { User } from '../../../shared/types';
import { api, ApiError } from '../lib/api';
import { classToken } from '../lib/classes';
import { confetti } from '../lib/util';
import { GoogleButton, Logo } from '../components/ui';
import { useConfig } from '../hooks';
import { t, type Key } from '../i18n';

interface Preview { valid: boolean; reason?: string; className?: string; motto?: string; cover?: string | null; members?: number; inviterName?: string }

export function ClassJoin({ user }: { user: User | null }) {
  const [token] = useState(() => classToken.capture());
  const nav = useNavigate(), qc = useQueryClient(), cfg = useConfig();
  const googleHref = '/api/auth/google?next=' + encodeURIComponent('/class');
  const signInViaInvite = async (e: MouseEvent<HTMLAnchorElement>) => {
    if (!token || cfg.data?.auth.signupCode === false) return;
    e.preventDefault();
    try { await api('/api/auth/invite-pass', { body: { token } }); } catch { /* existing accounts don't need it */ }
    location.assign(googleHref);
  };
  const pv = useQuery({ queryKey: ['class-invite', token], queryFn: () => api<Preview>('/api/class/preview', { body: { token } }), enabled: !!token, retry: 0, staleTime: Infinity });
  const [done, setDone] = useState<{ name: string; id: string } | null>(null), [err, setErr] = useState<string | null>(null), [busy, setBusy] = useState(false);
  useEffect(() => { if (done) { confetti(); setTimeout(confetti, 600); } }, [done]);
  const accept = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await api<{ classId: string; name: string }>('/api/class/join', { body: { token } });
      classToken.clear(); setDone({ name: r.name, id: r.classId });
      await qc.invalidateQueries({ queryKey: ['classes'] });
    } catch (e) { setErr((e as ApiError).code || 'not_found'); }
    finally { setBusy(false); }
  };
  const errKey = (code: string) => ('class_err_' + code) as Key;
  if (done) return (
    <div className="auth join-done" data-testid="class-join-done">
      <div className="auth-stars" aria-hidden />
      <div className="auth-card pop-in">
        <div className="empty-emoji">🏫</div>
        <h1 className="auth-title sm">{t('class_join_done', { name: done.name })}</h1>
        <button className="btn start big wide" data-testid="class-join-go" onClick={() => nav('/classes/' + done.id, { replace: true })}>{t('class_join_go')} →</button>
      </div>
    </div>);
  const invalid = !token || pv.data?.valid === false || pv.isError;
  const name = pv.data?.className || '…';
  return (
    <div className="auth join">
      <div className="auth-stars" aria-hidden />
      <div className="auth-card pop-in" data-testid="class-join">
        <Logo size={72} className="auth-logo" />
        {invalid ? <>
          <h1 className="auth-title sm">{APP_NAME}</h1>
          <p className="err" role="alert" data-testid="class-join-error">{t(errKey(pv.data?.reason || err || 'not_found'))}</p>
        </> : <>
          {pv.data?.cover && <img className="class-join-cover" src={pv.data.cover} alt="" />}
          <h1 className="auth-title sm" data-testid="class-join-title">{t('class_join_title', { name })}</h1>
          {pv.data?.motto && <p className="chip">{pv.data.motto}</p>}
          <p className="auth-claim">{t('class_join_sub', { inviter: pv.data?.inviterName || '' })}</p>
          {err && <p className="err" role="alert" data-testid="class-join-error">{t(errKey(err))}</p>}
          {user
            ? <button className="btn start big wide" data-testid="class-join-accept" disabled={busy || !pv.data?.valid} onClick={accept}>🏫 {t('class_join_accept')}</button>
            : <><p className="muted small center">{t('class_join_signin')}</p><GoogleButton href={googleHref} label={t('continue_google')} onClick={signInViaInvite} />{cfg.data?.auth.signupCode && <p className="muted small center">🔑 {t('code_invite_free')}</p>}</>}
        </>}
      </div>
    </div>
  );
}
