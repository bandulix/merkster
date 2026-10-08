/* Progression: XP, levels, ranks, streaks (with freezes) and badges.
   Everything is DERIVED deterministically from the practice history + tests, so it syncs for free,
   can be recomputed on the server, and can't drift. XP rewards effortful retrieval, not idle time:
   - correct recalls (+first-try bonus) with a soft daily cap, session completion, daily streak,
     finishing a spaced plan before a test, and – deliberately smaller – entering exam results.
   - practice minutes are "active" minutes only (the session engine pauses after 90 s idle). */
import type { HistoryEntry, Test, UiLang } from './types';
import { toPct } from './grades';

export const XP = { correct: 2, firstTry: 1, session: 10, shortSession: 3, streakPerDay: 2, streakMaxDays: 10, plan: 50, result: 15, personalBest: 25, badge: 20, dailySoftCap: 400, cheer: 5, cheerDailyCap: 15, reportCard: 30, reportImproved: 5, reportImprovedMax: 25 } as const;
export const IDLE_MS = 90_000;

/* ---------- levels ---------- */
/** total XP needed to reach level L (L1 = 0). Smooth power curve with an early win: L2 = 40 (one real first session), L5 ≈ 300, L10 ≈ 1k, L20 ≈ 3.1k, L50 ≈ 13k */
export const xpToReach = (L: number) => (L <= 1 ? 0 : Math.round(30 * Math.pow(L - 1, 1.55) + 10 * (L - 1)));
export function levelInfo(xp: number) {
  let L = 1; while (xpToReach(L + 1) <= xp) L++;
  const start = xpToReach(L), next = xpToReach(L + 1);
  return { level: L, xp, start, next, into: xp - start, need: next - start, pct: Math.round((xp - start) / (next - start) * 100) };
}

/* ---------- ranks (space theme) ---------- */
export interface Rank { id: string; level: number; name: Record<UiLang, string>; c1: string; c2: string; glow: string }
export const RANKS: Rank[] = [
  { id: 'rookie', level: 1, name: { en: 'Rookie', de: 'Rookie' }, c1: '#94a3b8', c2: '#64748b', glow: '#cbd5e1' },
  { id: 'spark', level: 3, name: { en: 'Spark', de: 'Funke' }, c1: '#fbbf24', c2: '#f97316', glow: '#fde68a' },
  { id: 'comet', level: 6, name: { en: 'Comet', de: 'Komet' }, c1: '#22d3ee', c2: '#0ea5e9', glow: '#a5f3fc' },
  { id: 'rocket', level: 10, name: { en: 'Rocket', de: 'Rakete' }, c1: '#f472b6', c2: '#e11d48', glow: '#fbcfe8' },
  { id: 'satellite', level: 15, name: { en: 'Satellite', de: 'Satellit' }, c1: '#34d399', c2: '#059669', glow: '#a7f3d0' },
  { id: 'nova', level: 20, name: { en: 'Nova', de: 'Nova' }, c1: '#a78bfa', c2: '#7c3aed', glow: '#ddd6fe' },
  { id: 'pulsar', level: 26, name: { en: 'Pulsar', de: 'Pulsar' }, c1: '#60a5fa', c2: '#4f46e5', glow: '#bfdbfe' },
  { id: 'supernova', level: 33, name: { en: 'Supernova', de: 'Supernova' }, c1: '#fb923c', c2: '#db2777', glow: '#fed7aa' },
  { id: 'galaxy', level: 41, name: { en: 'Galaxy', de: 'Galaxie' }, c1: '#c084fc', c2: '#2563eb', glow: '#e9d5ff' },
  { id: 'legend', level: 50, name: { en: 'Legend', de: 'Legende' }, c1: '#fde047', c2: '#d97706', glow: '#fef9c3' }
];
export const rankFor = (level: number) => { let r = RANKS[0]; for (const x of RANKS) if (level >= x.level) r = x; return r; };
export const rankIndex = (level: number) => RANKS.indexOf(rankFor(level));

/* ---------- badges ---------- */
export interface BadgeDef { id: string; icon: string; name: Record<UiLang, string>; desc: Record<UiLang, string> }
export const BADGES: BadgeDef[] = [
  { id: 'first_session', icon: '🚀', name: { en: 'Lift-off', de: 'Abheben' }, desc: { en: 'Finish your first session', de: 'Erste Übungsrunde geschafft' } },
  { id: 'streak_3', icon: '🔥', name: { en: 'On fire', de: 'Angezündet' }, desc: { en: '3-day streak', de: '3 Tage in Folge' } },
  { id: 'streak_7', icon: '⚡', name: { en: 'Week warrior', de: 'Wochen-Held' }, desc: { en: '7-day streak', de: '7 Tage in Folge' } },
  { id: 'streak_30', icon: '🌋', name: { en: 'Unstoppable', de: 'Unaufhaltsam' }, desc: { en: '30-day streak', de: '30 Tage in Folge' } },
  { id: 'streak_100', icon: '👑', name: { en: 'Streak royalty', de: 'Serien-König:in' }, desc: { en: '100-day streak', de: '100 Tage in Folge' } },
  { id: 'freeze_saved', icon: '🧊', name: { en: 'Ice cold', de: 'Eiskalt' }, desc: { en: 'A streak freeze saved your streak', de: 'Ein Serien-Schutz hat deine Serie gerettet' } },
  { id: 'spaced_out', icon: '🪐', name: { en: 'Spaced out', de: 'Gut verteilt' }, desc: { en: 'Practise on 5 different days before one test', de: 'An 5 verschiedenen Tagen vor einem Test geübt' } },
  { id: 'planner', icon: '🗓️', name: { en: 'Planner', de: 'Planer:in' }, desc: { en: 'Start a week early and practise on 3 days', de: 'Eine Woche vorher angefangen und an 3 Tagen geübt' } },
  { id: 'plan_done', icon: '🏁', name: { en: 'Mission complete', de: 'Mission erfüllt' }, desc: { en: 'Follow a test plan to the end', de: 'Einen Testplan bis zum Ende durchgezogen' } },
  { id: 'early_bird', icon: '🐦', name: { en: 'Early bird', de: 'Frühaufsteher:in' }, desc: { en: 'Practise before 8 am', de: 'Vor 8 Uhr geübt' } },
  { id: 'night_owl', icon: '🦉', name: { en: 'Night owl', de: 'Nachteule' }, desc: { en: 'Practise after 9 pm (not the night before a test – no cramming!)', de: 'Nach 21 Uhr geübt (nicht am Vorabend eines Tests – kein Pauken!)' } },
  { id: 'flawless', icon: '💎', name: { en: 'Flawless', de: 'Makellos' }, desc: { en: '10+ cards, all right on the first try', de: '10+ Karten, alle beim ersten Versuch richtig' } },
  { id: 'recall_100', icon: '🧠', name: { en: 'Brain gains', de: 'Hirn-Power' }, desc: { en: '100 correct recalls', de: '100 richtige Abrufe' } },
  { id: 'recall_1000', icon: '🌌', name: { en: 'Memory galaxy', de: 'Gedächtnis-Galaxie' }, desc: { en: '1000 correct recalls', de: '1000 richtige Abrufe' } },
  { id: 'polyglot', icon: '🌍', name: { en: 'Polyglot', de: 'Sprachtalent' }, desc: { en: 'Tests in 3 different languages', de: 'Tests in 3 verschiedenen Sprachen' } },
  { id: 'first_result', icon: '📝', name: { en: 'Results are in', de: 'Ergebnis da' }, desc: { en: 'Log your first exam result', de: 'Erstes Testergebnis eingetragen' } },
  { id: 'personal_best', icon: '🏆', name: { en: 'Personal best', de: 'Persönlicher Rekord' }, desc: { en: 'Beat your best result so far', de: 'Dein bestes Ergebnis übertroffen' } },
  { id: 'comeback', icon: '📈', name: { en: 'Comeback', de: 'Comeback' }, desc: { en: 'Improve on your last result in a subject', de: 'Im Fach besser als beim letzten Mal' } },
  { id: 'fan_club', icon: '📣', name: { en: 'Fan club', de: 'Fanclub' }, desc: { en: 'Get 3 cheers from your supporters', de: '3-mal von deinen Fans angefeuert' } },
  { id: 'rc_first', icon: '📜', name: { en: 'Report card logged', de: 'Zeugnis eingetragen' }, desc: { en: 'Log your first report card', de: 'Dein erstes Zeugnis eingetragen' } },
  { id: 'rc_improved3', icon: '📈', name: { en: 'Improved in 3 subjects', de: 'In 3 Fächern verbessert' }, desc: { en: 'A report card better than the last one in 3 subjects', de: 'Ein Zeugnis, das in 3 Fächern besser ist als das letzte' } },
  { id: 'rc_best', icon: '🏅', name: { en: 'Best report card yet', de: 'Bestes Zeugnis bisher' }, desc: { en: 'Your best report card average so far', de: 'Dein bester Zeugnisdurchschnitt bisher' } }
];
export const badgeDef = (id: string) => BADGES.find(b => b.id === id);

/* ---------- dates (local time) ---------- */
export const dayOf = (ts: number) => { const d = new Date(ts); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const dayTs = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d).getTime(); };
const plusDays = (iso: string, n: number) => { const [y, m, d] = iso.split('-').map(Number); return dayOf(new Date(y, m - 1, d + n).getTime()); };
/** when the session ended; old entries without a timestamp count as noon */
export const sessionAt = (h: HistoryEntry) => h.at ?? dayTs(h.day) + 12 * 3600e3;
export const activeMsOf = (h: HistoryEntry) => h.activeMs ?? h.ms ?? 0;
export const correctOf = (h: HistoryEntry) => h.correct ?? h.n ?? 0;

export interface XpEvent { at: number; kind: 'session' | 'streak' | 'plan' | 'result' | 'personal_best' | 'badge' | 'cheer' | 'report'; xp: number; ref?: string }
/** a received cheer (supporter reaction), reduced to what progression needs */
export interface CheerLite { at: number; target: string; from: string }
export interface Progress {
  xp: number; level: number; rank: Rank; info: ReturnType<typeof levelInfo>;
  streak: { current: number; best: number; freezes: number; activeToday: boolean; frozenDays: string[]; next: number };
  badges: { id: string; at: number }[];
  events: XpEvent[];
  totals: { sessions: number; correct: number; activeMin: number; days: number };
  week: { sessions: number; correct: number; activeMin: number; xp: number; days: number };
}
const STREAK_MILESTONES = [3, 7, 14, 30, 50, 100, 200, 365];

/** a confirmed report card, reduced to what progression needs (improved = subjects better than on the previous card, best = best average so far) */
export interface CardLite { id: string; at: number; improved: number; best: boolean }
export function computeProgress(history: HistoryEntry[], tests: Test[], nowTs: number, cheers: CheerLite[] = [], cards: CardLite[] = []): Progress {
  const today = dayOf(nowTs);
  const sessions = [...history].sort((a, b) => sessionAt(a) - sessionAt(b));
  const activeDays = new Set(sessions.map(s => s.day));

  /* streak pass: every 7 practice days in a row earn a freeze (max 2); a missed day uses one */
  const streakOn: Record<string, number> = {}; const frozenDays: string[] = [];
  let streak = 0, best = 0, freezes = 0, earn = 0;
  const first = sessions.length ? sessions[0].day : today;
  for (let d = first, guard = 0; d <= today && guard < 3000; d = plusDays(d, 1), guard++) {
    if (activeDays.has(d)) { streak++; earn++; if (earn >= 7) { freezes = Math.min(2, freezes + 1); earn = 0; } best = Math.max(best, streak); }
    else if (d !== today) { if (streak > 0 && freezes > 0) { freezes--; frozenDays.push(d); } else { streak = 0; earn = 0; } }
    streakOn[d] = streak;
  }

  /* timeline */
  type Ev = { at: number; type: 'session'; h: HistoryEntry } | { at: number; type: 'result'; t: Test } | { at: number; type: 'plan'; t: Test } | { at: number; type: 'created'; t: Test } | { at: number; type: 'cheer'; c: CheerLite } | { at: number; type: 'report'; r: CardLite };
  const evs: Ev[] = sessions.map(h => ({ at: sessionAt(h), type: 'session' as const, h }));
  for (const t of tests) {
    if (t.result) evs.push({ at: t.result.enteredAt, type: 'result', t });
    if (t.testDate < today) evs.push({ at: dayTs(t.testDate) + 20 * 3600e3, type: 'plan', t });
    evs.push({ at: dayTs(t.created || today), type: 'created', t });
  }
  for (const c of cheers) evs.push({ at: c.at, type: 'cheer', c });
  for (const r of cards) evs.push({ at: r.at, type: 'report', r });
  evs.sort((a, b) => a.at - b.at);

  let xp = 0, correctTotal = 0, nSessions = 0;
  const events: XpEvent[] = [], badges: { id: string; at: number }[] = [], have = new Set<string>();
  const add = (at: number, kind: XpEvent['kind'], n: number, ref?: string) => { if (n > 0) { xp += n; events.push({ at, kind, xp: n, ref }); } };
  const unlock = (id: string, at: number) => { if (have.has(id)) return; have.add(id); badges.push({ id, at }); add(at, 'badge', XP.badge, id); };
  const dayXp: Record<string, number> = {}, dayHadSession = new Set<string>();
  const testDays: Record<string, Set<string>> = {};
  const results: { pct: number; subject: string; at: number }[] = [];
  const langs = new Set<string>();
  const byId = new Map(tests.map(t => [t.id, t]));
  let lastFrozenSeen = 0;
  const cheeredTargets = new Set<string>(), cheerPairs = new Set<string>(), cheerDayXp: Record<string, number> = {};

  for (const e of evs) {
    if (e.type === 'session') {
      const h = e.h, c = correctOf(h), ft = Math.min(h.firstTry || 0, c);
      nSessions++; correctTotal += c;
      let raw = c * XP.correct + ft * XP.firstTry;
      const used = dayXp[h.day] || 0, room = Math.max(0, XP.dailySoftCap - used);
      const counted = Math.min(raw, room) + Math.floor(Math.max(0, raw - room) / 2);   // soft cap: half XP beyond 400/day
      dayXp[h.day] = used + raw;
      add(e.at, 'session', counted + (h.n >= 5 ? XP.session : h.n > 0 ? XP.shortSession : 0), h.id);
      if (!dayHadSession.has(h.day)) {
        dayHadSession.add(h.day);
        const s = streakOn[h.day] || 1;
        add(e.at, 'streak', XP.streakPerDay * Math.min(s, XP.streakMaxDays));
        for (const m of [3, 7, 30, 100]) if (s >= m) unlock('streak_' + m, e.at);
        const fz = frozenDays.filter(d => d < h.day).length;
        if (fz > lastFrozenSeen && s > 1) unlock('freeze_saved', e.at);
        lastFrozenSeen = fz;
      }
      unlock('first_session', e.at);
      const hr = new Date(e.at).getHours();
      if (hr < 8 && hr >= 4) unlock('early_bird', e.at);
      const ts = (h.tests || []).map(id => byId.get(id)).filter((t): t is Test => !!t);
      if (hr >= 21 && !ts.some(t => plusDays(h.day, 1) === t.testDate || h.day === t.testDate)) unlock('night_owl', e.at);
      if (h.n >= 10 && h.firstTry >= h.n) unlock('flawless', e.at);
      if (correctTotal >= 100) unlock('recall_100', e.at);
      if (correctTotal >= 1000) unlock('recall_1000', e.at);
      for (const t of ts) {
        if (h.day > t.testDate) continue;
        const set = (testDays[t.id] = testDays[t.id] || new Set()); set.add(h.day);
        if (set.size >= 5) unlock('spaced_out', e.at);
        if (set.size >= 3 && t.created && (dayTs(t.testDate) - dayTs(t.created)) / 864e5 >= 7) unlock('planner', e.at);
      }
    } else if (e.type === 'plan') {
      const n = new Set((e.t.days || []).filter(d => d <= e.t.testDate)).size;
      const span = Math.max(1, Math.round((dayTs(e.t.testDate) - dayTs(e.t.created || e.t.testDate)) / 864e5));
      if (n >= Math.min(3, span)) { add(e.at, 'plan', XP.plan, e.t.id); unlock('plan_done', e.at); }
    } else if (e.type === 'result') {
      const pct = toPct(e.t.result!);
      add(e.at, 'result', XP.result, e.t.id);
      unlock('first_result', e.at);
      if (results.length && pct > Math.max(...results.map(r => r.pct))) { add(e.at, 'personal_best', XP.personalBest, e.t.id); unlock('personal_best', e.at); }
      const prev = results.filter(r => r.subject === e.t.subject).pop();
      if (prev && pct >= prev.pct + 10) unlock('comeback', e.at);
      results.push({ pct, subject: e.t.subject, at: e.at });
    } else if (e.type === 'cheer') {
      // modest: XP once per cheered target (not per emoji/supporter), max 15/day; Fan club badge after 3 cheers
      cheerPairs.add(e.c.from + '|' + e.c.target);
      if (!cheeredTargets.has(e.c.target)) {
        cheeredTargets.add(e.c.target);
        const d = dayOf(e.at), used = cheerDayXp[d] || 0, n = Math.min(XP.cheer, XP.cheerDailyCap - used);
        if (n > 0) { cheerDayXp[d] = used + n; add(e.at, 'cheer', n, e.c.target); }
      }
      if (cheerPairs.size >= 3) unlock('fan_club', e.at);
    } else if (e.type === 'report') {
      add(e.at, 'report', XP.reportCard + Math.min(XP.reportImprovedMax, XP.reportImproved * e.r.improved), e.r.id);
      unlock('rc_first', e.at);
      if (e.r.improved >= 3) unlock('rc_improved3', e.at);
      if (e.r.best) unlock('rc_best', e.at);
    } else if (e.type === 'created') {
      if (e.t.subject === 'languages' && e.t.foreign) { langs.add(e.t.foreign); if (langs.size >= 3) unlock('polyglot', e.at); }
    }
  }
  const info = levelInfo(xp);
  const weekAgo = nowTs - 7 * 864e5, wk = sessions.filter(s => sessionAt(s) >= weekAgo);
  const cur = streak; // today not practised yet does not break the streak (there is still time)
  return {
    xp, level: info.level, rank: rankFor(info.level), info,
    streak: { current: cur, best, freezes, activeToday: activeDays.has(today), frozenDays, next: STREAK_MILESTONES.find(m => m > cur) || cur + 100 },
    badges, events,
    totals: { sessions: nSessions, correct: correctTotal, activeMin: Math.round(sessions.reduce((n, s) => n + activeMsOf(s), 0) / 60000), days: activeDays.size },
    week: { sessions: wk.length, correct: wk.reduce((n, s) => n + correctOf(s), 0), activeMin: Math.round(wk.reduce((n, s) => n + activeMsOf(s), 0) / 60000), xp: events.filter(e => e.at >= weekAgo).reduce((n, e) => n + e.xp, 0), days: new Set(wk.map(s => s.day)).size }
  };
}

/** practice done for a test before its date: sessions, distinct days, active minutes (shared by multi-test sessions) */
export function practiceBefore(test: Test, history: HistoryEntry[]) {
  const hs = history.filter(h => (h.tests || []).includes(test.id) && h.day <= test.testDate);
  return { sessions: hs.length, days: new Set(hs.map(h => h.day)).size, minutes: Math.round(hs.reduce((n, h) => n + activeMsOf(h) / Math.max(1, (h.tests || []).length), 0) / 60000) };
}
