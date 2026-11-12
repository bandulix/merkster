import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { GradeSystem, User } from '../../../shared/types';
import { GRADE_SYSTEMS } from '../../../shared/types';
import { APP_NAME, APP_VERSION } from '../../../shared/brand';
import { useConfig, useStore, rememberUser } from '../hooks';
import { api } from '../lib/api';
import { store } from '../lib/store';
import { stopSync, resetSyncState, runSync } from '../lib/sync';
import { warmOfflineCache } from '../lib/ocr';
import { download, toast } from '../lib/util';
import { AvatarEdit } from '../components/AvatarEdit';
import { fanfare } from '../components/Celebrate';
import { t, tp } from '../i18n';
import { scoreOf } from '../../../shared/grades';
import { saveGradePrivacy } from '../lib/planSync';
import type { GradePrivacy } from '../../../shared/gradebook';
import { uiLang } from '../i18n';
import { leadDays } from '../../../shared/mockexam';

type AdminUser = { id: string; name: string; email: string | null; isAdmin: boolean; lastLoginAt: string | null; tests: number; ai30d: number };

export function Settings({ user, offline }: { user: User; offline: boolean }) {
  const d = useStore(), s = d.settings, cfg = useConfig(), qc = useQueryClient(), nav = useNavigate();
  const file = useRef<HTMLInputElement>(null);
  const [confirmDel, setConfirmDel] = useState('');
  const logout = async () => {
    if (!confirm(t('logout_confirm'))) return;
    await runSync().catch(() => undefined);
    await api('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
    stopSync(); store.close(); rememberUser(null); qc.setQueryData(['me'], { user: null, offline: false }); nav('/login', { replace: true });
  };
  const deleteAccount = async () => {
    try { await api('/api/me', { method: 'DELETE' }); } catch { toast(t('err_network'), 'bad'); return; }
    stopSync(); await store.wipeLocal(); rememberUser(null); qc.setQueryData(['me'], { user: null, offline: false }); nav('/login', { replace: true });
    toast(t('account_deleted'), 'ok');
  };
  const ping = useMutation({ mutationFn: () => api<{ ok: boolean; ms?: number }>('/api/admin/ai-ping', { method: 'POST' }), onSuccess: r => toast(r.ok ? t('s_ai_ping_ok') : t('s_ai_ping_fail'), r.ok ? 'ok' : 'bad'), onError: () => toast(t('s_ai_ping_fail'), 'bad') });
  const users = useQuery({ queryKey: ['admin-users'], enabled: user.isAdmin && !offline, queryFn: () => api<{ users: AdminUser[] }>('/api/admin/users') });
  const seg = <T extends string | number>(val: T, opts: [T, string][], set: (v: T) => void, tid?: string) => <div className="seg wrap" data-testid={tid}>{opts.map(([v, l]) => <button key={String(v)} className={'pill sm' + (val === v ? ' on' : '')} onClick={() => set(v)}>{l}</button>)}</div>;
  return (
    <section className="settings page narrow">
      <h1 className="page-title">{t('tab_settings')}</h1>
      <div className="card account">
        <AvatarEdit user={user} rank={store.progress().rank} size={56} />
        <div><b data-testid="account-name">{user.name || '—'}</b>{user.isAdmin && <span className="chip warm">{t('admin_badge')}</span>}<p className="muted small">{user.email}</p><p className="muted small">{t('signed_in_google')}</p></div>
        <button className="btn ghost sm" data-testid="logout" onClick={logout}>{t('logout')}</button>
      </div>

      <div className="card"><h3>{t('s_general')}</h3>
        <div className="set-row"><span>{t('s_lang')}</span>{seg(s.uiLang, [['en', 'English'], ['de', 'Deutsch']], v => store.setSettings({ uiLang: v }))}</div>
        <div className="set-row"><span>{t('s_theme')}</span>{seg(s.theme, [['auto', t('th_auto')], ['light', t('th_light')], ['dark', t('th_dark')]], v => store.setSettings({ theme: v }))}</div>
        <div className="set-row"><span>{t('s_length')}</span>{seg(s.sessionSize, [[8, t('len_s')], [15, t('len_m')], [25, t('len_l')]], v => store.setSettings({ sessionSize: v }))}</div>
        <div className="set-row"><span>{t('s_grading')}</span><select className="select" data-testid="grading" value={s.grading} onChange={e => store.setSettings({ grading: e.target.value as GradeSystem })}>{GRADE_SYSTEMS.map(g => <option key={g} value={g}>{t(('gs_' + g) as 'gs_de_grade')}</option>)}</select></div>
        <div className="set-row"><span>📜 {t('term_start1')}</span><select className="select" data-testid="term-start1" value={(s.termStarts || [8, 2])[0]} onChange={e => store.setSettings({ termStarts: [Number(e.target.value), (s.termStarts || [8, 2])[1]] })}>{Array.from({ length: 12 }, (_, m) => <option key={m} value={m + 1}>{new Date(2024, m, 1).toLocaleDateString(uiLang(), { month: 'long' })}</option>)}</select></div>
        <div className="set-row"><span>{t('term_start2')}</span><select className="select" data-testid="term-start2" value={(s.termStarts || [8, 2])[1]} onChange={e => store.setSettings({ termStarts: [(s.termStarts || [8, 2])[0], Number(e.target.value)] })}>{Array.from({ length: 12 }, (_, m) => <option key={m} value={m + 1}>{new Date(2024, m, 1).toLocaleDateString(uiLang(), { month: 'long' })}</option>)}</select></div>
        <label className="toggle"><input type="checkbox" checked={s.tts} onChange={e => store.setSettings({ tts: e.target.checked })} /><span>{t('s_tts')}</span></label>
        <label className="toggle"><input type="checkbox" checked={s.sound} onChange={e => { store.setSettings({ sound: e.target.checked }); if (e.target.checked) fanfare(false); }} /><span>{t('s_sound')}</span></label>
      </div>

      <div className="card" data-testid="merki-settings">
        <h3>Merki</h3>
        <p className="small muted">{t('merki_year')}</p>
        <div className="chips">
          <button type="button" className={'pill sm' + (s.schoolYear === 4 ? ' on' : '')} data-testid="set-year-young" onClick={() => store.setSettings({ schoolYear: 4, ageAsked: true })}>{t('merki_young')}</button>
          <button type="button" className={'pill sm' + (s.schoolYear === 6 ? ' on' : '')} data-testid="set-year-mid" onClick={() => store.setSettings({ schoolYear: 6, ageAsked: true })}>{t('merki_mid')}</button>
          <button type="button" className={'pill sm' + (s.schoolYear === 10 ? ' on' : '')} data-testid="set-year-teen" onClick={() => store.setSettings({ schoolYear: 10, ageAsked: true })}>{t('merki_teen')}</button>
        </div>
        <label className="toggle"><input type="checkbox" data-testid="merki-mute" checked={!!s.merkiMuted} onChange={e => store.setSettings({ merkiMuted: e.target.checked })} /><span>{t('merki_mute')}</span></label>
        <button type="button" className="btn ghost" data-testid="open-companions" onClick={() => nav('/companions')}>{t('comp_open')}</button>
        <div className="set-row"><span>{t('mock_lead')}</span><div className="chips">{([3, 4, 5] as const).map(n => <button key={n} type="button" data-testid={'mock-lead-' + n} className={'pill sm' + (leadDays(s.mockLead) === n ? ' on' : '')} onClick={() => store.setSettings({ mockLead: n })}>{t('mock_days', { n })}</button>)}</div></div>
        <p className="small muted">{t('merki_mute_sub')}</p>
      </div>

      <div className="card" data-testid="grade-privacy">
        <h3>{t('privacy_title')}</h3>
        <p className="small muted">{t('privacy_sub')}</p>
        <div className="chips">{(['summary', 'grades', 'hide'] as GradePrivacy[]).map(p => <button key={p} type="button" data-testid={'privacy-' + p} className={'pill sm' + ((s.gradePrivacy || 'summary') === p ? ' on' : '')} onClick={() => { store.setSettings({ gradePrivacy: p }); void saveGradePrivacy(p, s.gradeTargets || {}).catch(() => undefined); }}>{t(p === 'summary' ? 'privacy_summary' : p === 'grades' ? 'privacy_grades' : 'privacy_hide')}</button>)}</div>
        <p className="small">{t('privacy_default')}</p>
        <h3>{t('targets_title')}</h3>
        <p className="small muted">{t('targets_sub')}</p>
        <div className="chips">{['1', '2', '3', '4'].map(g => {
          const score = scoreOf({ system: 'de_grade', value: Number(g) });
          const on = Math.abs((s.gradeTargets?.biology ?? scoreOf({ system: 'de_grade', value: 3 })) - score) < 1;
          return <button key={g} type="button" data-testid={'target-' + g} className={'pill sm' + (on ? ' on' : '')} onClick={() => {
            const gradeTargets = { ...(s.gradeTargets || {}) };
            for (const sub of ['biology', 'history', 'math', 'languages', 'other'] as const) gradeTargets[sub] = score;
            store.setSettings({ gradeTargets });
            void saveGradePrivacy(s.gradePrivacy || 'summary', gradeTargets).catch(() => undefined);
          }}>{g}</button>;
        })}</div>
      </div>

      <div className="card"><h3>✨ {t('s_ai')}</h3>
        <p className="small" data-testid="ai-status">{cfg.data?.ai.configured ? t('s_ai_server_on', { model: cfg.data.ai.model || '' }) : t('s_ai_server_off')}</p>
        {user.isAdmin && cfg.data?.ai.configured && <button className="btn ghost sm" disabled={ping.isPending} onClick={() => ping.mutate()}>{t('s_ai_ping')}</button>}
        <p className="small muted">{t('s_offline_hint')}</p>
        <button className="btn ghost sm" onClick={async () => { toast(t('offline_started')); toast((await warmOfflineCache()) ? t('offline_ready') : t('offline_na'), 'ok'); }}>⬇️ {t('s_offline')}</button>
      </div>

      {user.isAdmin && <div className="card"><h3>{t('s_users')}</h3>
        <ul className="user-list">{users.data?.users.map(u => <li key={u.id}><b>{u.name || u.email}</b> <span className="muted small">{u.email} · {tp('n_tests', u.tests)} · AI 30d: {u.ai30d}</span>{u.isAdmin && <span className="chip warm">{t('admin_badge')}</span>}
          {u.id !== user.id && <button className="btn link bad sm" onClick={async () => { if (confirm(t('admin_delete_user', { name: u.email || u.name }))) { await api('/api/admin/users/' + u.id, { method: 'DELETE' }); users.refetch(); } }}>{t('delete')}</button>}</li>)}</ul>
        <p className="muted small">{t('admin_hint')}</p></div>}

      <div className="card"><h3>🔒 {t('s_data')}</h3>
        <p className="small muted">{t('privacy_short')}</p>
        <div className="row-btns wrap">
          <a className="btn ghost sm" href="/api/me/export" download data-testid="export-server">⬇️ {t('s_export_all')}</a>
          <button className="btn ghost sm" onClick={() => download(`${APP_NAME.toLowerCase()}-backup-${new Date().toISOString().slice(0, 10)}.json`, store.exportJSON())}>💾 {t('s_export')}</button>
          <button className="btn ghost sm" onClick={() => file.current?.click()}>📥 {t('s_import')}</button>
          <input ref={file} type="file" accept="application/json,.json" hidden onChange={async e => { const f = e.target.files?.[0]; if (!f) return; if (!confirm(t('import_confirm'))) return; try { store.importJSON(await f.text()); toast(t('imported'), 'ok'); } catch { toast(t('import_bad'), 'bad'); } e.target.value = ''; }} />
        </div>
        <div className="row-btns wrap">
          <button className="btn link bad sm" onClick={async () => { if (confirm(t('reset_confirm'))) { await api('/api/me/data', { method: 'DELETE' }).catch(() => undefined); store.resetLocal(); await resetSyncState(); toast(t('saved')); } }}>🗑 {t('s_reset')}</button>
        </div>
        <details className="danger"><summary>⚠️ {t('delete_account')}</summary>
          <p className="small">{t('delete_account_text')}</p>
          <input placeholder={t('delete_account_type')} value={confirmDel} onChange={e => setConfirmDel(e.target.value)} data-testid="del-confirm" />
          <button className="btn bad-btn" disabled={confirmDel.trim().toUpperCase() !== t('delete_word').toUpperCase() || offline} data-testid="delete-account" onClick={deleteAccount}>{t('delete_account')}</button>
        </details>
      </div>

      <div className="card"><h3>{t('s_about')}</h3><p className="small">{t('s_method')}</p><p className="muted small">{APP_NAME} {APP_VERSION}{cfg.data ? ` · server ${cfg.data.version}` : ''}</p>
        <p className="muted small">{t('vibe_note')}</p>
        <p className="muted small">{t('license_note')} <a href={cfg.data?.sourceCodeUrl || 'https://github.com/bandulix/merkster'} target="_blank" rel="noopener noreferrer" data-testid="source-code">{t('source_code')} ↗</a></p></div>
    </section>
  );
}
