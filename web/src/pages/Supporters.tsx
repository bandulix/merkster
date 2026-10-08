/* Student: "My supporters" – invite (link / share / QR), see who cheers, control what each supporter sees, remove. */
import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { APP_NAME } from '../../../shared/brand';
import { INVITE_DAYS_DEFAULT, RELATIONS, type CreatedInvite, type Relation, type Supporter } from '../../../shared/supporters';
import { api } from '../lib/api';
import { relName, useInvites, useSeeEachOther, useSupporters, whoName } from '../lib/supporters';
import { toast } from '../lib/util';
import { useMe } from '../hooks';
import { Modal, TopBar } from '../components/ui';
import { MiniAvatar } from '../components/Cheers';
import { t, uiLang } from '../i18n';

const REL_ICON: Record<Relation, string> = { mum: '👩', dad: '👨', grandma: '👵', grandpa: '👴', aunt: '🧑‍🦰', uncle: '🧔', coach: '🏅', other: '🙂' };

function InviteModal({ onClose }: { onClose: () => void }) {
  const me = useMe(), qc = useQueryClient();
  const [rel, setRel] = useState<Relation>('grandma'), [label, setLabel] = useState(''), [uses, setUses] = useState(1);
  const [inv, setInv] = useState<CreatedInvite | null>(null), [qr, setQr] = useState<string | null>(null), [busy, setBusy] = useState(false);
  useEffect(() => { if (!inv) return; import('qrcode').then(Q => Q.toDataURL(inv.url, { margin: 1, width: 360, color: { dark: '#0d0f1e', light: '#ffffff' }, errorCorrectionLevel: 'M' })).then(setQr).catch(() => setQr(null)); }, [inv]);
  const create = async () => {
    setBusy(true);
    try { const r = await api<{ invite: CreatedInvite }>('/api/invites', { body: { relation: rel, label, maxUses: uses, days: INVITE_DAYS_DEFAULT } }); setInv(r.invite); qc.invalidateQueries({ queryKey: ['invites'] }); }
    catch { toast(t('err_unknown'), 'bad'); } finally { setBusy(false); }
  };
  const first = me.data?.user?.name?.split(/\s+/)[0] || '';
  const text = t('invite_share_text', { name: first, app: APP_NAME });
  const share = async () => {
    if (!inv) return;
    if (navigator.share) { try { await navigator.share({ title: APP_NAME, text, url: inv.url }); return; } catch (e) { if ((e as Error).name === 'AbortError') return; } }
    window.open('https://wa.me/?text=' + encodeURIComponent(text + ' ' + inv.url), '_blank', 'noopener');
  };
  const copy = async () => { if (!inv) return; try { await navigator.clipboard.writeText(inv.url); toast(t('copied'), 'ok'); } catch { (document.querySelector('[data-testid="invite-url"]') as HTMLInputElement | null)?.select(); } };
  return (
    <Modal onClose={onClose} label={t('invite_supporter')}>
      {!inv ? <>
        <h2>📣 {t('invite_supporter')}</h2>
        <h3 className="q2">{t('invite_who')}</h3>
        <div className="rel-grid">{RELATIONS.map(r => <button key={r} className={'rel' + (rel === r ? ' on' : '')} data-testid={'rel-' + r} onClick={() => setRel(r)}><span>{REL_ICON[r]}</span>{relName(r)}</button>)}</div>
        <label className="field"><span>{t('invite_label')}</span><input data-testid="inv-label" value={label} maxLength={40} placeholder={t('invite_label_ph')} onChange={e => setLabel(e.target.value)} /></label>
        <div className="field"><span>{t('invite_uses')}</span><div className="seg">{[1, 2, 5].map(n => <button key={n} className={'pill sm' + (uses === n ? ' on' : '')} data-testid={'inv-uses-' + n} onClick={() => setUses(n)}>{n === 1 ? t('uses_1') : t('uses_n', { n })}</button>)}</div></div>
        <p className="muted small">⏳ {t('invite_valid', { n: INVITE_DAYS_DEFAULT })}</p>
        <button className="btn primary big wide" data-testid="inv-create" disabled={busy} onClick={create}>🔗 {t('invite_create')}</button>
      </> : <>
        <h2>🔗 {t('invite_ready')}</h2>
        <p className="muted small">{REL_ICON[inv.relation]} {inv.label || relName(inv.relation)} · {t('invite_valid', { n: INVITE_DAYS_DEFAULT })}</p>
        <div className="row-in"><input readOnly value={inv.url} data-testid="invite-url" onFocus={e => e.target.select()} /><button className="btn ghost" data-testid="invite-copy" onClick={copy}>{t('invite_copy')}</button></div>
        <button className="btn primary big wide" data-testid="invite-share" onClick={share}>📤 {t('invite_share')}</button>
        {qr && <div className="qr-box"><img src={qr} alt="QR" width={180} height={180} data-testid="invite-qr" /><small className="muted">{t('invite_qr')}</small></div>}
        <p className="muted small">🔒 {t('invite_once_hint')}</p>
      </>}
    </Modal>
  );
}

function SupporterRow({ s }: { s: Supporter }) {
  const qc = useQueryClient();
  // local state so the checkbox flips immediately (query-cache notifications are batched to the next tick)
  const [v, setV] = useState({ showResults: s.showResults, showPractice: s.showPractice, showPhotos: !!s.showPhotos });
  useEffect(() => setV({ showResults: s.showResults, showPractice: s.showPractice, showPhotos: !!s.showPhotos }), [s.showResults, s.showPractice, s.showPhotos]);
  const patch = async (b: Partial<Pick<Supporter, 'showResults' | 'showPractice' | 'showPhotos'>>) => {
    setV(x => ({ ...x, ...b }));
    qc.setQueryData<Supporter[]>(['supporters'], old => old?.map(x => x.id === s.id ? { ...x, ...b } : x));
    try { await api('/api/supporters/' + s.id, { method: 'PATCH', body: b }); } catch { toast(t('err_unknown'), 'bad'); qc.invalidateQueries({ queryKey: ['supporters'] }); }
  };
  const remove = async () => {
    if (!confirm(t('remove_supporter_confirm', { name: whoName(s) }))) return;
    await api('/api/supporters/' + s.id, { method: 'DELETE' });
    toast(t('supporter_removed'), 'ok');
    qc.invalidateQueries({ queryKey: ['supporters'] }); qc.invalidateQueries({ queryKey: ['cheers'] });
  };
  return (
    <li className="sup-row" data-testid="sup-row" data-name={whoName(s)}>
      <div className="sup-head"><MiniAvatar src={s.avatar} name={s.name} size={40} /><span className="grow"><b>{whoName(s)}</b><small className="muted">{s.name} · {relName(s.relation)} · {t('supporter_since', { d: new Date(s.since).toLocaleDateString(uiLang()) })}</small></span>
        <button className="btn link bad sm" data-testid="sup-remove" onClick={remove}>{t('remove_supporter')}</button></div>
      <label className="toggle"><input type="checkbox" data-testid="sup-results" checked={v.showResults} onChange={e => patch({ showResults: e.target.checked })} /><span>📝 {t('sees_results')}</span></label>
      <label className="toggle"><input type="checkbox" data-testid="sup-practice" checked={v.showPractice} onChange={e => patch({ showPractice: e.target.checked })} /><span>📈 {t('sees_practice')}</span></label>
      <label className="toggle"><input type="checkbox" data-testid="sup-photos" checked={v.showPhotos} onChange={e => patch({ showPhotos: e.target.checked })} /><span>🖼 {t('sees_photos')}</span></label>
    </li>
  );
}

export function Supporters() {
  const sup = useSupporters(), inv = useInvites(), qc = useQueryClient(), vis = useSeeEachOther();
  const [seeOthers, setSeeOthers] = useState(false);
  useEffect(() => { if (vis.data !== undefined) setSeeOthers(vis.data); }, [vis.data]);
  const [open, setOpen] = useState(false);
  const revoke = async (id: string) => { await api('/api/invites/' + id, { method: 'DELETE' }); qc.invalidateQueries({ queryKey: ['invites'] }); };
  const invites = (inv.data || []).filter(i => i.status === 'open' || Date.now() - Date.parse(i.createdAt) < 7 * 864e5);
  return (
    <section className="supporters page narrow">
      <TopBar title={t('my_supporters')} back="/me" />
      <p className="muted">{t('supporters_sub')}</p>
      <button className="btn primary big wide" data-testid="invite-new" onClick={() => setOpen(true)}>📣 {t('invite_supporter')}</button>
      {sup.data && !sup.data.length && <div className="empty-hero small"><div className="empty-emoji">👵👴👩👨</div><p>{t('no_supporters')}</p></div>}
      <ul className="sup-list" data-testid="sup-list">{sup.data?.map(s => <SupporterRow key={s.id} s={s} />)}</ul>
      {sup.data && sup.data.length > 1 && <div className="card" data-testid="see-each-other-card">
        <label className="toggle"><input type="checkbox" data-testid="see-each-other" checked={seeOthers} disabled={vis.isLoading} onChange={async e => {
          const v = e.target.checked; setSeeOthers(v); qc.setQueryData(['supporters-vis'], v);
          try { await api('/api/supporters/visibility', { method: 'PUT', body: { seeEachOther: v } }); } catch { qc.invalidateQueries({ queryKey: ['supporters-vis'] }); }
        }} /><span>👀 {t('see_each_other')}</span></label>
        <p className="muted small">{t('see_each_other_sub')}</p></div>}
      {invites.length > 0 && <div className="card"><h3>{t('open_invites')}</h3>
        <ul className="inv-list">{invites.map(i => (
          <li key={i.id} className={'inv-row ' + i.status} data-testid="inv-row" data-status={i.status}>
            <span className="grow"><b>{i.label || relName(i.relation)}</b><small className="muted">{t(('inv_' + i.status) as 'inv_open')} · {t('inv_uses', { u: i.uses, m: i.maxUses })}{i.status === 'open' ? ' · ' + t('inv_until', { d: new Date(i.expiresAt).toLocaleDateString(uiLang()) }) : ''}</small></span>
            {i.status === 'open' && <button className="btn ghost sm" data-testid="inv-revoke" onClick={() => revoke(i.id)}>{t('revoke')}</button>}
          </li>))}</ul></div>}
      {open && <InviteModal onClose={() => setOpen(false)} />}
    </section>
  );
}
