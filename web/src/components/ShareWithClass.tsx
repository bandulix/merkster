/* From a test: one tap copies the cards into the class, so classmates don't scan again. */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api';
import type { ClassSummary } from '../lib/classes';
import { store } from '../lib/store';
import { runSync } from '../lib/sync';
import { toast } from '../lib/util';
import { Modal } from './ui';
import { t, type Key } from '../i18n';

export function ShareWithClass({ testId, cards }: { testId: string; cards: number }) {
  const q = useQuery({ queryKey: ['classes'], queryFn: () => api<{ classes: ClassSummary[] }>('/api/classes').then(r => r.classes), enabled: !!store.userId });
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false);
  if (!cards) return null;
  const classes = q.data || [];
  const share = async (classId: string, name: string) => {
    setBusy(true);
    try {
      await runSync();
      await api('/api/classes/' + classId + '/shares', { body: { testId } });
      toast(t('class_shared', { name }), 'ok');
      setOpen(false);
    } catch (e) { toast(t(('class_err_' + ((e as ApiError).code || 'not_found')) as Key), 'bad'); }
    finally { setBusy(false); }
  };
  if (q.isLoading) return null;
  if (!classes.length) return <Link to="/classes" className="btn ghost" data-testid="share-class">🏫 {t('class_share')}</Link>;
  return <>
    <button className="btn ghost" data-testid="share-class" disabled={busy} onClick={() => classes.length === 1 ? void share(classes[0].id, classes[0].name) : setOpen(true)}>🏫 {t('class_share')}</button>
    {open && <Modal onClose={() => setOpen(false)} label={t('class_pick')}>
      <h2>{t('class_pick')}</h2>
      <div className="stack">{classes.map(c => <button key={c.id} className="btn ghost wide" data-testid={'class-pick-' + c.id} disabled={busy} onClick={() => void share(c.id, c.name)}>{c.name}</button>)}</div>
    </Modal>}
  </>;
}
