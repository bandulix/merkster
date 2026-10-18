import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { User } from '../../../shared/types';
import type { Rank } from '../../../shared/gamification';
import { rememberUser, type MeState } from '../hooks';
import { api, ApiError } from '../lib/api';
import { squareJpeg } from '../lib/avatar';
import { toast } from '../lib/util';
import { t } from '../i18n';
import { Avatar } from './ui';

/** Choose, replace, or remove the signed-in user's picture. Shown on Settings and Me. */
export function AvatarEdit({ user, rank, size }: { user: User; rank: Rank; size: number }) {
  const qc = useQueryClient();
  const file = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const apply = (next: User) => {
    const merged = { ...user, ...next };
    qc.setQueryData<MeState>(['me'], { user: merged, offline: false });
    rememberUser(merged);
  };
  const choose = async (f: File | undefined) => {
    if (!f) return;
    setBusy(true);
    try {
      const blob = await squareJpeg(f);
      const form = new FormData();
      form.append('image', blob, 'avatar.jpg');
      apply((await api<{ user: User }>('/api/me/avatar', { form })).user);
      toast(t('avatar_saved'), 'ok');
    } catch (e) {
      toast(e instanceof ApiError && e.status === 0 ? t('err_network') : t('avatar_bad'), 'bad');
    } finally { setBusy(false); if (file.current) file.current.value = ''; }
  };
  const remove = async () => {
    if (!user.avatar || !confirm(t('avatar_remove_confirm'))) return;
    setBusy(true);
    try {
      apply((await api<{ user: User }>('/api/me/avatar', { method: 'DELETE' })).user);
      toast(t('avatar_removed'), 'ok');
    } catch { toast(t('err_network'), 'bad'); }
    finally { setBusy(false); }
  };
  return (
    <div className="avatar-edit">
      <button type="button" className="avatar-hit" data-testid="avatar-change" aria-label={t('avatar_change')} disabled={busy} onClick={() => file.current?.click()}>
        <Avatar user={user} rank={rank} size={size} />
        <span className="avatar-cam" aria-hidden>📷</span>
      </button>
      <input ref={file} type="file" accept="image/jpeg,image/png,image/webp" hidden data-testid="avatar-file" onChange={e => void choose(e.target.files?.[0])} />
      {user.avatar && <button type="button" className="btn link sm avatar-remove" data-testid="avatar-remove" disabled={busy} onClick={() => void remove()}>{t('avatar_remove')}</button>}
    </div>
  );
}
