/* Supporter: one kid in detail (read-only) – results dashboard with charts, achievements, and cheering. */
import { useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import type { KidSummary, ReactionCount } from '../../../shared/supporters';
import { fmtResult } from '../../../shared/grades';
import { api, ApiError } from '../lib/api';
import { confetti, fmtDay, toast } from '../lib/util';
import { useKid, milestoneIcon, milestoneName, whoName } from '../lib/supporters';
import { useStore } from '../hooks';
import { Avatar, RankBadge, TopBar } from '../components/ui';
import { ReactionBar } from '../components/Cheers';
import { ResultsDashboard, type ResItem } from '../components/ResultsDashboard';
import { RulesPanel } from '../components/RuleEditor';
import { Modal } from '../components/ui';
import { Link } from 'react-router-dom';
import { moneyList, rewardText, ruleWhen, useKidRewards } from '../lib/rewards';
import { breakdown } from '../../../shared/rewards';
import { fmtAvg } from '../../../shared/reportcards';
import { customSubjects, fmtGrade, LOCALE, subjIcon, subjName, termName } from '../lib/reportcards';
import { GrandTotal, SupporterBreakdownList } from '../components/Totals';
import { MiniAvatar } from '../components/Cheers';
import type { KidResult } from '../../../shared/supporters';
import { kidUser, rankById, Upcoming } from './Cheer';
import { subjectIcon, t, uiLang } from '../i18n';

export default function KidDetail() {
  const { id = '' } = useParams(); const q = useKid(id); const qc = useQueryClient(); const d = useStore(); const L = uiLang();
  const [busy, setBusy] = useState(false), [photo, setPhoto] = useState<string | null>(null), [rcPhoto, setRcPhoto] = useState<string | null>(null);
  const kr = useKidRewards(id);
  if (q.error) return (q.error as ApiError).status === 403
    ? <section className="page narrow"><TopBar title="" back="/cheer" /><div className="empty-hero" data-testid="kid-no-access"><div className="empty-emoji">🔒</div><p>{t('not_linked')}</p></div></section>
    : <Navigate to="/cheer" replace />;
  const k = q.data; if (!k) return <div className="spinner" />;
  const p = k.practice, rank = rankById(p?.rankId);
  const react = async (kind: string, tid: string, reaction: string, on: boolean) => {
    setBusy(true);
    try {
      const r = await api<{ reactions: ReactionCount[] }>(`/api/kids/${k.id}/react`, { body: { kind, id: tid, reaction, on } });
      if (on) confetti();
      qc.setQueryData<KidSummary>(['kid', id], old => old && ({
        ...old,
        results: old.results?.map(x => kind === 'result' && x.testId === tid ? { ...x, reactions: r.reactions } : x),
        reportCards: old.reportCards?.map(c => kind === 'report' && c.id === tid ? { ...c, reactions: r.reactions } : c),
        practice: old.practice && { ...old.practice, milestones: old.practice.milestones.map(m => m.kind === kind && m.id === tid ? { ...m, reactions: r.reactions } : m) }
      }));
      qc.invalidateQueries({ queryKey: ['kids'] });
    } catch (e) { toast((e as ApiError).status === 403 ? t('not_linked') : t('err_unknown'), 'bad'); if ((e as ApiError).status === 403) qc.invalidateQueries({ queryKey: ['kid', id] }); }
    finally { setBusy(false); }
  };
  const items: ResItem[] = (k.results || []).map(r => ({ id: r.testId, name: r.name, subject: r.subject, testDate: r.testDate, result: r.result, icon: subjectIcon(r.subject), practice: r.practice || null }));
  const latest = k.results?.[0];
  const verify = async (r: KidResult) => {
    setBusy(true);
    try {
      await api(`/api/kids/${k.id}/verify`, { body: { testId: r.testId, verified: !r.verified } });
      qc.setQueryData<KidSummary>(['kid', id], old => old && ({ ...old, results: old.results?.map(x => x.testId === r.testId ? { ...x, verified: !r.verified } : x) }));
    } catch (e) { toast((e as ApiError).status === 403 ? t('not_linked') : t('err_unknown'), 'bad'); }
    finally { setBusy(false); }
  };
  const resActions = (r: KidResult | undefined) => r && <span className="res-actions">
    <span className={'chip xs' + (r.verified ? ' good' : '')} data-testid="res-status">{r.verified ? t('verified') : '✍️ ' + t('self_reported')}</span>
    <button className="btn ghost xs" data-testid="verify-btn" disabled={busy} onClick={() => verify(r)}>{r.verified ? t('unverify') : t('verify')}</button>
    {r.photo && <button className="btn ghost xs" data-testid="photo-view" onClick={() => setPhoto(r.testId)}>🖼</button>}
  </span>;
  const openRewards = (kr.data?.earned || []).filter(e => e.status === 'open').length;
  const kidCustom = customSubjects(k.reportCards || []);
  // my own promises to this kid (open): grand total per currency + what triggered them
  const myB = breakdown((kr.data?.earned || []).filter(e => e.status === 'open').map(e => ({ supporterId: 'me', supporter: { id: 'me', name: t('you'), avatar: null, relation: '', label: t('you') }, ruleId: e.ruleId || e.id, trigger: e.trigger, reward: e.reward })));
  return (
    <section className="kid page" data-testid="kid-detail">
      <TopBar title={k.name} back="/cheer" />
      <div className="me-hero kid-hero pop-in" style={{ ['--c1' as string]: rank.c1, ['--c2' as string]: rank.c2, ['--glow' as string]: rank.glow }}>
        <div className="me-top"><Avatar user={kidUser(k)} rank={rank} size={72} />
          <div><h1>{k.name}</h1>{p && <p className="me-rank"><RankBadge rank={rank} size={26} /> {t('lvl')} {p.level} · {rank.name[L]}</p>}</div></div>
        {p && <div className="stat-row small-stats light"><div className="stat"><b>🔥 {p.streak}</b><span>{t('day_streak')}</span></div><div className="stat"><b>{p.weekMinutes}</b><span>{t('active_min')}</span></div><div className="stat"><b>{p.badges}</b><span>{t('badges')}</span></div></div>}
      </div>
      {!p && !k.results && <p className="muted center">{t('kid_shares_nothing', { name: k.name })}</p>}
      {latest && <div className="card kid-latest" data-testid="kid-result" data-test={latest.name}>
        <p className="muted small">{t('kid_results')} · {fmtDay(latest.testDate)}</p>
        <div className="kid-latest-row"><span className="tc-icon">{subjectIcon(latest.subject)}</span><b className="grow">{latest.name}</b><b className="big-num" data-testid="kid-latest-grade">{fmtResult(latest.result)}</b></div>
        {resActions(latest)}
        <ReactionBar counts={latest.reactions} busy={busy} onToggle={(r, on) => react('result', latest.testId, r, on)} />
      </div>}
      {(k.reportCards || []).length > 0 && <div className="card kid-rc-wrap" data-testid="kid-rcs"><h3>📜 {t('report_cards')}</h3>
        {[...k.reportCards!].reverse().map(c => (
          <div key={c.id} className="kid-rc" data-testid="kid-rc" data-card={c.id}>
            <div className="kid-rc-head"><b>{termName(c)}</b><b className="big-num" data-testid="kid-rc-avg">Ø {fmtAvg(c.system, c.avgScore, LOCALE())}</b></div>
            <div className="kid-rc-lines">{c.lines.map(l => <span key={l.subjectId} className="chip" data-testid="kid-rc-line">{subjIcon(l.subjectId)} {subjName(l.subjectId, l.name)} <b>{fmtGrade(c.system, l.value)}</b></span>)}</div>
            {c.hasPhoto && (k.showPhotos ? <button className="btn ghost xs" data-testid="kid-rc-photo-btn" onClick={() => setRcPhoto(c.id)}>🖼 {t('rc_photo')}</button> : null)}
            <ReactionBar counts={c.reactions} busy={busy} onToggle={(r, on) => react('report', c.id, r, on)} />
          </div>))}</div>}
      <RulesPanel kidId={k.id} kidName={k.name} grading={k.grading} subjects={kidCustom} />
      {myB.perSupporter.length > 0 && <div className="card" data-testid="kid-my-total"><GrandTotal b={myB} label={t('rw_kid_total', { name: k.name })} big={false} /><SupporterBreakdownList b={myB} sys={k.grading} testid="kid-my-breakdown" /></div>}
      {kr.data && (kr.data.others ? <div className="card" data-testid="kid-others"><h3>{t('others_rewards')}</h3>
        {kr.data.others.length ? kr.data.others.map(o => (
          <div key={o.supporter.id} className="sb-row" data-testid="kid-other" data-name={whoName(o.supporter)}>
            <div className="sb-head"><MiniAvatar src={o.supporter.avatar} name={o.supporter.name} size={32} /><b className="grow">{whoName(o.supporter)}</b>
              <span className="sb-sub" data-testid="kid-other-total">{moneyList(o.open) || '–'}{o.otherOpen ? ' + ' + t('rw_other_n', { n: o.otherOpen }) : ''}</span></div>
            <ul className="sb-items">{o.rules.map(r => <li key={r.id}><b>{rewardText(r.reward)}</b> <span className="muted">{ruleWhen(r.trigger, k.grading)}</span></li>)}</ul>
          </div>)) : <p className="muted small">–</p>}</div>
        : <p className="muted small center" data-testid="kid-others-hidden">🔒 {t('others_hidden')}</p>)}
      {openRewards > 0 && <Link className="card open-rewards-link" to="/cheer/rewards" data-testid="kid-open-rewards">🎁 {t('open_rewards')} <span className="chip warm">{t('open_rewards_n', { n: openRewards })}</span> →</Link>}
      {p && p.upcoming.length > 0 && <div className="card"><h3>{t('kid_upcoming')}</h3><Upcoming list={p.upcoming} /></div>}
      {p && p.milestones.length > 0 && <div className="card"><h3>{t('kid_milestones')}</h3>
        <ul className="kid-ms-list">{p.milestones.slice(0, 8).map(m => (
          <li key={m.kind + m.id} data-testid="kid-milestone"><div className="ms-head"><span className="ms-ic">{milestoneIcon(m.kind, m.id)}</span><b>{milestoneName(m.kind, m.id)}</b><small className="muted">{new Date(m.at).toLocaleDateString(L)}</small></div>
            <ReactionBar counts={m.reactions} busy={busy} onToggle={(r, on) => react(m.kind, m.id, r, on)} /></li>))}</ul></div>}
      {items.length > 0 && <><h2 className="sec-title">📊 {t('results_dash')}</h2>
        <ResultsDashboard items={items} sys={k.grading || d.settings.grading} rowActions={x => resActions(k.results!.find(r => r.testId === x.id))} rowExtra={x => x.id === latest?.testId ? null : <ReactionBar counts={k.results!.find(r => r.testId === x.id)!.reactions} busy={busy} onToggle={(r, on) => react('result', x.id, r, on)} />} /></>}
      <p className="muted small center">🔒 {t('readonly_note')}</p>
      {rcPhoto && <Modal onClose={() => setRcPhoto(null)} label={t('rc_photo')} className="photo-modal"><img className="test-photo" data-testid="kid-rc-photo" src={`/api/kids/${k.id}/report-cards/${rcPhoto}/photo`} alt={t('rc_photo')} /><div className="row-btns"><button className="btn primary" onClick={() => setRcPhoto(null)}>OK</button></div></Modal>}
      {photo && <Modal onClose={() => setPhoto(null)} label={t('photo_view')} className="photo-modal"><img className="test-photo" data-testid="kid-photo" src={`/api/kids/${k.id}/photo/${photo}`} alt={t('photo_view')} /><div className="row-btns"><button className="btn primary" onClick={() => setPhoto(null)}>OK</button></div></Modal>}
    </section>
  );
}
