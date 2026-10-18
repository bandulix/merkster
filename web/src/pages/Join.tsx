/* Invite link landing page (/join#<token>): preview → sign in with Google → accept → "You're now cheering for …" */
import { useEffect, useState, type MouseEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { APP_NAME } from '../../../shared/brand';
import type { InvitePreview } from '../../../shared/supporters';
import type { User } from '../../../shared/types';
import { api, ApiError } from '../lib/api';
import { inviteToken, relName } from '../lib/supporters';
import { confetti } from '../lib/util';
import { GoogleButton, Logo } from '../components/ui';
import { useConfig } from '../hooks';
import { MiniAvatar } from '../components/Cheers';
import { t, type Key } from '../i18n';

export function Join({ user }: { user: User | null }) {
  const [token] = useState(() => inviteToken.capture());
  const nav = useNavigate(), qc = useQueryClient(), cfg = useConfig();
  const googleHref = '/api/auth/google?next=' + encodeURIComponent('/join');
  /** with a sign-up codeword on the server, a valid invite link replaces it: get a short-lived pass, then go to Google */
  const signInViaInvite = async (e: MouseEvent<HTMLAnchorElement>) => {
    if (!token || cfg.data?.auth.signupCode === false) return;   // config not loaded yet → ask anyway (harmless without a code)
    e.preventDefault();
    try { await api('/api/auth/invite-pass', { body: { token } }); } catch { /* existing accounts don't need it; new ones get asked for the code */ }
    location.assign(googleHref);
  };
  const pv = useQuery({ queryKey: ['invite', token], queryFn: () => api<InvitePreview>('/api/invite/preview', { body: { token } }), enabled: !!token, retry: 0, staleTime: Infinity });
  const [done, setDone] = useState<{ name: string; avatar: string | null } | null>(null), [err, setErr] = useState<string | null>(null), [busy, setBusy] = useState(false);
  useEffect(() => { if (done) { confetti(); setTimeout(confetti, 600); } }, [done]);
  const accept = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await api<{ student: { name: string; avatar: string | null } }>('/api/invite/accept', { body: { token } });
      inviteToken.clear(); setDone(r.student);
      await qc.invalidateQueries({ queryKey: ['me'] }); qc.invalidateQueries({ queryKey: ['kids'] });
    } catch (e) { setErr((e as ApiError).code || 'not_found'); }
    finally { setBusy(false); }
  };
  const name = pv.data?.studentName || '…';
  const errKey = (code: string) => ('join_err_' + code) as Key;
  const shareLine = pv.data?.shareAll
    ? <p className="auth-claim" data-testid="join-sync">{pv.data.jointWith ? t('join_sync', { names: pv.data.jointWith }) : t('join_sync_new')}</p>
    : pv.data?.jointWith ? <p className="auth-claim" data-testid="join-joint">{t('join_joint', { names: pv.data.jointWith })}</p> : null;
  if (done) return (
    <div className="auth join-done" data-testid="join-done">
      <div className="auth-stars" aria-hidden />
      <div className="auth-card pop-in">
        <div className="join-avatars"><MiniAvatar src={user?.avatar || null} name={user?.name || ''} size={64} /><span className="join-heart">📣</span><MiniAvatar src={done.avatar} name={done.name} size={64} /></div>
        <h1 className="auth-title sm">{t('join_done_title', { name: done.name })}</h1>
        <p className="auth-claim">{t('join_done_sub')}</p>
        {shareLine}
        <button className="btn start big wide" data-testid="join-go" onClick={() => nav('/cheer', { replace: true })}>{t('join_go')} →</button>
      </div>
    </div>);
  const invalid = !token || pv.data?.valid === false || pv.isError;
  return (
    <div className="auth join">
      <div className="auth-stars" aria-hidden />
      <div className="auth-card pop-in" data-testid="join">
        <Logo size={72} className="auth-logo" />
        {invalid ? <>
          <h1 className="auth-title sm">{APP_NAME}</h1>
          <p className="err" role="alert" data-testid="join-error">{t(errKey(pv.data?.reason || 'not_found'))}</p>
        </> : <>
          {pv.data?.studentAvatar !== undefined && <MiniAvatar src={pv.data?.studentAvatar || null} name={name} size={72} />}
          <h1 className="auth-title sm" data-testid="join-title">{t('join_title', { name })}</h1>
          {pv.data?.relation && pv.data.relation !== 'other' && <p className="chip">{relName(pv.data.relation)}</p>}
          <p className="auth-claim">{t('join_sub', { name })}</p>
          {shareLine}
          <ul className="auth-points"><li>📈 {t('sees_practice')}</li><li>📝 {t('sees_results')}</li><li>🎁 {t('promise_reward')}</li><li>🔒 {t('join_privacy', { name })}</li></ul>
          {err && <p className="err" role="alert" data-testid="join-error">{t(errKey(err))}</p>}
          {user
            ? <button className="btn start big wide" data-testid="join-accept" disabled={busy || !pv.data?.valid} onClick={accept}>📣 {t('join_accept', { name })}</button>
            : <><p className="muted small center">{t('join_signin')}</p><GoogleButton href={googleHref} label={t('continue_google')} onClick={signInViaInvite} />{cfg.data?.auth.signupCode && <p className="muted small center" data-testid="invite-no-code">🔑 {t('code_invite_free')}</p>}</>}
        </>}
        <p className="muted small center auth-legal">{t('login_privacy')}</p>
      </div>
    </div>
  );
}
