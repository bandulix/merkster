/* The reward cannot start until a parent joins. One sentence, one tap, and it leaves once they have. */
import { Link } from 'react-router-dom';
import { store } from '../lib/store';
import { useInvites, useSupporters } from '../lib/supporters';
import { t } from '../i18n';

export function ParentInvite() {
  const sup = useSupporters();
  const inv = useInvites();
  if (!store.userId || sup.isLoading || inv.isLoading || sup.isError) return null;
  if ((sup.data || []).length) return null;
  const waiting = (inv.data || []).some(i => i.status === 'open');
  if (waiting) return (
    <Link to="/supporters" className="parent-nudge sent" data-testid="parent-invite-sent">
      <span className="pn-ic" aria-hidden>🎁</span>
      <span className="grow"><b>{t('parent_invite_sent')}</b></span>
    </Link>
  );
  return (
    <Link to="/supporters?invite=mum" className="parent-nudge" data-testid="parent-invite">
      <span className="pn-ic" aria-hidden>🎁</span>
      <span className="grow"><b>{t('parent_invite_title')}</b><small>{t('parent_invite_text')}</small></span>
      <span className="btn primary sm">{t('parent_invite_cta')}</span>
    </Link>
  );
}
