import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ResultDialog } from '../components/ResultDialog';
import { ParentInvite } from '../components/ParentInvite';
import { EarnCards } from '../components/Rewards';
import { useStore } from '../hooks';
import { store } from '../lib/store';
import * as S from '../lib/schedule';
import { countdown, fmtTime, fmtWhen, now } from '../lib/util';
import { extraEntries, startPractice } from '../lib/activeSession';
import { LevelChip, Logo, Ring, SyncBadge } from '../components/ui';
import { t, tp, testIcon } from '../i18n';
import type { Test } from '../../../shared/types';

function WeekDots({ days, today }: { days: Set<string>; today: string }) {
  const dow = (new Date(today + 'T12:00:00').getDay() + 6) % 7;
  const cells = t('week_letters').split('|').map((lab, i) => {
    const iso = S.addDays(today, i - dow);
    return { lab, iso, on: days.has(iso), today: iso === today };
  });
  return (
    <div className="week-dots" role="img" aria-label={t('this_week')}>
      {cells.map(c => <span key={c.iso} className={'wd' + (c.on ? ' on' : '') + (c.today ? ' today' : '')}><i />{c.lab}</span>)}
    </div>
  );
}

function HeroMeta({ streak, days, today, doneToday, goal }: { streak: number; days: Set<string>; today: string; doneToday: number; goal: number }) {
  const pct = goal > 0 ? Math.min(100, Math.round(doneToday / goal * 100)) : 0;
  return (
    <>
      <div className="hero-streak">
        <div className="hero-streak-num" data-testid="home-streak"><b>{streak}</b><span>{tp('day_streak', streak)}</span></div>
        <WeekDots days={days} today={today} />
      </div>
      {goal > 0 && <div className="goal">
        <div className="goal-top"><span>{t('daily_goal')}</span><b>{doneToday}/{goal}</b></div>
        <div className="goal-bar" role="progressbar" aria-valuemin={0} aria-valuenow={Math.min(doneToday, goal)} aria-valuemax={goal}><i style={{ width: pct + '%' }} /></div>
      </div>}
    </>
  );
}

export function Home() {
  const d = useStore(), nav = useNavigate(), ts = now();
  const [ask, setAsk] = useState<Test | null>(null);
  const askable = d.tests.filter(x => S.phase(x, ts) === 'past' && !x.result && !x.resultSkipped && x.items.length);
  const streak = store.liveStreak(ts);
  const sess = S.buildSession(d.tests, ts, d.settings.sessionSize);
  const total = S.todayCount(d.tests, ts);
  const todayIso = S.dayISO(ts);
  const doneToday = d.history.filter(h => h.day === todayIso).reduce((n, h) => n + (h.n || 0), 0);
  const goal = doneToday + total;
  const practised = new Set(d.history.map(h => h.day));
  const meta = <HeroMeta streak={streak} days={practised} today={todayIso} doneToday={doneToday} goal={goal} />;
  const hr = new Date(ts).getHours();
  const greet = hr < 11 ? t('greet_morning') : hr < 18 ? t('greet_day') : t('greet_evening');
  const active = d.tests.filter(x => S.phase(x, ts) !== 'past').sort((a, b) => a.testDate.localeCompare(b.testDate));
  const past = d.tests.filter(x => S.phase(x, ts) === 'past');
  const go = (entries: S.SessionEntry[]) => { if (startPractice(entries)) nav('/practice'); };

  let hero;
  if (!d.tests.length) {
    hero = (
      <div className="empty-hero pop-in" data-testid="empty-home">
        <div className="empty-art"><Logo size={96} /><span className="float f1">📄</span><span className="float f2">📸</span><span className="float f3">✨</span></div>
        <h2>{t('empty_title')}</h2><p>{t('empty_text')}</p>
        <button className="btn primary big wide" onClick={() => nav('/new')}>📸 {t('empty_cta')}</button>
      </div>);
  } else if (sess.entries.length) {
    const mins = Math.max(2, Math.round(sess.entries.length * 0.45)), rest = total - sess.entries.length;
    const night = active.filter(x => S.phase(x, ts) === 'nightBefore').map(x => x.name), morning = active.filter(x => S.phase(x, ts) === 'testDay').map(x => x.name);
    hero = (
      <div className="hero-card pop-in" data-testid="hero">
        <div className="hero-top"><span className="hero-k">{t('daily_review')}</span></div>
        {meta}
        <h2>{tp('hero_ready', sess.entries.length)}</h2>
        <p className="hero-sub">{t('hero_sub', { m: mins })}{rest > 0 ? ' · ' + t('hero_more', { n: rest }) : ''}</p>
        {night.length > 0 && <div className="hero-note">🌙 {t('night_note', { tests: night.join(', ') })}</div>}
        {morning.length > 0 && <div className="hero-note">☀️ {t('morning_note', { tests: morning.join(', ') })}</div>}
        <button className="btn start" data-testid="start-today" onClick={() => go(sess.entries)}>▶ {t('start_today')}</button>
      </div>);
  } else {
    const nexts = active.map(x => S.nextDueAt(x, ts)).filter((x): x is number => x != null).sort((a, b) => a - b);
    const later = active.reduce((n, x) => n + S.laterToday(x, ts).length, 0);
    const extra = extraEntries(active, d.settings.sessionSize);
    const extraMins = Math.max(2, Math.round(extra.length * 0.45));
    hero = (
      <div className="hero-card done pop-in" data-testid="hero-done">
        <div className="hero-top"><span className="hero-k">{t('daily_review')}</span></div>
        {meta}
        <h2>{active.length ? t('all_done') : t('no_active')}</h2>
        <p className="hero-sub">{later ? tp('later_today', later, { time: fmtTime(nexts[0]) }) : nexts.length ? t('next_session', { when: fmtWhen(nexts[0]) }) : t('add_test_hint')}</p>
        {active.some(x => x.items.length) && extra.length > 0 && (
          <button className="btn start sm extra-cta" data-testid="extra-round" onClick={() => go(extra)}>
            {t('extra_round')}<small>{tp('extra_round_sub', extra.length, { m: extraMins })}</small>
          </button>
        )}
      </div>);
  }
  const card = (x: Test) => {
    const cd = countdown(x), m = S.mastery(x), due = S.dueReviews(x, ts).length + S.newItems(x, ts).length;
    return (
      <button key={x.id} className="test-card" data-testid="test-card" onClick={() => nav('/test/' + x.id)}>
        <span className="tc-icon">{testIcon(x)}</span>
        <span className="tc-main"><b>{x.name}</b>
          <span className="tc-sub">{x.items.length ? <>{tp('n_cards', x.items.length)}{due > 0 && <> · <em>{tp('n_due', due)}</em></>}</> : <em className="warn">{t('no_cards_yet')}</em>}</span></span>
        <span className={'cd ' + cd.cls}>{cd.label}</span>
        <Ring pct={m} size={46} stroke={5} />
      </button>);
  };
  return (
    <section className="home page">
      <header className="home-top">
        <div><p className="muted small">{greet}</p><h1 className="page-title">{t('today')}</h1></div>
        <div className="home-top-r only-mobile"><SyncBadge /><LevelChip /></div>
      </header>
      <div className="home-grid">
        <div className="home-main">{askable.map(x => (
          <button key={x.id} className="ask-card pop-in" data-testid="ask-result" onClick={() => setAsk(x)}>
            <span className="tc-icon">{testIcon(x)}</span><span><b>{t('how_did_it_go')}</b><small>{x.name}</small></span><span className="btn primary sm">{t('enter_result')}</span>
          </button>))}{hero}
          {active.length > 0 && <>
            <div className="sec-head carousel-head"><h3>{t('your_tests')}</h3></div>
            <div className="test-carousel" data-testid="test-carousel">{active.map(card)}</div>
          </>}
          <ParentInvite /><EarnCards /></div>
        {(active.length > 0 || past.length > 0) && <div className="home-side">
          <div className="sec-head"><h3>{t('your_tests')}</h3><button className="btn link only-mobile" onClick={() => nav('/new')}>+ {t('new_test')}</button></div>
          {active.length > 0 && <div className="test-list">{active.map(card)}</div>}
          {past.length > 0 && <details className="past"><summary>{t('past_tests', { n: past.length })}</summary><div className="test-list">{past.map(card)}</div></details>}
        </div>}
      </div>
    {ask && <ResultDialog test={ask} onClose={() => setAsk(null)} />}
    </section>
  );
}
