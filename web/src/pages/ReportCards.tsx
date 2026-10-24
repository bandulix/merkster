/* Report cards (Zeugnisse): list + trends across terms, and the detail page with the unboxing reveal,
   report card vs. the term's test average, improvement vs. the last card, rewards, cheers, share, photo. */
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { GRADE_SPECS } from '../../../shared/grades';
import { avgValue, byIssued, canon, compareCards, examAverages, fmtAvg, gapKind, termOfCard, type ReportCard } from '../../../shared/reportcards';
import { XP } from '../../../shared/gamification';
import { useStore } from '../hooks';
import { store } from '../lib/store';
import { api } from '../lib/api';
import { confetti, toast, vibrate } from '../lib/util';
import { fmtGrade, LOCALE, subjIcon, subjName, termName, termStarts, useReportCards } from '../lib/reportcards';
import { useMyRewards } from '../lib/rewards';
import { cheersFor, useCheers } from '../lib/supporters';
import { CheerChips } from '../components/Cheers';
import { ShareSheet, type ShareWhat } from '../components/Share';
import { earnedBreakdown, fmtMoney, GrandTotal, SupporterBreakdownList } from '../components/Totals';
import { TopBar } from '../components/ui';
import { fanfare } from '../components/Celebrate';
import { t, tp, type Key } from '../i18n';

const short = (c: ReportCard) => (c.term === 'h1' ? 'HJ ' : c.term === 'final' ? '' : (c.termLabel || '').slice(0, 8) + ' ') + (c.schoolYear || c.issuedOn.slice(0, 4));

/** "Track Physik next term?" – subjects on the card with no tests logged in that term */
function Nudges({ card, max = 2 }: { card: ReportCard; max?: number }) {
  const d = useStore(), nav = useNavigate();
  const ex = examAverages(d.tests, termOfCard(card, termStarts()));
  const list = card.lines.filter(l => !ex.has(l.subjectId) && canon(l.subjectId)?.test).slice(0, max);
  if (!list.length) return null;
  return <>{list.map(l => { const c = canon(l.subjectId)!; return (
    <div key={l.subjectId} className="card nudge" data-testid="rc-nudge">
      <span className="nudge-ic">{c.icon}</span>
      <span className="grow"><b>{t('rc_nudge', { subject: subjName(l.subjectId) })}</b><small className="muted">{t('rc_nudge_sub', { g: fmtGrade(card.system, l.value) })}</small></span>
      <button className="btn primary sm" data-testid="rc-nudge-go" onClick={() => nav(`/new?subject=${c.test!.subject}${c.test!.foreign ? '&foreign=' + c.test!.foreign : ''}`)}>{t('rc_nudge_go')}</button>
    </div>); })}</>;
}

export default function ReportCards() {
  const d = useStore(), sys = d.settings.grading;
  const q = useReportCards(!!store.userId);
  const cards = useMemo(() => [...(q.data || [])].sort(byIssued), [q.data]);
  const subjects = [...new Set(cards.flatMap(c => c.lines.map(l => l.subjectId)))];
  const [subj, setSubj] = useState<string>('all');
  const lower = GRADE_SPECS[sys].lowerIsBetter;
  const data = cards.map(c => {
    const l = subj === 'all' ? null : c.lines.find(x => x.subjectId === subj);
    const score = subj === 'all' ? c.avgScore : l?.score;
    return { label: short(c), v: score == null ? null : +avgValue(sys, score).toFixed(2), tip: score == null ? '' : fmtAvg(sys, score, LOCALE()) };
  });
  const latest = cards[cards.length - 1];
  return (
    <section className="page reports" data-testid="reports">
      <header className="home-top"><div><p className="muted small">{t('rc_kicker')}</p><h1 className="page-title">📜 {t('report_cards')}</h1></div>
        <Link className="btn primary sm" to="/reports/new" data-testid="rc-add">+ {t('rc_add')}</Link></header>
      <Link className="card sim-link" to="/reports/simulate" data-testid="sim-open"><span className="nudge-ic">🧮</span><span className="grow"><b>{t('sim_title')}</b><small className="muted">{t('sim_sub')}</small></span><span>→</span></Link>
      {q.isLoading ? <div className="spinner" /> : !cards.length ? (
        <div className="empty-hero"><div className="empty-emoji">📜</div><p>{t('rc_empty')}</p></div>
      ) : <>
        {cards.length > 1 && <div className="card" data-testid="rc-trend">
          <div className="sec-head"><h3>{t('rc_trend')}</h3>
            <select data-testid="rc-trend-subject" value={subj} onChange={e => setSubj(e.target.value)}><option value="all">{t('rc_trend_all')}</option>{subjects.map(s => <option key={s} value={s}>{subjName(s, cards.flatMap(c => c.lines).find(l => l.subjectId === s)?.name)}</option>)}</select></div>
          <div style={{ width: '100%', height: 200 }}><ResponsiveContainer><LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.25} /><XAxis dataKey="label" tick={{ fontSize: 11 }} />
            <YAxis reversed={lower} domain={sys === 'de_grade' ? [1, 6] : sys === 'percent' || sys === 'xofy' ? [0, 100] : [GRADE_SPECS[sys].min, GRADE_SPECS[sys].max]} tick={{ fontSize: 11 }} allowDecimals={false} />
            <Tooltip formatter={(_v, _n, p) => [(p.payload as { tip: string }).tip, subj === 'all' ? t('rc_avg') : subjName(subj)]} />
            <Line type="monotone" dataKey="v" stroke="#3d5afe" strokeWidth={3} dot={{ r: 5 }} connectNulls isAnimationActive={false} />
          </LineChart></ResponsiveContainer></div>
        </div>}
        {latest && <Nudges card={latest} />}
        <div className="rc-list">{[...cards].reverse().map(c => (
          <Link key={c.id} to={'/reports/' + c.id} className="card rc-item" data-testid="rc-item">
            <span className="rc-env">📜</span><span className="grow"><b>{termName(c)}</b><small className="muted">{tp('rc_n_subjects', c.lines.length)} · {new Date(c.issuedOn).toLocaleDateString(LOCALE())}</small></span>
            <b className="rc-avg" data-testid="rc-item-avg">Ø {fmtAvg(c.system, c.avgScore, LOCALE())}</b>
          </Link>))}</div>
      </>}
    </section>
  );
}

export function ReportDetail() {
  const { id = '' } = useParams(), [sp, setSp] = useSearchParams(), nav = useNavigate(), qc = useQueryClient();
  const d = useStore(), q = useReportCards(!!store.userId), rw = useMyRewards(!!store.userId), cheers = useCheers();
  const [opened, setOpened] = useState(false), [share, setShare] = useState<ShareWhat | null>(null), [busy, setBusy] = useState(false), [showPhoto, setShowPhoto] = useState(false);
  const cards = useMemo(() => [...(q.data || [])].sort(byIssued), [q.data]);
  const idx = cards.findIndex(c => c.id === id), card = cards[idx];
  if (q.isLoading) return <div className="spinner" />;
  if (!card) return <section className="page narrow"><TopBar title={t('report_card')} back="/reports" /><div className="empty-hero"><h2>{t('not_found')}</h2></div></section>;
  const prev = idx > 0 ? cards[idx - 1] : null;
  const cmp = compareCards(card, prev);
  const best = idx > 0 && cards.slice(0, idx).every(p => card.avgScore > p.avgScore + 0.01);
  const ex = examAverages(d.tests, termOfCard(card, termStarts()));
  const earned = (rw.data?.earned || []).filter(e => e.cardId === card.id);
  const b = earnedBreakdown(earned);
  const xp = XP.reportCard + Math.min(XP.reportImprovedMax, XP.reportImproved * cmp.improved);
  const unbox = sp.get('unbox') === '1';
  const open = () => { setOpened(true); confetti(); setTimeout(confetti, 500); vibrate([30, 50, 30, 50, 120]); if (d.settings.sound) fanfare(true); };
  const finish = () => { setSp({}, { replace: true }); setOpened(false); };
  const del = async () => {
    if (!confirm(t('rc_delete_confirm'))) return;
    setBusy(true);
    try { await api('/api/report-cards/' + card.id, { method: 'DELETE' }); await Promise.all([qc.invalidateQueries({ queryKey: ['report-cards'] }), qc.invalidateQueries({ queryKey: ['rewards'] })]); nav('/reports', { replace: true }); }
    catch { toast(t('err_generic'), 'bad'); } finally { setBusy(false); }
  };
  const lineRows = card.lines.map((l, i) => {
    const e = ex.get(l.subjectId), gap = gapKind(e?.avg ?? null, l.score), delta = cmp.per[i]?.delta, p = prev?.lines.find(x => x.subjectId === l.subjectId);
    return { l, e, gap, delta, p };
  });
  const badges = [cmp.improved >= 3 && { ic: '📈', txt: tp('rc_improved_n', cmp.improved), tid: 'rc-badge-improved' }, best && { ic: '🏆', txt: t('rc_best_yet'), tid: 'rc-badge-best' }].filter(Boolean) as { ic: string; txt: string; tid: string }[];

  if (unbox) return (
    <div className={'celebrate unbox' + (opened ? ' open' : '')} data-testid="rc-unbox">
      <div className="cel-rays" aria-hidden />
      <div className="cel-inner">
        <p className="cel-kicker">📜 {t('rc_unbox_kicker')} · {termName(card)}</p>
        {!opened ? <button className="envelope" data-testid="rc-unbox-open" onClick={open} aria-label={t('rc_unbox_tap')}><span className="env-flap" /><span className="env-seal">M</span><span className="env-tap">{t('rc_unbox_tap')}</span></button> : <>
          <div className="unbox-paper">
            <div className="unbox-avg" data-testid="rc-unbox-avg">Ø {fmtAvg(card.system, card.avgScore, LOCALE())}</div>
            <ul className="unbox-lines">{lineRows.map(({ l, delta }, i) => (
              <li key={l.subjectId} style={{ ['--i' as string]: i }} data-testid="rc-unbox-line"><span>{subjIcon(l.subjectId)} {subjName(l.subjectId, l.name)}</span><b>{fmtGrade(card.system, l.value)}</b>{delta != null && delta > 0.5 && <i className="up">▲</i>}</li>))}</ul>
          </div>
          {badges.map(x => <p key={x.tid} className="chip good big" data-testid={x.tid}>{x.ic} {x.txt}</p>)}
          <p className="cel-sub" data-testid="rc-unbox-xp">⚡ {t('rc_xp', { n: xp })}</p>
          {(b.grand.length > 0 || b.otherCount > 0) && <div className="unbox-rewards" data-testid="rc-unbox-rewards"><GrandTotal b={b} label={t('rc_earned_total')} /><SupporterBreakdownList b={b} sys={card.system} /></div>}
          <div className="row-btns"><button className="btn ghost-light" onClick={() => setShare({ kind: 'report', card, improved: cmp.improved, best, money: fmtMoney(b.grand) || undefined })}>📤 {t('share')}</button>
            <button className="btn start" data-testid="rc-unbox-done" autoFocus onClick={finish}>{t('rc_unbox_more')}</button></div>
        </>}
      </div>
      {share && <ShareSheet what={share} onClose={() => setShare(null)} />}
    </div>);

  return (
    <section className="page narrow rc-detail" data-testid="rc-detail">
      <TopBar title={'📜 ' + termName(card)} back="/reports" right={<button className="icon-btn" aria-label={t('share')} data-testid="rc-share" onClick={() => setShare({ kind: 'report', card, improved: cmp.improved, best, money: fmtMoney(b.grand) || undefined })}>📤</button>} />
      <div className="card rc-hero">
        <div><span className="muted small">{t('rc_avg')}</span><div className="rc-big" data-testid="rc-avg">Ø {fmtAvg(card.system, card.avgScore, LOCALE())}</div>
          {prev && <small className={cmp.avgDelta! > 0.5 ? 'good' : cmp.avgDelta! < -0.5 ? 'warn' : 'muted'}>{t('rc_prev', { g: fmtAvg(prev.system, prev.avgScore, LOCALE()) })}</small>}</div>
        <div className="rc-badges">{badges.map(x => <span key={x.tid} className="chip good" data-testid={x.tid}>{x.ic} {x.txt}</span>)}</div>
      </div>
      <CheerChips groups={cheersFor(cheers.data, 'report', card.id)} />
      <h3 className="sec-title">{t('rc_vs_tests')}</h3>
      <div className="rc-table">{lineRows.map(({ l, e, gap, delta, p }) => (
        <div key={l.subjectId} className={'rc-row gap-' + gap} data-testid="rc-row" data-subject={l.subjectId}>
          <span className="rc-subj">{subjIcon(l.subjectId)} {subjName(l.subjectId, l.name)}</span>
          <b className="rc-grade" data-testid="rc-row-grade">{fmtGrade(card.system, l.value)}</b>
          {delta != null && Math.abs(delta) > 0.5 && <span className={'rc-delta ' + (delta > 0 ? 'up' : 'down')} title={p ? t('rc_prev', { g: fmtGrade(prev!.system, p.value) }) : ''}>{delta > 0 ? '▲' : '▼'} {p ? fmtGrade(prev!.system, p.value) : ''}</span>}
          <small className="rc-exam muted" data-testid="rc-exam-avg">{e ? t('rc_exam_avg', { g: fmtAvg(card.system, e.avg, LOCALE()) }) : t('rc_no_exams')}</small>
          {gap !== 'none' && <small className="rc-gap" data-testid="rc-gap" data-kind={gap}>{t(('gap_' + gap) as Key)}</small>}
        </div>))}</div>
      <Nudges card={card} max={2} />
      {(b.grand.length > 0 || b.otherCount > 0) && <div className="card" data-testid="rc-rewards"><h3>🎁 {t('rc_rewards_title')}</h3><GrandTotal b={b} /><SupporterBreakdownList b={b} sys={card.system} /></div>}
      <p className="center"><Link className="btn link" to="/reports/simulate">🧮 {t('sim_from_report')}</Link></p>
      {card.hasPhoto && <div className="card"><button className="btn ghost sm" data-testid="rc-photo-toggle" onClick={() => setShowPhoto(!showPhoto)}>🖼️ {t('rc_photo')}</button>
        {showPhoto && <img className="rc-photo" data-testid="rc-photo" src={`/api/report-cards/${card.id}/photo`} alt={t('rc_photo')} />}</div>}
      <p className="center"><button className="btn link danger" disabled={busy} data-testid="rc-delete" onClick={() => void del()}>🗑️ {t('rc_delete')}</button></p>
      {share && <ShareSheet what={share} onClose={() => setShare(null)} />}
    </section>
  );
}
