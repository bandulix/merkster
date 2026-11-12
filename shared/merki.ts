/* Merki, the alien mascot. Age band, what the model is allowed to see, and safe fallback lines.
   Speech is one-way. Nothing here is a chat. */
export type AgeBand = 'young' | 'mid' | 'teen';
export type MerkiPose = 'happy' | 'cheering' | 'thinking' | 'nudging' | 'sleepy' | 'proud';
export type MerkiTrigger = 'home' | 'nudge' | 'session_start' | 'session_done' | 'plan_created' | 'behind' | 'exam_soon' | 'grade' | 'friend' | 'mock_done' | 'joker';

export const AGE_BANDS: AgeBand[] = ['young', 'mid', 'teen'];
export const MERKI_POSES: MerkiPose[] = ['happy', 'cheering', 'thinking', 'nudging', 'sleepy', 'proud'];
export const MERKI_TRIGGERS: MerkiTrigger[] = ['home', 'nudge', 'session_start', 'session_done', 'plan_created', 'behind', 'exam_soon', 'grade', 'friend', 'mock_done', 'joker'];

/** Klassenstufe wins. Otherwise age from birth year. Unknown stays unset so the app can ask once. */
export function ageBand(input: { schoolYear?: number | null; birthYear?: number | null; nowYear: number }): AgeBand | null {
  const year = input.schoolYear;
  if (typeof year === 'number' && year >= 1 && year <= 13) {
    if (year <= 4) return 'young';
    if (year <= 7) return 'mid';
    return 'teen';
  }
  const born = input.birthYear;
  if (typeof born === 'number' && born >= 1995 && born <= input.nowYear - 5) {
    const age = input.nowYear - born;
    if (age <= 10) return 'young';
    if (age <= 14) return 'mid';
    return 'teen';
  }
  return null;
}

export interface MerkiContext {
  band: AgeBand;
  lang: 'de' | 'en';
  name: string;
  streak: number;
  dueToday: number;
  examIn: number | null;
  erfolg: number | null;
  adherence: number | null;
  plan: string;
  friend: string;
  behind: boolean;
  hour: number;
}

const clip = (v: unknown, n: number) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, n) : '');
const num = (v: unknown, max: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(max, Math.round(v))) : 0);

/** Drop anything the model must not see: notes, emails, raw grades, other people's details. */
export function cleanContext(raw: unknown, name: string): MerkiContext {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const band: AgeBand = o.band === 'young' || o.band === 'teen' || o.band === 'mid' ? o.band : 'mid';
  const lang = o.lang === 'en' ? 'en' : 'de';
  const exam = typeof o.examIn === 'number' && o.examIn >= 0 && o.examIn <= 400 ? Math.round(o.examIn) : null;
  const erfolg = typeof o.erfolg === 'number' && o.erfolg >= 0 && o.erfolg <= 1 ? Math.round(o.erfolg * 100) / 100 : null;
  const adherence = typeof o.adherence === 'number' && o.adherence >= 0 && o.adherence <= 100 ? Math.round(o.adherence) : null;
  const first = clip(name, 24).split(/\s+/)[0] || (lang === 'de' ? 'du' : 'you');
  return {
    band, lang, name: first, streak: num(o.streak, 999), dueToday: num(o.dueToday, 200),
    examIn: exam, erfolg, adherence, plan: clip(o.plan, 60), friend: clip(o.friend, 24),
    behind: !!o.behind, hour: num(o.hour, 23)
  };
}

/** One bubble. Exam countdown and a missed day outrank a plain hello. */
export function pickTrigger(input: { dueToday: number; examIn: number | null; behind: boolean; friend: boolean; hasTests: boolean }): MerkiTrigger {
  if (input.examIn != null && input.examIn <= 3) return 'exam_soon';
  if (input.behind) return 'behind';
  if (!input.hasTests || input.dueToday > 0) return 'nudge';
  if (input.friend) return 'friend';
  return 'home';
}

export function poseFor(trigger: MerkiTrigger, hour: number): MerkiPose {
  if (hour >= 21 || hour < 6) return trigger === 'nudge' ? 'sleepy' : 'sleepy';
  switch (trigger) {
    case 'nudge': case 'behind': return 'nudging';
    case 'session_start': case 'exam_soon': return 'thinking';
    case 'session_done': case 'friend': return 'cheering';
    case 'plan_created': case 'grade': case 'mock_done': case 'joker': return 'proud';
    default: return 'happy';
  }
}

const SHAME = /\b(dumm|dummkopf|idiot|versager|faulpelz|loser|stupid|worthless|shame on|dumb)\b/i;
const PRESSURE = /\b(du musst|you must|or else|sofort oder)\b/i;
const LINK = /https?:\/\/|www\.|\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b/i;

/** A line Merki may say. Rejects links, addresses, and anything that shames. */
export function validateLine(text: unknown): string | null {
  if (typeof text !== 'string') return null;
  const line = text.replace(/\s+/g, ' ').trim();
  if (line.length < 2 || line.length > 220) return null;
  if (LINK.test(line) || SHAME.test(line) || PRESSURE.test(line)) return null;
  const sentences = line.split(/[.!?]+/).filter(s => s.trim().length > 0);
  if (sentences.length > 2) return null;
  return line;
}

type Pack = Record<MerkiTrigger, Record<AgeBand, string>>;
const DE: Pack = {
  home: { young: 'Hallo {name}! Heute wartet eine kleine Runde auf dich.', mid: 'Hey {name}. Eine kurze Runde, dann hast du’s.', teen: '{name}. Kurze Runde, dann bist du durch.' },
  nudge: { young: 'Zeit zum Lernen, {name}! Nur ein paar Karten, dann bist du der Star.', mid: '{name}, die Karten von heute warten. Fünf Minuten reichen.', teen: '{name}, heutige Karten sind fällig. Kurz, dann frei.' },
  session_start: { young: 'Los geht’s, {name}! Ich halte die Augen offen.', mid: 'Start. Eine Karte nach der anderen.', teen: 'Legen wir los. Ruhig und genau.' },
  session_done: { young: 'Juhu {name}! Das war stark. Serie: {streak}.', mid: 'Geschafft. Serie steht bei {streak}.', teen: 'Runde sitzt. Serie: {streak}.' },
  plan_created: { young: 'Dein Plan steht, {name}! Wir üben bis zur Prüfung, Stück für Stück.', mid: 'Plan ist da. Wir verteilen das bis zum Prüfungstag.', teen: 'Plan steht. Bis zur Prüfung, ohne Hektik.' },
  behind: { young: 'Ein Tag ist ausgelassen. Heute holen wir ein bisschen auf, ganz locker.', mid: 'Ein Tag fehlt. Heute ein kleines Stück nachholen reicht.', teen: 'Ein Tag ist offen. Heute ein kurzer Block gleicht das aus.' },
  exam_soon: { young: 'Noch {exam} Tage! Wir wiederholen nur, was wackelt.', mid: 'Noch {exam} Tage. Wiederholen, nichts Neues pauken.', teen: 'Noch {exam} Tage. Nur Wiederholung.' },
  grade: { young: 'Note ist drin, {name}! Ich bin stolz, dass du sie eingetragen hast.', mid: 'Note gespeichert. Das zählt für deine Erfolgsquote.', teen: 'Note ist notiert. Daraus wird die Quote.' },
  friend: { young: '{friend} hat heute geübt. Ihr seid ein gutes Team!', mid: '{friend} war heute dabei. Schön, dass ihr denselben Plan habt.', teen: '{friend} hat heute geübt. Läuft bei euch.' },
  mock_done: { young: 'Probe geschafft, {name}! Wir üben noch, was wackelt.', mid: 'Probe ist durch. Die wackeligen Ziele kommen noch einmal dran.', teen: 'Probe sitzt. Die Lücken üben wir noch kurz.' },
  joker: { young: 'Dein Joker hat die Serie gehalten, {name}. Morgen bist du wieder dran.', mid: 'Der Joker hat die Serie gehalten. Morgen reicht eine kurze Runde.', teen: 'Joker benutzt. Serie bleibt. Morgen eine Runde.' }
};
const EN: Pack = {
  home: { young: 'Hi {name}! A tiny round is waiting today.', mid: 'Hey {name}. One short round and you are done.', teen: '{name}. Short round, then you are clear.' },
  nudge: { young: 'Time to learn, {name}! Just a few cards, then you shine.', mid: '{name}, today’s cards are waiting. Five minutes is enough.', teen: '{name}, today’s cards are due. Keep it short.' },
  session_start: { young: 'Let’s go, {name}! I’ll watch with you.', mid: 'Start. One card at a time.', teen: 'Let’s go. Steady.' },
  session_done: { young: 'Yes {name}! That was great. Streak: {streak}.', mid: 'Done. Streak is {streak}.', teen: 'Round’s in. Streak: {streak}.' },
  plan_created: { young: 'Your plan is ready, {name}! We practise a bit every day.', mid: 'Plan’s ready. Spread out until the exam.', teen: 'Plan’s set. No cramming.' },
  behind: { young: 'One day slipped. Today we catch a little, no rush.', mid: 'A day is open. A short catch-up today is enough.', teen: 'A day is open. A short block covers it.' },
  exam_soon: { young: '{exam} days left! We only revisit what wobbles.', mid: '{exam} days left. Review, no new cramming.', teen: '{exam} days. Review only.' },
  grade: { young: 'Grade saved, {name}! Proud you wrote it down.', mid: 'Grade saved. It counts toward your success rate.', teen: 'Grade logged. That’s the rate.' },
  friend: { young: '{friend} practised today. You make a good team!', mid: '{friend} showed up today. Same plan, nice.', teen: '{friend} practised today. Solid.' },
  mock_done: { young: 'Practice test done, {name}! We will revisit what wobbled.', mid: 'Practice test is in. The shaky goals get another round.', teen: 'Practice test is in. We patch the gaps.' },
  joker: { young: 'Your joker kept the streak, {name}. Tomorrow you are back.', mid: 'The joker kept the streak. A short round tomorrow is enough.', teen: 'Joker used. Streak stays. One round tomorrow.' }
};

export function fallbackLine(ctx: MerkiContext, trigger: MerkiTrigger): { line: string; pose: MerkiPose } {
  const pack = ctx.lang === 'en' ? EN : DE;
  const raw = pack[trigger][ctx.band]
    .replaceAll('{name}', ctx.name)
    .replaceAll('{streak}', String(ctx.streak))
    .replaceAll('{exam}', String(ctx.examIn ?? 0))
    .replaceAll('{friend}', ctx.friend || (ctx.lang === 'de' ? 'Jemand' : 'Someone'));
  return { line: validateLine(raw) || pack.home[ctx.band].replaceAll('{name}', ctx.name), pose: poseFor(trigger, ctx.hour) };
}

export function promptFor(ctx: MerkiContext, trigger: MerkiTrigger): string {
  return [
    `Trigger: ${trigger}.`,
    `Age band: ${ctx.band}. Language: ${ctx.lang === 'de' ? 'German' : 'English'}.`,
    `Name: ${ctx.name}. Streak: ${ctx.streak}. Due today: ${ctx.dueToday}.`,
    `Exam in days: ${ctx.examIn ?? 'none'}. Success rate: ${ctx.erfolg ?? 'unknown'}. Adherence: ${ctx.adherence ?? 'unknown'}.`,
    `Plan: ${ctx.plan || 'none'}. Behind: ${ctx.behind}. Friend first name: ${ctx.friend || 'none'}. Hour: ${ctx.hour}.`,
    'Reply JSON only: {"line":"1 or 2 short sentences","pose":"happy|cheering|thinking|nudging|sleepy|proud"}.'
  ].join('\n');
}
