/* Classes: create one, invite classmates, share tests, and see the XP board.
   Only the student who created the class can change its name, motto and cover. */
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { DraftRow } from '../../../shared/types';
import { api, ApiError } from '../lib/api';
import type { ClassBoss, ClassClash, ClassDetail, ClassShare, ClassSummary, SharedCards } from '../lib/classes';
import { store } from '../lib/store';
import * as S from '../lib/schedule';
import { now, toast } from '../lib/util';
import { Face, TopBar } from '../components/ui';
import { t, testIcon, type Key } from '../i18n';

const errText = (e: unknown) => {
  const code = (e as ApiError).code || 'not_found';
  const keys = ['boss_err_' + code, 'clash_err_' + code, 'class_err_' + code] as Key[];
  for (const k of keys) {
    const s = t(k);
    if (s !== k) return s;
  }
  return t('class_err_not_found');
};

export function Classes() {
  const q = useQuery({ queryKey: ['classes'], queryFn: () => api<{ classes: ClassSummary[] }>('/api/classes').then(r => r.classes), enabled: !!store.userId });
  const nav = useNavigate();
  const [name, setName] = useState(''), [motto, setMotto] = useState(''), [busy, setBusy] = useState(false);
  const create = async () => {
    setBusy(true);
    try {
      const r = await api<{ class: ClassSummary }>('/api/classes', { body: { name, motto } });
      await q.refetch();
      nav('/classes/' + r.class.id);
    } catch (e) { toast(errText(e), 'bad'); }
    finally { setBusy(false); }
  };
  const list = q.data || [];
  return (
    <section className="page narrow classes">
      <TopBar title={'🏫 ' + t('classes_title')} back="/me" />
      {!list.length && <div className="empty-hero"><div className="empty-emoji">🏫</div><p>{t('class_none')}</p></div>}
      <div className="card class-form">
        <label className="field"><span>{t('class_name')}</span><input data-testid="class-name" value={name} maxLength={40} placeholder={t('class_name_ph')} onChange={e => setName(e.target.value)} /></label>
        <label className="field"><span>{t('class_motto')}</span><input data-testid="class-motto" value={motto} maxLength={80} placeholder={t('class_motto_ph')} onChange={e => setMotto(e.target.value)} /></label>
        <button className="btn primary big wide" data-testid="class-create" disabled={busy || !name.trim()} onClick={create}>{t('class_create')}</button>
      </div>
      <ul className="class-list">{list.map(c => (
        <li key={c.id}><Link to={'/classes/' + c.id} className="card class-link" data-testid="class-card">
          {c.cover ? <img src={c.cover} alt="" /> : <span className="class-ph" aria-hidden>🏫</span>}
          <span className="grow"><b>{c.name}</b><small className="muted">{c.motto || t('class_members_n', { n: c.members })}</small></span>
        </Link></li>
      ))}</ul>
    </section>
  );
}

export function ClassPage() {
  const { id = '' } = useParams();
  const nav = useNavigate(), qc = useQueryClient();
  const q = useQuery({ queryKey: ['class', id], queryFn: () => api<ClassDetail>('/api/classes/' + id), enabled: !!id && !!store.userId });
  const bossQ = useQuery({
    queryKey: ['class-boss', id],
    queryFn: () => api<{ boss: ClassBoss | null }>('/api/classes/' + id + '/boss').then(r => r.boss),
    enabled: !!id && !!store.userId,
    refetchInterval: (query) => (query.state.data?.status === 'open' ? 4000 : false)
  });
  const clashQ = useQuery({
    queryKey: ['class-clashes', id],
    queryFn: () => api<{ clashes: ClassClash[] }>('/api/classes/' + id + '/clashes').then(r => r.clashes),
    enabled: !!id && !!store.userId,
    refetchInterval: 8000
  });
  const d = q.data;
  const [name, setName] = useState(''), [motto, setMotto] = useState(''), [url, setUrl] = useState(''), [busy, setBusy] = useState(false);
  const [bossShare, setBossShare] = useState(''), [clashShare, setClashShare] = useState(''), [clashOpp, setClashOpp] = useState('');
  const file = useRef<HTMLInputElement>(null);
  useEffect(() => { if (d) { setName(d.class.name); setMotto(d.class.motto); if (!bossShare && d.shares[0]) setBossShare(d.shares[0].id); if (!clashShare && d.shares[0]) setClashShare(d.shares[0].id); if (!clashOpp) { const o = d.board.find(b => !b.me); if (o) setClashOpp(o.id); } } }, [d?.class.name, d?.class.motto, d?.shares, d?.board]); // eslint-disable-line react-hooks/exhaustive-deps
  if (q.isError) return <section className="page narrow"><TopBar title={t('classes_title')} back="/classes" /><p className="err">{errText(q.error)}</p></section>;
  if (!d) return <section className="page narrow"><TopBar title={t('classes_title')} back="/classes" /><p className="muted">{t('loading')}</p></section>;
  const boss = bossQ.data;
  const clashes = clashQ.data || [];
  const startBoss = async () => {
    if (!bossShare) return;
    setBusy(true);
    try {
      await api('/api/classes/' + id + '/boss', { body: { shareId: bossShare } });
      await bossQ.refetch();
      toast(t('boss_start'), 'ok');
    } catch (e) { toast(errText(e), 'bad'); }
    finally { setBusy(false); }
  };
  const cancelBoss = async () => {
    if (!boss || boss.status !== 'open') return;
    setBusy(true);
    try { await api('/api/classes/' + id + '/boss/' + boss.id + '/cancel', { body: {} }); await bossQ.refetch(); }
    catch (e) { toast(errText(e), 'bad'); }
    finally { setBusy(false); }
  };
  const startClash = async () => {
    if (!clashShare || !clashOpp) return;
    setBusy(true);
    try {
      const r = await api<{ clash: ClassClash }>('/api/classes/' + id + '/clashes', { body: { shareId: clashShare, opponentId: clashOpp } });
      await clashQ.refetch();
      nav('/classes/' + id + '/clash/' + r.clash.id);
    } catch (e) { toast(errText(e), 'bad'); }
    finally { setBusy(false); }
  };
  const acceptClash = async (clashId: string) => {
    setBusy(true);
    try { await api('/api/classes/' + id + '/clashes/' + clashId + '/accept', { body: {} }); nav('/classes/' + id + '/clash/' + clashId); }
    catch (e) { toast(errText(e), 'bad'); }
    finally { setBusy(false); }
  };
  const declineClash = async (clashId: string) => {
    try { await api('/api/classes/' + id + '/clashes/' + clashId + '/decline', { body: {} }); await clashQ.refetch(); }
    catch (e) { toast(errText(e), 'bad'); }
  };
  const save = async () => {
    setBusy(true);
    try { await api('/api/classes/' + id, { method: 'PATCH', body: { name, motto } }); await q.refetch(); toast(t('class_save'), 'ok'); }
    catch (e) { toast(errText(e), 'bad'); }
    finally { setBusy(false); }
  };
  const cover = async (f?: File) => {
    if (!f) { await api('/api/classes/' + id + '/cover', { method: 'DELETE' }); await q.refetch(); return; }
    const fd = new FormData(); fd.append('cover', f);
    try { await api('/api/classes/' + id + '/cover', { form: fd }); await q.refetch(); }
    catch (e) { toast(errText(e), 'bad'); }
  };
  const invite = async () => {
    setBusy(true);
    try { const r = await api<{ invite: { url: string } }>('/api/classes/' + id + '/invites', { body: {} }); setUrl(r.invite.url); }
    catch (e) { toast(errText(e), 'bad'); }
    finally { setBusy(false); }
  };
  const copy = async () => { try { await navigator.clipboard.writeText(url); toast(t('copied'), 'ok'); } catch { (document.querySelector('[data-testid="class-invite-url"]') as HTMLInputElement | null)?.select(); } };
  const revoke = async (inviteId: string) => { await api('/api/classes/' + id + '/invites/' + inviteId, { method: 'DELETE' }); await q.refetch(); };
  const take = async (s: ClassShare) => {
    setBusy(true);
    try {
      const full = await api<SharedCards>('/api/classes/' + id + '/shares/' + s.id);
      const local = full.takenTestId ? store.test(full.takenTestId) : undefined;
      const rows: DraftRow[] = full.cards.map(c => ({ type: c.type, a: c.term, b: c.meaning, example: c.example, distractors: c.distractors }));
      if (local) {
        if (full.newer) store.addItems(local, rows);
        await api('/api/classes/' + id + '/shares/' + s.id + '/take', { body: { testId: local.id } });
        nav('/test/' + local.id);
      } else {
        const today = S.dayISO(now());
        const test = store.createTest({ name: full.name, subject: full.subject, foreign: full.foreign, native: full.native, testDate: full.testDate >= today ? full.testDate : S.addDays(today, 7), format: full.format, articles: full.articles });
        store.addItems(test, rows);
        await api('/api/classes/' + id + '/shares/' + s.id + '/take', { body: { testId: test.id } });
        nav('/test/' + test.id + '?fresh=1');
      }
      qc.invalidateQueries({ queryKey: ['class', id] });
    } catch (e) { toast(errText(e), 'bad'); }
    finally { setBusy(false); }
  };
  const removeShare = async (shareId: string) => { await api('/api/classes/' + id + '/shares/' + shareId, { method: 'DELETE' }); await q.refetch(); };
  const leave = async () => {
    if (!confirm(t(d.class.owner ? 'class_delete_confirm' : 'class_leave_confirm', { name: d.class.name }))) return;
    await api('/api/classes/' + id + (d.class.owner ? '' : '/leave'), { method: d.class.owner ? 'DELETE' : 'POST' });
    qc.invalidateQueries({ queryKey: ['classes'] });
    nav('/classes', { replace: true });
  };
  return (
    <section className="page narrow class-page" data-testid="class-page">
      <TopBar title={d.class.name} back="/classes" />
      <div className="class-hero">
        {d.class.cover ? <img className="class-cover" src={d.class.cover} alt="" data-testid="class-cover" /> : <div className="class-cover empty" data-testid="class-cover-empty" aria-hidden>🏫</div>}
        {d.class.owner ? <>
          <p className="muted small">{t('class_owner_hint')}</p>
          <label className="field"><span>{t('class_name')}</span><input data-testid="class-edit-name" value={name} maxLength={40} onChange={e => setName(e.target.value)} /></label>
          <label className="field"><span>{t('class_motto')}</span><input data-testid="class-edit-motto" value={motto} maxLength={80} onChange={e => setMotto(e.target.value)} /></label>
          <div className="row-btns wrap">
            <button className="btn primary" data-testid="class-save" disabled={busy || !name.trim()} onClick={save}>{t('class_save')}</button>
            <button className="btn ghost" data-testid="class-cover-btn" onClick={() => file.current?.click()}>{t('class_cover_change')}</button>
            {d.class.cover && <button className="btn ghost" data-testid="class-cover-remove" onClick={() => void cover()}>{t('class_cover_remove')}</button>}
            <input ref={file} type="file" accept="image/jpeg,image/png,image/webp" hidden data-testid="class-cover-input" onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void cover(f); }} />
          </div>
        </> : <>
          {d.class.motto && <p className="class-motto" data-testid="class-motto-text">{d.class.motto}</p>}
        </>}
      </div>
      <button className="btn primary big wide" data-testid="class-invite" disabled={busy} onClick={invite}>📣 {t('class_invite')}</button>
      {url && <div className="card">
        <h3>{t('class_invite_ready')}</h3>
        <p className="muted small">{t('class_invite_hint')}</p>
        <div className="row-in"><input readOnly value={url} data-testid="class-invite-url" onFocus={e => e.target.select()} /><button className="btn ghost" data-testid="class-invite-copy" onClick={copy}>{t('invite_copy')}</button></div>
      </div>}
      {d.invites.length > 0 && <div className="card"><h3>{t('class_open_invites')}</h3>
        <ul className="inv-list">{d.invites.map(i => (
          <li key={i.id} className="inv-row" data-testid="class-inv-row">
            <span className="grow"><small className="muted">{t('class_uses', { u: i.uses, m: i.maxUses })}</small></span>
            {(i.mine || d.class.owner) && <button className="btn ghost sm" data-testid="class-revoke" onClick={() => void revoke(i.id)}>{t('class_revoke')}</button>}
          </li>))}</ul></div>}
      <div className="card boss-card" data-testid="class-boss">
        <h3>🐉 {t('boss_title')}</h3>
        <p className="muted small">{t('boss_sub')}</p>
        {boss && (boss.status === 'open' || boss.status === 'won') ? (
          <>
            <div className="boss-name"><b>{boss.shareName}</b></div>
            <div className="boss-bar" role="progressbar" aria-valuenow={boss.hp} aria-valuemax={boss.maxHp} data-testid="boss-hp-bar">
              <i style={{ width: Math.max(0, Math.min(100, (boss.hp / boss.maxHp) * 100)) + '%' }} />
            </div>
            <p className="boss-hp" data-testid="boss-hp">{boss.status === 'won' ? t('boss_won') : t('boss_hp', { hp: boss.hp, max: boss.maxHp })}</p>
            {boss.status === 'open' && (
              boss.myTestId
                ? <button className="btn primary wide" data-testid="boss-practise" onClick={() => nav('/test/' + boss.myTestId)}>{t('boss_practise')}</button>
                : <button className="btn ghost wide" data-testid="boss-take-first" disabled={busy} onClick={() => { const s = d.shares.find(x => x.id === boss.shareId); if (s) void take(s); }}>{t('boss_take_first')}</button>
            )}
            {boss.status === 'open' && (boss.createdBy === store.userId || d.class.owner) && (
              <button className="btn link bad sm" data-testid="boss-cancel" disabled={busy} onClick={() => void cancelBoss()}>{t('boss_cancel')}</button>
            )}
            {boss.contributors.length > 0 && (
              <ul className="boss-contrib" data-testid="boss-contrib">
                <li className="muted small">{t('boss_contrib')}</li>
                {boss.contributors.slice(0, 8).map(c => (
                  <li key={c.id}><Face src={c.avatar} name={c.name} size={28} /><span className="grow">{c.me ? t('class_you') : c.name}</span><b>−{c.damage}</b></li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <>
            <p className="muted small">{t('boss_none')}</p>
            {d.shares.length > 0 && (
              <label className="field"><span>{t('boss_pick')}</span>
                <select data-testid="boss-share" value={bossShare} onChange={e => setBossShare(e.target.value)}>
                  {d.shares.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </label>
            )}
            <button className="btn primary wide" data-testid="boss-start" disabled={busy || !bossShare} onClick={() => void startBoss()}>{t('boss_start')}</button>
          </>
        )}
      </div>
      <div className="card clash-card" data-testid="class-clash">
        <h3>⚔️ {t('clash_title')}</h3>
        <p className="muted small">{t('clash_sub')}</p>
        {d.shares.length > 0 && d.board.some(b => !b.me) && (
          <div className="clash-form">
            <label className="field"><span>{t('clash_pick_share')}</span>
              <select data-testid="clash-share" value={clashShare} onChange={e => setClashShare(e.target.value)}>
                {d.shares.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
            <label className="field"><span>{t('clash_pick_opp')}</span>
              <select data-testid="clash-opp" value={clashOpp} onChange={e => setClashOpp(e.target.value)}>
                {d.board.filter(b => !b.me).map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </label>
            <button className="btn primary wide" data-testid="clash-start" disabled={busy || !clashShare || !clashOpp} onClick={() => void startClash()}>{t('clash_start')}</button>
          </div>
        )}
        {!clashes.length && <p className="muted small">{t('clash_empty')}</p>}
        <ul className="clash-list">{clashes.slice(0, 8).map(cl => {
          const other = cl.me === 'challenger' ? cl.opponent : cl.challenger;
          return (
            <li key={cl.id} className="clash-row" data-testid="clash-row" data-status={cl.status}>
              <span className="grow">
                <b>{t('clash_vs', { a: cl.challenger.name, b: cl.opponent.name })}</b>
                <small className="muted">{cl.shareName} · {cl.status === 'pending' && cl.me === 'challenger' ? t('clash_pending', { name: other.name }) : cl.status}</small>
              </span>
              {cl.status === 'pending' && cl.me === 'opponent' && (
                <>
                  <button className="btn primary sm" data-testid="clash-accept" disabled={busy} onClick={() => void acceptClash(cl.id)}>{t('clash_accept')}</button>
                  <button className="btn ghost sm" data-testid="clash-decline" onClick={() => void declineClash(cl.id)}>{t('clash_decline')}</button>
                </>
              )}
              {(cl.status === 'active' || cl.status === 'done' || (cl.status === 'pending' && cl.me === 'challenger')) && (
                <button className="btn ghost sm" data-testid="clash-open" onClick={() => nav('/classes/' + id + '/clash/' + cl.id)}>{cl.status === 'done' ? t('clash_score', { n: cl.myPlay?.correct ?? 0, total: cl.cards }) : t('clash_play')}</button>
              )}
            </li>
          );
        })}</ul>
      </div>
      <div className="card">
        <h3>{t('class_board')}</h3>
        <p className="muted small">{t('class_board_sub')}</p>
        <ol className="board" data-testid="class-board">{d.board.map((m, i) => (
          <li key={m.id} className={m.me ? 'me' : ''} data-testid="board-row" data-me={m.me ? '1' : '0'} data-xp={m.xp}>
            <b className="pos">{i + 1}</b>
            <Face src={m.avatar} name={m.name} size={36} />
            <span className="grow"><b>{m.me ? t('class_you') : m.name}</b>{m.owner && <small className="muted">{t('class_owner')}</small>}</span>
            <span data-testid="board-xp">{t('class_xp', { n: m.xp })}</span>
          </li>))}</ol>
      </div>
      <h3 className="sec-title">{t('class_shares')}</h3>
      {!d.shares.length && <p className="muted">{t('class_share_empty')}</p>}
      <ul className="class-shares">{d.shares.map(s => (
        <li key={s.id} className="card share-row" data-testid="class-share" data-name={s.name}>
          <span className="tc-icon">{testIcon(s)}</span>
          <span className="grow"><b>{s.name}</b><small className="muted">{t('class_cards_n', { n: s.cards })} · {t('class_by', { name: s.author.name })}</small></span>
          {s.mine && !s.takenTestId
            ? <span className="chip" data-testid="class-shared-mine">{t('class_mine')}</span>
            : <button className="btn primary sm" data-testid={s.takenTestId && !s.newer ? 'class-taken' : s.newer ? 'class-newer' : 'class-take'} disabled={busy} onClick={() => void take(s)}>
              {s.takenTestId && !s.newer ? t('class_taken') : s.newer ? t('class_newer') : t('class_take')}
            </button>}
          {(s.mine || d.class.owner) && <button className="btn link bad sm" data-testid="class-unshare" onClick={() => void removeShare(s.id)}>{t('revoke')}</button>}
        </li>))}</ul>
      <button className="btn link bad" data-testid="class-leave" onClick={leave}>{d.class.owner ? t('class_delete') : t('class_leave')}</button>
    </section>
  );
}
