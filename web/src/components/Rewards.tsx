/* Rewards UI for the student: "What can I earn?", per-test extras (self-reported/verified, photo, rewards),
   the reward pop. Merkster only tracks promises – no money moves through the app. */
import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { isRcKind } from '../../../shared/rewards';
import { useQueryClient } from '@tanstack/react-query';
import type { Subject, Test } from '../../../shared/types';
import { api, ApiError } from '../lib/api';
import { earnedLine, rewardText, ruleWhen, useMyRewards, type MyRewards } from '../lib/rewards';
import { runSync } from '../lib/sync';
import { store } from '../lib/store';
import { whoName } from '../lib/supporters';
import { toast } from '../lib/util';
import { t } from '../i18n';
import { MiniAvatar } from './Cheers';
import { testGrading } from './ResultDialog';
import { Modal } from './ui';

const RESULT_KINDS = ['grade', 'personal_best', 'improvement'];

/** "What can I earn?" cards. On a test page only rules that a result in this subject can trigger. */
export function EarnCards({ subject, test }: { subject?: Subject; test?: Test }) {
  const q = useMyRewards(!!store.userId);
  const sys = test ? testGrading(test) : store.data.settings.grading;
  const rules = (q.data?.rules || []).filter(r => !subject || (RESULT_KINDS.includes(r.trigger.kind) && (!('subject' in r.trigger) || !r.trigger.subject || r.trigger.subject === subject)));
  if (!rules.length) return null;
  return (
    <div className="card earn-card-wrap" data-testid="earn-cards">
      <div className="sec-head"><h3>🎁 {t('what_can_i_earn')}</h3><Link className="btn link sm" to="/rewards" data-testid="earn-more">{t('my_rewards')} →</Link></div>
      <div className="earn-grid">{rules.map(r => {
        const full = r.capPerMonth != null && r.earnedThisMonth >= r.capPerMonth;
        return (
          <div key={r.id} className={'earn-card' + (full ? ' full' : '')} data-testid="earn-card">
            <MiniAvatar src={r.supporter.avatar} name={r.supporter.name} size={34} />
            <div><b className="earn-reward">{rewardText(r.reward)}</b><span>{ruleWhen(r.trigger, sys)}</span>
              <small className="muted">{t('rw_from', { name: whoName(r.supporter) })}{r.capPerMonth != null ? ' · ' + (full ? t('rw_cap_full') : t('rw_cap_left', { n: r.capPerMonth - r.earnedThisMonth, cap: r.capPerMonth })) : ''}</small></div>
          </div>);
      })}</div>
      {rules.some(r => isRcKind(r.trigger.kind)) && <Link className="btn link sm" to="/reports/simulate" data-testid="earn-sim">🧮 {t('sim_open')} →</Link>}
      <p className="muted xsmall">🤝 {t('rewards_disclaimer')}</p>
    </div>
  );
}

/** under the result of a test: self-reported / verified, rewards earned for it, optional photo */
export function ResultExtras({ test }: { test: Test }) {
  const q = useMyRewards(!!store.userId), qc = useQueryClient();
  const file = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false), [view, setView] = useState(false), [v, setV] = useState(0);
  const data: MyRewards | undefined = q.data;
  const ver = (data?.verifications || []).filter(x => x.testId === test.id);
  const earned = (data?.earned || []).filter(e => e.testId === test.id);
  const hasPhoto = (data?.photos || []).includes(test.id);
  const upload = async (f: File) => {
    if (!store.userId) { toast(t('photo_need_login'), 'bad'); return; }
    setBusy(true);
    try {
      const dataUrl = await shrink(f);
      const put = () => api(`/api/tests/${test.id}/photo`, { method: 'PUT', body: { dataUrl } });
      try { await put(); } catch (e) { if ((e as ApiError).status === 404) { await runSync(); await put(); } else throw e; }
      toast(t('photo_saved'), 'ok'); setV(x => x + 1);
      await qc.invalidateQueries({ queryKey: ['rewards'] });
    } catch { toast(t('err_unknown'), 'bad'); } finally { setBusy(false); }
  };
  const remove = async () => { await api(`/api/tests/${test.id}/photo`, { method: 'DELETE' }).catch(() => undefined); setView(false); await qc.invalidateQueries({ queryKey: ['rewards'] }); };
  return (
    <div className="result-extras">
      <div className="chips">
        {ver.length ? ver.map(x => <span key={x.by.id} className="chip good" data-testid="verified-by"><MiniAvatar src={x.by.avatar} name={x.by.name} size={18} /> ✔ {t('verified_by', { name: x.by.name })}</span>)
          : <span className="chip xs" data-testid="self-reported">✍️ {t('self_reported')}</span>}
      </div>
      {earned.length > 0 && <div className="test-rewards">{earned.map(e => <div key={e.id} className={'test-reward ' + e.status} data-testid="test-reward" data-status={e.status}><MiniAvatar src={e.supporter.avatar} name={e.supporter.name} size={22} /><span>{earnedLine(e)}</span></div>)}</div>}
      {store.userId && <div className="row-btns photo-row">
        {hasPhoto && <button className="btn ghost sm" data-testid="photo-thumb" onClick={() => setView(true)}>🖼 {t('photo_view')}</button>}
        <button className="btn ghost sm" disabled={busy} data-testid="photo-add" onClick={() => file.current?.click()}>📷 {hasPhoto ? t('photo_change') : t('photo_add')}</button>
        <input ref={file} type="file" accept="image/*" hidden data-testid="photo-input" onChange={e => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = ''; }} />
      </div>}
      {store.userId && <p className="muted xsmall">🔒 {t('photo_hint')}</p>}
      {view && <Modal onClose={() => setView(false)} label={t('photo_view')} className="photo-modal">
        <img className="test-photo" src={`/api/tests/${test.id}/photo?v=${v}`} alt={t('photo_view')} />
        <div className="row-btns"><button className="btn link bad" onClick={remove}>{t('photo_remove')}</button><button className="btn primary" onClick={() => setView(false)}>OK</button></div>
      </Modal>}
    </div>
  );
}
/** resize in the browser: ≤ 1600 px, JPEG ~0.82 (keeps uploads small, strips EXIF incl. location) */
export async function shrink(f: File, maxSide = 1600): Promise<string> {
  const bmp = await createImageBitmap(f);
  const k = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.82);
}
