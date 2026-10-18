/* Supporter: create / manage reward rules for one kid. Grades are shown in the kid's grading system. */
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { GradeSystem, Subject } from '../../../shared/types';
import { SUBJECT_KEYS } from '../../../shared/types';
import { families, GRADE_SPECS } from '../../../shared/grades';
import { CANON_SUBJECTS } from '../../../shared/reportcards';
import { avgThreshold } from '../../../shared/reportcards';
import { CURRENCIES, isRcKind, STREAK_OPTIONS, type Currency, type PersonLite, type Reward, type RewardTrigger, type TriggerKind } from '../../../shared/rewards';
import { FAMILY_RELATIONS, INVITE_DAYS_DEFAULT, MAX_JOINT_MEMBERS, type FamilyRelation } from '../../../shared/supporters';
import { api, ApiError } from '../lib/api';
import { peopleNames, rewardText, ruleConverted, ruleWhen, useKidRewards } from '../lib/rewards';
import { relName, whoName } from '../lib/supporters';
import { dayISO, parseDay } from '../lib/schedule';
import { confetti, fmtDay, now, toast } from '../lib/util';
import { subjectName, t, uiLang, type Key } from '../i18n';
import { Modal } from './ui';

const EXAM: TriggerKind[] = ['grade', 'personal_best', 'improvement'];
const PRACTICE: TriggerKind[] = ['streak', 'level'];
const RC: TriggerKind[] = ['rc_each', 'rc_subject', 'rc_improved', 'rc_avg', 'rc_avg_improved', 'rc_floor'];
const GRADE_KINDS: TriggerKind[] = ['grade', 'rc_each', 'rc_subject', 'rc_floor'];

export function RulesPanel({ kidId, kidName, grading, subjects = [], canSync = false }: { kidId: string; kidName: string; grading: GradeSystem; subjects?: { id: string; name: string }[]; canSync?: boolean }) {
  const q = useKidRewards(kidId), qc = useQueryClient();
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false);
  const rules = q.data?.rules || [], sys = q.data?.grading || grading, family = q.data?.family || [], syncWith = q.data?.syncWith || [];
  const [inviteFor, setInviteFor] = useState<string | null>(null);
  const act = async (path: string, body?: object, method = 'POST') => {
    setBusy(true);
    try { await api(path, { method, body }); await qc.invalidateQueries({ queryKey: ['kid-rewards', kidId] }); await qc.invalidateQueries({ queryKey: ['rewards-given'] }); }
    catch (e) { toast((e as ApiError).message || t('err_unknown'), 'bad'); throw e; }
    finally { setBusy(false); }
  };
  return (
    <div className="card" data-testid="rules-panel">
      <div className="sec-head"><h3>🎁 {t('kid_rewards', { name: kidName })}</h3>
        <button className="btn primary sm" data-testid="rule-new" onClick={() => setOpen(true)}>+ {t('rule_new')}</button></div>
      <p className="muted small">{t('rule_kid_system', { name: kidName, sys: t(('gs_' + sys) as Key) })} · 🤝 {t('rule_promise_note')}</p>
      {canSync && <div className="joint-box" data-testid="sync-all">
        <b>{t('sync_all')}</b>
        <p className="muted small">{t('sync_all_sub')}</p>
        {family.map(f => <label key={f.id} className="toggle"><input type="checkbox" data-testid={'sync-' + f.id} data-relation={f.relation} checked={syncWith.includes(f.id)} disabled={busy} onChange={e => { void act(`/api/kids/${kidId}/rewards/sync`, { peerId: f.id, on: e.target.checked }).catch(() => undefined); }} /><span>{whoName(f)}</span></label>)}
        <button type="button" className="btn ghost sm" data-testid="sync-invite" disabled={busy} onClick={() => setInviteFor('all')}>{t('sync_invite')}</button>
      </div>}
      {!rules.length && <p className="muted" data-testid="rule-none">{t('rule_none')}</p>}
      {([['exam', rules.filter(r => !isRcKind(r.trigger.kind))], ['report', rules.filter(r => isRcKind(r.trigger.kind))]] as const).map(([id, rows]) => rows.length > 0 && (
        <div key={id} className="rule-group" data-testid={'rule-group-' + id}>
          <span className="muted xsmall">{t(id === 'report' ? 'rule_list_reports' : 'rule_list_exams')}</span>
          <ul className="rule-list">{rows.map(r => {
            const conv = ruleConverted(r.trigger, sys, kidName);
            return (
              <li key={r.id} className={'rule-row' + (r.active ? '' : ' paused')} data-testid="rule-row" data-active={r.active ? '1' : '0'}>
                <div><b data-testid="rule-preview">{rewardText(r.reward)}</b> <span>{ruleWhen(r.trigger, sys)}</span>
                  {r.capPerMonth != null && <small className="chip xs">{t('rule_cap', { n: r.capPerMonth })} · {r.earnedThisMonth}/{r.capPerMonth}</small>}
                  {r.validAsOf != null && <small className="chip xs" data-testid="rule-valid-as-of">{t('rule_valid_from', { date: fmtDay(dayISO(r.validAsOf)) })}</small>}
                  {r.members && r.members.length > 1 && <small className="chip xs" data-testid="joint-members">{t('joint_members', { names: peopleNames(r.members) })}</small>}
                  {!r.active && <small className="chip xs">{t('rule_paused')}</small>}
                  {conv && <small className="warn-line" data-testid="rule-converted">⚠️ {conv}</small>}</div>
                <div className="row-btns">
                  {r.active && <button className="btn ghost sm" data-testid="rule-invite" disabled={busy} onClick={() => setInviteFor(r.id)}>{t('joint_invite')}</button>}
                  <button className="btn ghost sm" data-testid="rule-pause" disabled={busy} onClick={() => act(`/api/kids/${kidId}/rules/${r.id}`, { active: !r.active }, 'PATCH')}>{r.active ? t('rule_pause') : t('rule_resume')}</button>
                  <button className="btn link bad sm" data-testid="rule-delete" disabled={busy} onClick={() => { if (confirm(t('rule_delete_confirm'))) void act(`/api/kids/${kidId}/rules/${r.id}`, undefined, 'DELETE'); }}>{t('rule_delete')}</button>
                </div>
              </li>);
          })}</ul>
        </div>))}
      {open && <RuleEditor kidId={kidId} kidName={kidName} grading={sys} subjects={subjects} family={family} busy={busy} onClose={() => setOpen(false)}
        onSave={async (trigger, reward, cap, memberIds, validAsOf) => { await act(`/api/kids/${kidId}/rules`, { trigger, reward, capPerMonth: cap, memberIds, validAsOf }); confetti(); toast(t('rule_saved'), 'ok'); setOpen(false); }} />}
      {inviteFor && <RuleInvite kidId={kidId} ruleId={inviteFor} onClose={() => setInviteFor(null)} />}
    </div>
  );
}

const REL_ICON: Record<FamilyRelation, string> = { mum: '👩', dad: '👨', grandma: '👵', grandpa: '👴', aunt: '🧑‍🦰', uncle: '🧔' };

function RuleInvite({ kidId, ruleId, onClose }: { kidId: string; ruleId: string; onClose: () => void }) {
  const oneOk = ruleId !== 'all';
  const [rel, setRel] = useState<FamilyRelation>('grandma'), [label, setLabel] = useState(''), [url, setUrl] = useState<string | null>(null), [busy, setBusy] = useState(false);
  const [scope, setScope] = useState<'one' | 'all'>(oneOk ? 'one' : 'all'), [sentAll, setSentAll] = useState(false);
  const create = async () => {
    if (scope === 'one' && !oneOk) return;
    const all = scope === 'all';
    setBusy(true);
    try {
      const r = await api<{ invite: { url: string } }>(all ? `/api/kids/${kidId}/rewards/invite` : `/api/kids/${kidId}/rules/${ruleId}/invite`, { body: { relation: rel, label, days: INVITE_DAYS_DEFAULT, ...(all ? { shareAll: true } : {}) } });
      setSentAll(all);
      setUrl(r.invite.url);
    } catch (e) { toast((e as ApiError).message || t('err_unknown'), 'bad'); }
    finally { setBusy(false); }
  };
  const copy = async () => { if (!url) return; try { await navigator.clipboard.writeText(url); toast(t('copied'), 'ok'); } catch { (document.querySelector('[data-testid="rule-invite-url"]') as HTMLInputElement | null)?.select(); } };
  return (
    <Modal onClose={onClose} label={t(oneOk ? 'joint_invite' : 'sync_invite')}>
      <h2>🎁 {t(oneOk ? 'joint_invite' : 'sync_invite')}</h2>
      {!url ? <>
        <div className="seg wrap" data-testid="rule-inv-scope">
          <button type="button" className={'pill sm' + (scope === 'one' ? ' on' : '')} data-testid="rule-inv-one" disabled={!oneOk} onClick={() => setScope('one')}>{t('joint_invite_one')}</button>
          <button type="button" className={'pill sm' + (scope === 'all' ? ' on' : '')} data-testid="rule-inv-all" onClick={() => setScope('all')}>{t('joint_invite_all')}</button>
        </div>
        <p className="muted small">{t(scope === 'all' ? 'sync_all_sub' : 'joint_with_sub')}</p>
        <div className="rel-grid">{FAMILY_RELATIONS.map(r => <button key={r} type="button" className={'rel' + (rel === r ? ' on' : '')} data-testid={'rule-rel-' + r} onClick={() => setRel(r)}><span>{REL_ICON[r]}</span>{relName(r)}</button>)}</div>
        <label className="field"><span>{t('invite_label')}</span><input data-testid="rule-inv-label" value={label} maxLength={40} placeholder={t('invite_label_ph')} onChange={e => setLabel(e.target.value)} /></label>
        <button className="btn primary big wide" data-testid="rule-inv-create" disabled={busy || (scope === 'one' && !oneOk)} onClick={() => void create()}>🔗 {t('invite_create')}</button>
      </> : <>
        <p data-testid="rule-inv-ready">{t(sentAll ? 'joint_link_all_ready' : 'joint_link_ready')}</p>
        <div className="row-in"><input readOnly value={url} data-testid="rule-invite-url" onFocus={e => e.target.select()} /><button className="btn ghost" data-testid="rule-inv-copy" onClick={() => void copy()}>{t('invite_copy')}</button></div>
      </>}
    </Modal>
  );
}

function RuleEditor({ kidId: _kidId, kidName, grading, subjects, family, busy, onClose, onSave }: {
  kidId: string; kidName: string; grading: GradeSystem; subjects: { id: string; name: string }[]; family: PersonLite[]; busy: boolean; onClose: () => void;
  onSave: (trigger: RewardTrigger, reward: Reward, cap: number | null, memberIds: string[], validAsOf: number) => Promise<void>;
}) {
  const fam = families(grading), opts = GRADE_SPECS[grading].options;
  const [kind, setKind] = useState<TriggerKind>('grade');
  const [gradeVal, setGradeVal] = useState(fam[0]?.value ?? (opts?.[0]?.value ?? 90));
  const [mode, setMode] = useState<'at_least' | 'exactly'>('at_least');
  const [subject, setSubject] = useState<Subject | ''>('');
  const [days, setDays] = useState(7), [level, setLevel] = useState(2), [delta, setDelta] = useState(0);
  const [rtype, setRtype] = useState<'money' | 'other'>('money');
  const [rcWhen, setRcWhen] = useState<'any' | 'final'>('final');
  const [amount, setAmount] = useState('5'), [currency, setCurrency] = useState<Currency>('EUR'), [text, setText] = useState('');
  const [cap, setCap] = useState('');
  const [validAsOf, setValidAsOf] = useState(() => dayISO(now()));
  const [picked, setPicked] = useState<string[]>([]);
  const toggleMember = (id: string) => setPicked(p => p.includes(id) ? p.filter(x => x !== id) : p.length >= MAX_JOINT_MEMBERS - 1 ? p : [...p, id]);
  const allSubjects = [...subjects, ...CANON_SUBJECTS.filter(c => !subjects.some(x => x.id === c.id)).map(c => ({ id: c.id, name: c.name[uiLang()] }))];
  const [rcSubject, setRcSubject] = useState(allSubjects[0]?.id || 'math');
  const [avg, setAvg] = useState(grading === 'de_grade' ? '2.0' : grading === 'points15' ? '11' : grading === 'ch_grade' ? '5' : '80');
  const avgNumeric = !opts || grading === 'de_grade' || grading === 'points15' || grading === 'ch_grade';
  const trigger = (): RewardTrigger | null => {
    const sub = subject || null;
    const when = rcWhen === 'final' ? 'final' as const : undefined;
    switch (kind) {
      case 'grade': return { kind: 'grade', system: grading, value: gradeVal, mode, min: 0, max: 100, subject: sub }; // server rebuilds min/max via gradeTrigger
      case 'personal_best': return { kind: 'personal_best', subject: sub };
      case 'improvement': return { kind: 'improvement', subject: sub, minDelta: Math.max(0, Number(delta) || 0) };
      case 'streak': return { kind: 'streak', days };
      case 'level': return { kind: 'level', level };
      // report cards: the server rebuilds the score thresholds from system + value (same code as the unit tests)
      case 'rc_each': return { kind: 'rc_each', system: grading, value: gradeVal, mode, min: 0, max: 100, when };
      case 'rc_subject': return { kind: 'rc_subject', subjectId: rcSubject, system: grading, value: gradeVal, mode: 'at_least', min: 0, max: 100, when };
      case 'rc_improved': return { kind: 'rc_improved', subjectId: subject ? rcSubject : null, when };
      case 'rc_avg': { const v = avgNumeric ? parseFloat(avg.replace(',', '.')) : gradeVal; return Number.isFinite(v) ? { kind: 'rc_avg', system: grading, value: v, min: avgThreshold(grading, v), when } : null; }
      case 'rc_avg_improved': return { kind: 'rc_avg_improved', minDelta: 0, when };
      case 'rc_floor': return { kind: 'rc_floor', system: grading, value: gradeVal, min: 0, when };
      default: return null;
    }
  };
  const reward = (): Reward | null => {
    if (rtype === 'money') { const a = Math.round(parseFloat(amount.replace(',', '.')) * 100) / 100; return a >= 0.01 && a <= 1000 ? { type: 'money', amount: a, currency } : null; }
    const t0 = text.trim().slice(0, 60); return t0 ? { type: 'other', text: t0 } : null;
  };
  const tr = trigger(), rw = reward();
  const save = async () => {
    if (!tr || !rw || !validAsOf) return;
    await onSave(tr, rw, cap === '' ? null : Math.max(1, Math.min(100, Math.round(Number(cap)) || 1)), picked, parseDay(validAsOf)).catch(() => undefined);
  };
  // Preview uses a temporary trigger rebuilt client-side for grade
  const previewTr: RewardTrigger | null = tr;
  return (
    <Modal onClose={onClose} label={t('rule_new')} className="rule-modal">
      <h2>🎁 {t('rule_new')}</h2>
      <p className="muted small">{t('rule_kid_system', { name: kidName, sys: t(('gs_' + grading) as Key) })}</p>
      <label className="field"><span>{t('rule_when')}</span>
        <small className="muted">{t('rule_group_exams')}</small>
        <div className="seg wrap" data-testid="rule-kind">{EXAM.map(k => <button key={k} type="button" className={'pill sm' + (kind === k ? ' on' : '')} data-testid={'rt-' + k} onClick={() => { setKind(k); setSubject(''); }}>{t(('rt_' + k) as Key)}</button>)}</div>
        <small className="muted">{t('rule_group_practice')}</small>
        <div className="seg wrap" data-testid="rule-kind-practice">{PRACTICE.map(k => <button key={k} type="button" className={'pill sm' + (kind === k ? ' on' : '')} data-testid={'rt-' + k} onClick={() => { setKind(k); setSubject(''); }}>{t(('rt_' + k) as Key)}</button>)}</div>
        <small className="muted">📜 {t('rule_group_reports')}</small>
        <div className="seg wrap" data-testid="rule-kind-rc">{RC.map(k => <button key={k} type="button" className={'pill sm' + (kind === k ? ' on' : '')} data-testid={'rt-' + k} onClick={() => { setKind(k); setSubject(''); }}>{t(('rt_' + k) as Key)}</button>)}</div>
        {isRcKind(kind) && <p className="muted xsmall" data-testid="rule-zeugnis-extra">{t('rule_zeugnis_extra')}</p>}
      </label>
      {isRcKind(kind) && <div className="seg wrap" data-testid="rule-rc-when">
        <span className="muted small">{t('rule_rc_when')}</span>
        <button type="button" className={'pill sm' + (rcWhen === 'final' ? ' on' : '')} data-testid="rule-rc-when-final" onClick={() => setRcWhen('final')}>{t('rule_rc_when_final')}</button>
        <button type="button" className={'pill sm' + (rcWhen === 'any' ? ' on' : '')} data-testid="rule-rc-when-any" onClick={() => setRcWhen('any')}>{t('rule_rc_when_any')}</button>
      </div>}
      {(kind === 'rc_subject' || (kind === 'rc_improved' && subject)) && <label className="field"><span>{t('rc_subject')}</span>
        <select data-testid="rule-rc-subject" value={rcSubject} onChange={e => setRcSubject(e.target.value)}>{allSubjects.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>}
      {kind === 'rc_improved' && <label className="toggle"><input type="checkbox" data-testid="rule-rc-one" checked={!!subject} onChange={e => setSubject(e.target.checked ? 'other' : '')} /><span>{t('rt_rc_subject')}</span></label>}
      {kind === 'rc_avg' && avgNumeric && <label className="field"><span>{t('rule_avg_value')}</span><input type="number" data-testid="rule-avg" step={grading === 'de_grade' || grading === 'ch_grade' ? 0.1 : 1} value={avg} onChange={e => setAvg(e.target.value)} /></label>}
      {(GRADE_KINDS.includes(kind) || (kind === 'rc_avg' && !avgNumeric)) && <>
        <label className="field"><span>{t('rule_pick_grade')}</span>
          <div className="seg wrap" data-testid="rule-grade">{(fam.length ? fam : (opts || []).map(o => ({ label: o.label, value: o.value }))).map(o =>
            <button key={o.label} className={'pill sm' + (gradeVal === o.value ? ' on' : '')} data-testid={'rg-' + o.label} onClick={() => setGradeVal(o.value)}>{o.label}</button>)}
            {!opts && <input type="number" data-testid="rg-num" min={0} max={100} value={gradeVal} onChange={e => setGradeVal(Number(e.target.value))} />}</div>
        </label>
        {(kind === 'grade' || kind === 'rc_each') && <div className="seg" data-testid="rule-mode">
          <button className={'pill sm' + (mode === 'at_least' ? ' on' : '')} data-testid="rm-at_least" onClick={() => setMode('at_least')}>{t('rm_at_least')}</button>
          <button className={'pill sm' + (mode === 'exactly' ? ' on' : '')} data-testid="rm-exactly" onClick={() => setMode('exactly')}>{t('rm_exactly')}</button>
        </div>}
      </>}
      {(kind === 'grade' || kind === 'personal_best' || kind === 'improvement') && (
        <label className="field"><span>{t('rule_subject')}</span>
          <select data-testid="rule-subject" value={subject} onChange={e => setSubject(e.target.value as Subject | '')}>
            <option value="">{t('rule_any_subject')}</option>
            {SUBJECT_KEYS.map(s => <option key={s} value={s}>{subjectName(s)}</option>)}
          </select></label>)}
      {kind === 'streak' && <label className="field"><span>{t('rule_streak_days')}</span>
        <div className="seg wrap">{STREAK_OPTIONS.map(d => <button key={d} className={'pill sm' + (days === d ? ' on' : '')} data-testid={'rs-' + d} onClick={() => setDays(d)}>{d}</button>)}</div></label>}
      {kind === 'level' && <label className="field"><span>{t('rule_level_n')}</span><input type="number" data-testid="rule-level" min={2} max={200} value={level} onChange={e => setLevel(Math.max(2, Number(e.target.value) || 2))} /></label>}
      {kind === 'improvement' && <label className="field"><span>{t('rule_min_delta')}</span><input type="number" data-testid="rule-delta" min={0} max={50} value={delta} onChange={e => setDelta(Number(e.target.value) || 0)} /></label>}

      <label className="field"><span>{t('rule_reward')}</span>
        <div className="seg" data-testid="rule-rtype">
          <button className={'pill sm' + (rtype === 'money' ? ' on' : '')} data-testid="rw-money" onClick={() => setRtype('money')}>{t('rw_money')}</button>
          <button className={'pill sm' + (rtype === 'other' ? ' on' : '')} data-testid="rw-other" onClick={() => setRtype('other')}>{t('rw_other')}</button>
        </div>
      </label>
      {rtype === 'money'
        ? <div className="row-in money-row"><input type="number" inputMode="decimal" data-testid="rule-amount" min={0.01} step={0.5} value={amount} onChange={e => setAmount(e.target.value)} placeholder={t('rule_amount')} aria-label={t('rule_amount')} />
            <select data-testid="rule-currency" value={currency} onChange={e => setCurrency(e.target.value as Currency)}>{CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
        : <input data-testid="rule-text" maxLength={60} value={text} onChange={e => setText(e.target.value)} placeholder={t('rule_text_ph')} />}
      <label className="field"><span>{t('rule_cap_label')}</span><input type="number" data-testid="rule-cap" min={1} max={100} value={cap} onChange={e => setCap(e.target.value)} placeholder="–" /></label>
      <label className="field"><span>{t('rule_valid_as_of')}</span>
        <input type="date" data-testid="rule-valid-as-of" max={dayISO(now() + 864e5)} value={validAsOf} onChange={e => e.target.value && setValidAsOf(e.target.value)} />
        <small className="muted">{t('rule_valid_as_of_sub')}</small>
      </label>
      <div className="joint-box" data-testid="joint-with">
        <b>{t('joint_with')}</b>
        <p className="muted small">{t('joint_with_sub')}</p>
        {family.map(f => <label key={f.id} className="toggle"><input type="checkbox" data-testid={'joint-' + f.id} data-relation={f.relation} checked={picked.includes(f.id)} onChange={() => toggleMember(f.id)} /><span>{whoName(f)}</span></label>)}
      </div>
      {previewTr && rw && <p className="rule-preview" data-testid="rule-preview-live"><b>{rewardText(rw)}</b> {ruleWhen(previewTr!, grading)}</p>}
      <p className="muted xsmall">🤝 {t('rule_promise_note')}</p>
      <div className="row-btns"><button className="btn link" onClick={onClose}>{t('cancel')}</button>
        <button className="btn primary big" data-testid="rule-save" disabled={busy || !tr || !rw} onClick={() => void save()}>{t('rule_save')}</button></div>
    </Modal>
  );
}
