import { useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import type { Test } from '../../../shared/types';
import { useStore } from '../hooks';
import { store } from '../lib/store';
import { check, containsTerm } from '../lib/check';
import { distractors, shuffle, type Practice, type QCard, type Spec } from '../lib/practice';
import * as S from '../lib/schedule';
import { finishPractice, getActive, getLast, quitPractice, touchActive } from '../lib/activeSession';
import { reportBossDamage } from '../lib/classGames';
import { canSpeak, confetti, fmtWhen, isLong, now, speak, vibrate } from '../lib/util';
import { Logo, RankBadge, Ring } from '../components/ui';
import { levelInfo, rankFor } from '../../../shared/gamification';
import { pick, subjectIcon, t, uiLang, type Key } from '../i18n';

type Btn = { label: string; act: () => void; kind?: 'primary' | 'ghost' | 'bad'; testid?: string };
interface SheetS { kind: 'ok' | 'almost' | 'bad' | 'neutral'; title: string; body?: React.ReactNode; buttons: Btn[]; auto?: boolean }

function Sheet({ s }: { s: SheetS | null }) {
  useEffect(() => {
    if (!s?.auto) return;
    const id = setTimeout(() => s.buttons.find(b => b.kind === 'primary')?.act(), 1100);
    return () => clearTimeout(id);
  }, [s]);
  if (!s) return null;
  return (
    <div className={'sheet ' + s.kind} data-testid="sheet" data-kind={s.kind} role="status">
      <div className="sheet-in">
        <div className="sheet-title">{s.title}</div>
        {s.body && <div className="sheet-body">{s.body}</div>}
        <div className="row-btns">{s.buttons.map((b, i) => <button key={i} autoFocus={b.kind === 'primary'} data-testid={b.testid} className={'btn ' + (b.kind === 'primary' ? 'primary big' : b.kind === 'bad' ? 'bad-btn' : 'ghost')} onClick={b.act}>{b.label}</button>)}</div>
      </div>
    </div>);
}
const artClass = (test: Test, term: string) => {
  if (test.subject !== 'languages' || test.foreign !== 'de') return '';
  const a = (term.match(/^(der|die|das)\s/i) || [])[1];
  return a ? ' art-' + a.toLowerCase() : '';
};
const SpeakBtn = ({ text, lang }: { text: string; lang: Test['foreign'] }) => canSpeak() && lang ? <button className="speak" aria-label={t('listen')} onClick={() => speak(text, lang)}>🔊</button> : null;
const Tag = ({ test }: { test: Test }) => <div className="qtag">{subjectIcon(test.subject)} {test.name}</div>;
function Cloze({ text, reveal }: { text: string; reveal?: boolean }) {
  const parts = text.split(/\[\[(.+?)\]\]/);
  return <div className="prompt cloze">{parts.map((x, i) => i % 2 ? (reveal ? <mark key={i}>{x}</mark> : <span key={i} className="gap">_____</span>) : x)}</div>;
}
function Chars({ set, target }: { set: string; target: React.RefObject<HTMLInputElement | HTMLTextAreaElement>; }) {
  if (!set) return null;
  return <div className="chars">{[...set].map(c => <button key={c} type="button" tabIndex={-1} onMouseDown={e => e.preventDefault()} onClick={() => {
    const el = target.current; if (!el) return;
    const s = el.selectionStart ?? el.value.length, e2 = el.selectionEnd ?? s;
    const v = el.value.slice(0, s) + c + el.value.slice(e2);
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')!.set!; setter.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true })); el.focus(); el.setSelectionRange(s + 1, s + 1);
  }}>{c}</button>)}</div>;
}
interface CardProps { p: Practice; card: QCard; next: () => void; tts: boolean }
const autoSpeak = (tts: boolean, test: Test, text: string) => { if (tts && test.subject === 'languages') speak(text, test.foreign); };
function useAnim() {
  const [anim, setAnim] = useState('');
  return [anim, (c: string) => { setAnim(''); requestAnimationFrame(() => setAnim(c)); }] as const;
}

function StudyCard({ p, card, next, tts }: CardProps) {
  const { test, item } = p.ctx(card.key!), lang = test.subject === 'languages', type = item.type || 'pair';
  useEffect(() => { if (type !== 'cloze') autoSpeak(tts, test, item.term); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (<div className="qcard pop-in" data-testid="card-study">
    <Tag test={test} /><div className="ask"><span className="chip new">✨ {t('new_card')}</span></div>
    {type === 'cloze' ? <Cloze text={item.term} reveal /> : <>
      <div className={'prompt' + (lang ? artClass(test, item.term) : '') + (isLong(item.term) ? ' long' : '')}>{item.term} {lang && <SpeakBtn text={item.term} lang={test.foreign} />}</div>
      <div className="study-arrow">↓</div><div className="answer-big" data-testid="study-answer">{item.meaning}</div></>}
    {item.example && type !== 'cloze' && <div className="example">“{item.example}”</div>}
    {type === 'mc' && !!item.distractors?.length && <div className="hint-line">{t('not_answers')}: {item.distractors.join(' · ')}</div>}
    <p className="muted center small">{t('study_hint')}</p>
    <div className="row-btns"><button className="btn primary big" autoFocus data-testid="studied" onClick={next}>{t('got_it')} →</button></div>
  </div>);
}

function TypedCard({ p, card, next, tts }: CardProps) {
  const sp = p.spec(card) as Spec, key = card.key!, { test, it } = p.ctx(key);
  const [val, setVal] = useState(''), [sheet, setSheet] = useState<SheetS | null>(null), [almost, setAlmost] = useState(false), [anim, play] = useAnim();
  const inp = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  useEffect(() => { const id = setTimeout(() => inp.current?.focus(), 60); return () => clearTimeout(id); }, []);
  const sayTerm = ['meaning', 'produce', 'cloze-ex'].includes(card.kind) || (card.kind === 'cloze' && test.subject === 'languages');
  const termText = card.kind === 'meaning' ? sp.prompt! : sp.answer;
  const cont = (label = t('continue')): Btn => ({ label, act: next, kind: 'primary', testid: 'next' });
  const submit = (dunno: boolean) => {
    if (sheet) return;
    if (!dunno && !val.trim()) { play('shake'); return; }
    const res = check(dunno ? '' : val, sp.answer, { lang: sp.aLang, strict: sp.strict, articles: !!sp.articles });
    if (res.accepted && res.result === 'correct') {
      p.answered(key, true); play('bounce'); vibrate(15); if (sayTerm) autoSpeak(tts, test, termText);
      setSheet({ kind: 'ok', title: '✅ ' + pick('praise'), body: res.why === 'accent' ? t('fb_accent_ok', { a: sp.answer }) : undefined, buttons: [cont()], auto: true });
      return;
    }
    if (res.result === 'almost') {
      const why = t(('why_' + (res.why || 'typo')) as Key);
      if (res.accepted) {
        p.answered(key, true); if (sayTerm) autoSpeak(tts, test, termText);
        setSheet({ kind: 'almost', title: '👍 ' + t('almost_ok'), body: <>{why}<div className="sol">{sp.answer}</div></>, buttons: [cont()] });
        return;
      }
      if (!almost && !it.morning) {
        setAlmost(true); it.struggled = true; play('shake');
        setSheet({ kind: 'almost', title: '🤏 ' + t('so_close'), body: why + ' ' + t('try_again_hint'), buttons: [{ label: t('try_again'), kind: 'primary', testid: 'retry', act: () => { setSheet(null); setTimeout(() => { inp.current?.select(); inp.current?.focus(); }, 30); } }] });
        return;
      }
    }
    p.answered(key, false); play('shake'); vibrate([30, 40, 30]); if (sayTerm) autoSpeak(tts, test, termText);
    const btns: Btn[] = [];
    if (!sp.strict && !dunno) btns.push({ label: t('i_was_right'), kind: 'ghost', testid: 'override', act: () => { p.override(key); next(); } });
    btns.push(cont(t('got_it')));
    setSheet({ kind: 'bad', title: dunno ? '📘 ' + t('here_it_is') : '❌ ' + t('not_quite'), body: <>{t('correct_answer')}<div className="sol" data-testid="solution">{sp.answer}</div>{!it.morning && <div className="small">{t('comes_back')}</div>}</>, buttons: btns });
  };
  const reveal = () => {
    if (sheet) return;
    const res = val.trim() ? check(val, sp.answer, { lang: sp.aLang, strict: false }) : null;
    if (res?.accepted) { p.answered(key, true); play('bounce'); setSheet({ kind: 'ok', title: '✅ ' + pick('praise'), body: <div className="sol">{sp.answer}</div>, buttons: [cont()] }); return; }
    const grade = (ok: boolean) => { p.answered(key, ok); if (ok) next(); else setSheet({ kind: 'bad', title: '💪 ' + t('no_worries'), body: t('comes_back'), buttons: [cont()] }); };
    setSheet({ kind: 'neutral', title: '🔎 ' + t('compare'), body: <>{val.trim() && <div className="small muted">{t('you_wrote')}: {val}</div>}<div className="sol">{sp.answer}</div></>, buttons: [{ label: t('not_yet'), kind: 'bad', testid: 'self-no', act: () => grade(false) }, { label: t('i_knew'), kind: 'primary', testid: 'self-yes', act: () => grade(true) }] });
  };
  return (<>
    <div className={'qcard pop-in ' + anim} data-testid={'card-' + card.kind}>
      <Tag test={test} />
      <div className="ask">{sp.ask} {sp.chip && <span className="chip">{sp.chip}</span>} {it.morning && <span className="chip warm">{t('written_once')}</span>}</div>
      {sp.cloze ? <><Cloze text={sp.cloze} />{sp.hint && <div className="hint-line">💡 {sp.hint}</div>}</>
        : <div className={'prompt' + (sp.speakP ? artClass(test, sp.prompt!) : '') + (isLong(sp.prompt!) ? ' long' : '')} data-testid="prompt">{sp.prompt} {sp.speakP && <SpeakBtn text={sp.prompt!} lang={sp.pLang ?? null} />}</div>}
      {sp.self ? <>
        <textarea ref={inp} rows={2} data-testid="answer" value={val} onChange={e => setVal(e.target.value)} placeholder={t('type_optional')} autoComplete="off" autoCapitalize="off" spellCheck={false} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); reveal(); } }} />
        <div className="row-btns"><button className="btn primary big" data-testid="reveal" onClick={reveal}>{t('show_answer')}</button></div>
      </> : <form onSubmit={e => { e.preventDefault(); submit(false); }}>
        <input ref={inp} type="text" data-testid="answer" value={val} onChange={e => setVal(e.target.value)} placeholder={t('type_answer')} autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false} enterKeyHint="done" readOnly={!!sheet && sheet.kind !== 'almost'} />
        <Chars set={p.chars(test, sp.strict)} target={inp} />
        <div className="row-btns"><button type="button" className="btn ghost" data-testid="dunno" onClick={() => submit(true)}>{t('dont_know')}</button><button type="submit" className="btn primary big" data-testid="check">{t('check')}</button></div>
      </form>}
    </div>
    <Sheet s={sheet} />
  </>);
}

function McCard({ p, card, next, tts }: CardProps) {
  const key = card.key!, { test, item, it } = p.ctx(key), lang = test.subject === 'languages';
  const [phase, setPhase] = useState<'think' | 'choose'>('think'), [picked, setPicked] = useState<number | null>(null), [sheet, setSheet] = useState<SheetS | null>(null);
  const opts = useMemo(() => shuffle([item.meaning, ...distractors(test, item)]), []); // eslint-disable-line react-hooks/exhaustive-deps
  const choose = (i: number) => {
    if (picked != null) return;
    const ok = opts[i] === item.meaning; setPicked(i); p.answered(key, ok);
    if (lang) autoSpeak(tts, test, item.term);
    if (ok) { vibrate(15); setSheet({ kind: 'ok', title: '✅ ' + pick('praise'), buttons: [{ label: t('continue'), act: next, kind: 'primary', testid: 'next' }], auto: true }); }
    else { vibrate([30, 40, 30]); setSheet({ kind: 'bad', title: '❌ ' + t('not_quite'), body: <>{t('correct_answer')}<div className="sol">{item.meaning}</div>{!it.morning && <div className="small">{t('comes_back')}</div>}</>, buttons: [{ label: t('got_it'), act: next, kind: 'primary', testid: 'next' }] }); }
  };
  return (<>
    <div className="qcard pop-in" data-testid="card-mc">
      <Tag test={test} />
      <div className="ask">{phase === 'think' ? t('mc_think') : t('mc_choose')}</div>
      <div className={'prompt' + (lang ? artClass(test, item.term) : '') + (isLong(item.term) ? ' long' : '')} data-testid="prompt">{item.term} {lang && <SpeakBtn text={item.term} lang={test.foreign} />}</div>
      {phase === 'think' ? <>
        <div className="think-bubble">🤔 {t('mc_think_hint')}</div>
        <div className="row-btns"><button className="btn primary big" autoFocus data-testid="mc-show" onClick={() => setPhase('choose')}>{t('show_options')}</button></div>
      </> : <div className="opts">{opts.map((o, i) => <button key={i} data-testid="mc-opt" disabled={picked != null} className={'opt' + (picked != null && o === item.meaning ? ' right' : picked === i ? ' wrong' : '')} onClick={() => choose(i)}><b>{'ABCD'[i]}</b><span>{o}</span></button>)}</div>}
    </div>
    <Sheet s={sheet} />
  </>);
}

function MatchCard({ p, card, next }: CardProps) {
  const keys = card.keys!, { test } = p.ctx(keys[0]);
  const [dir, setDir] = useState(1), [matched, setMatched] = useState<Set<string>>(new Set()), [order, setOrder] = useState(() => [shuffle(keys), shuffle(keys)]);
  const [sel, setSel] = useState<{ l?: string; r?: string }>({}), [wrong, setWrong] = useState<{ l?: string; r?: string }>({}), [sheet, setSheet] = useState<SheetS | null>(null);
  const txt = (k: string, side: 'term' | 'meaning') => { const { item } = p.ctx(k); return side === 'term' ? item.term : item.meaning; };
  const left = dir === 1 ? 'meaning' : 'term', right = dir === 1 ? 'term' : 'meaning';
  const tap = (k: string, w: 'l' | 'r') => {
    const s = { ...sel, [w]: k }; setWrong({});
    if (!s.l || !s.r) { setSel(s); return; }
    setSel({});
    if (s.l === s.r) {
      vibrate(10); p.answers++;
      const m = new Set(matched); m.add(k); setMatched(m);
      if (m.size === keys.length) {
        if (dir === 1) setTimeout(() => { setDir(2); setMatched(new Set()); setOrder([shuffle(keys), shuffle(keys)]); }, 450);
        else { p.matchDone(keys); setTimeout(() => setSheet({ kind: 'ok', title: '🧩 ' + t('match_done'), buttons: [{ label: t('continue'), act: next, kind: 'primary', testid: 'next' }] }), 300); }
      }
    } else { p.items[s.l].struggled = true; p.items[s.r].struggled = true; vibrate([30, 40, 30]); setWrong(s); }
  };
  const col = (side: 'term' | 'meaning', ord: string[], w: 'l' | 'r') => ord.map(k => <button key={k} data-testid={'m-' + w} data-k={k} disabled={matched.has(k)} onClick={() => tap(k, w)}
    className={'mitem' + (matched.has(k) ? ' done' : '') + (sel[w] === k ? ' sel' : '') + (wrong[w] === k ? ' wrong' : '')}>{txt(k, side)}</button>);
  return (<>
    <div className="qcard pop-in" data-testid="card-match" key={dir}>
      <Tag test={test} /><div className="ask">{t('match_ask')} <span className="chip">{dir}/2</span></div>
      <p className="muted small">{dir === 1 ? t('match_dir1') : t('match_dir2')}</p>
      <div className="mgrid"><div>{col(left, order[0], 'l')}</div><div>{col(right, order[1], 'r')}</div></div>
    </div>
    <Sheet s={sheet} />
  </>);
}

function SentenceCard({ p, card, next, tts }: CardProps) {
  const key = card.key!, { test, item } = p.ctx(key);
  const [val, setVal] = useState(''), [sheet, setSheet] = useState<SheetS | null>(null), [anim, play] = useAnim();
  const inp = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { autoSpeak(tts, test, item.term); const id = setTimeout(() => inp.current?.focus(), 60); return () => clearTimeout(id); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const go = (dunno: boolean) => {
    if (sheet) return;
    if (dunno) { p.answered(key, false); setSheet({ kind: 'bad', title: '📘 ' + t('here_it_is'), body: <>{t('example_sentence')}<div className="sol">{item.example || item.term}</div><div className="small">{t('comes_back')}</div></>, buttons: [{ label: t('got_it'), act: next, kind: 'primary', testid: 'next' }] }); return; }
    const enough = val.trim().split(/\s+/).length >= 3;
    if (!enough || !containsTerm(val, item.term, test.foreign || undefined)) {
      play('shake');
      setSheet({ kind: 'almost', title: '✍️ ' + t('sentence_fix'), body: !enough ? t('sentence_short') : t('sentence_missing', { w: item.term }), buttons: [{ label: t('try_again'), kind: 'primary', testid: 'retry', act: () => { setSheet(null); setTimeout(() => inp.current?.focus(), 30); } }] });
      return;
    }
    p.answered(key, true); play('bounce');
    setSheet({ kind: 'ok', title: '✍️ ' + t('sentence_ok'), body: <>{t('self_check_sentence')}{item.example && <div className="small muted">{t('example_sentence')} {item.example}</div>}</>, buttons: [{ label: t('continue'), act: next, kind: 'primary', testid: 'next' }] });
  };
  return (<>
    <div className={'qcard pop-in ' + anim} data-testid="card-sentence">
      <Tag test={test} /><div className="ask">{t('ask_sentence')}</div>
      <div className={'prompt' + artClass(test, item.term)}>{item.term} <SpeakBtn text={item.term} lang={test.foreign} /></div>
      <div className="hint-line">{item.meaning}</div>
      <textarea ref={inp} rows={3} data-testid="answer" value={val} onChange={e => setVal(e.target.value)} placeholder={t('sentence_ph')} autoCapitalize="sentences" spellCheck={false} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); go(false); } }} />
      <Chars set={p.chars(test, true)} target={inp} />
      <div className="row-btns"><button className="btn ghost" data-testid="dunno" onClick={() => go(true)}>{t('no_idea')}</button><button className="btn primary big" data-testid="check" onClick={() => go(false)}>{t('check')}</button></div>
    </div>
    <Sheet s={sheet} />
  </>);
}

export function SessionPage() {
  const nav = useNavigate(), d = useStore(), p = getActive();
  const [step, setStep] = useState(0);
  const stepRef = useRef(0);
  const card = p ? p.current() : null;
  const finished = !!p && !card;
  useEffect(() => { if (finished) { finishPractice(); nav('/done', { replace: true }); } }, [finished]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!p) return <Navigate to={getLast() ? '/done' : '/'} replace />;
  if (!card) return null; // finishPractice in the effect below navigates to /done
  const mine = step;
  const next = () => { if (stepRef.current !== mine) return; stepRef.current++; p.next(); setStep(stepRef.current); };
  const props: CardProps = { p, card, next, tts: d.settings.tts };
  const pct = p.total ? Math.round(p.done / p.total * 100) : 0;
  const view = card.kind === 'study' ? <StudyCard {...props} /> : card.kind === 'mc' ? <McCard {...props} /> : card.kind === 'match' ? <MatchCard {...props} /> : card.kind === 'sentence' ? <SentenceCard {...props} /> : <TypedCard {...props} />;
  return (
    <div className="ses" data-testid="session" onPointerDownCapture={touchActive} onKeyDownCapture={touchActive}>
      <div className="ses-top">
        <button className="icon-btn" aria-label={t('close')} data-testid="quit" onClick={() => { if (p.done === 0 || confirm(t('quit_confirm'))) { quitPractice(); nav('/', { replace: true }); } }}>✕</button>
        <div className="bar"><i style={{ width: pct + '%' }} /></div>
        <span className="ses-count" data-testid="ses-count">{p.done}/{p.total}</span>
      </div>
      <div className="ses-stage" key={step}>{view}</div>
    </div>
  );
}

export function DonePage() {
  const nav = useNavigate(), d = useStore(), s = getLast(), ts = now();
  useEffect(() => { if (s) { confetti(); vibrate([20, 50, 20]); } }, [s]);
  useEffect(() => {
    if (!s?.sessionId || !s.correct) return;
    void reportBossDamage({ sessionId: s.sessionId, correct: s.correct, tests: s.tests });
  }, [s?.sessionId]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!s) return <Navigate to="/" replace />;
  const pct = s.done ? Math.round(s.firstTry / s.done * 100) : 0, mins = Math.max(1, Math.round(s.activeMs / 60000)), streak = store.liveStreak(ts);
  const gained = (s.xpAfter ?? 0) - (s.xpBefore ?? 0), li = levelInfo(s.xpAfter ?? 0), rank = rankFor(li.level);
  const tests = s.tests.map(id => store.test(id)).filter((x): x is Test => !!x);
  const nexts = tests.map(x => S.nextDueAt(x, ts)).filter((x): x is number => x != null).sort((a, b) => a - b);
  const left = S.buildSession(d.tests, ts, d.settings.sessionSize).entries.length;
  return (
    <section className="done page narrow" data-testid="done">
      <div className="done-hero pop-in"><Logo size={88} className="bounce-in" /><h1>{pick('cheers')}</h1><p className="muted">{t('done_sub', { n: s.done })}</p></div>
      <div className="xp-gain pop-in" data-testid="xp-gain" style={{ ['--c1' as string]: rank.c1, ['--c2' as string]: rank.c2 }}>
        <RankBadge rank={rank} size={54} />
        <div><b className="xp-plus">+{gained} XP</b><span className="muted small">{t('lvl')} {li.level} · {rank.name[uiLang()]} · {t('xp_to_next', { n: li.next - li.xp, l: li.level + 1 })}</span>
          <div className="xpbar big"><i style={{ width: li.pct + '%' }} /></div></div>
      </div>
      <div className="stat-row">
        <div className="stat"><Ring pct={pct} size={74} stroke={7} label={pct + '%'} /><span>{t('first_try')}</span></div>
        <div className="stat"><b className="big-num">{mins}</b><span>{t('minutes')}</span></div>
        <div className="stat"><b className="big-num">🔥{streak}</b><span>{t('streak')}</span></div>
      </div>
      <div className="done-next">{left > 0 ? t('more_today', { n: left }) : nexts.length ? t('next_session', { when: fmtWhen(nexts[0]) }) : t('all_done')}</div>
      <div className="row-btns col">{tests.map(x => <div key={x.id} className="mini-test"><span>{x.name}</span><Ring pct={S.mastery(x)} size={38} stroke={4} /></div>)}</div>
      <button className="btn primary big wide" data-testid="done-home" onClick={() => nav('/', { replace: true })}>{t('finish')}</button>
    </section>
  );
}
