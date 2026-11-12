/* Probeprüfung. A short mock a few days before the exam.
   Questions come from the goals (or the cards, if the plan has no goals yet).
   Free text is the only kind that needs the model; everything else is graded here. */
export const LEAD_CHOICES = [3, 4, 5] as const;
export type LeadDays = (typeof LEAD_CHOICES)[number];

export function leadDays(v: unknown): LeadDays {
  const n = Number(v);
  return n === 3 || n === 5 ? n : 4;
}

/** Open from `lead` days before the exam through the morning of the exam. */
export function mockOpen(daysLeft: number, lead: number): boolean {
  return daysLeft >= 0 && daysLeft <= leadDays(lead);
}

export type MockKind = 'mc' | 'short' | 'free';
export interface MockQuestion {
  id: string;
  goalId: string;
  prompt: string;
  kind: MockKind;
  choices: string[];
  /** kept on the server. Never sent to the browser before grading. */
  answer: string;
}

export interface GoalLike { id: string; text: string; topic?: string; kind?: string; method?: string }
export interface CardLike { id: string; term: string; meaning: string; goalId?: string }

const clip = (s: string, n: number) => s.replace(/\s+/g, ' ').trim().slice(0, n);

export function buildMock(goals: GoalLike[], cards: CardLike[], lang: 'de' | 'en'): MockQuestion[] {
  const source: GoalLike[] = goals.length
    ? goals
    : cards.slice(0, 6).map(c => ({ id: c.goalId || c.id, text: c.term, topic: c.meaning, kind: 'facts', method: 'retrieval' }));
  const pool = source.slice(0, 6);
  return pool.map((g, i) => {
    const text = clip(g.text || g.topic || '', 180);
    const kind = g.kind || 'facts';
    const qKind: MockKind = kind === 'essay' ? 'free' : kind === 'facts' || kind === 'sequence' ? 'mc' : 'short';
    const others = pool.filter(x => x.id !== g.id).map(x => clip(x.topic || x.text, 80)).filter(Boolean);
    const answer = clip(cards.find(c => c.goalId === g.id)?.meaning || g.topic || text, 180);
    const choices = qKind === 'mc' ? shuffleChoices(answer, others, i) : [];
    const prompt = lang === 'de'
      ? (qKind === 'free' ? `Erkläre in zwei Sätzen: ${text}` : qKind === 'mc' ? `Was passt zu: ${text}` : `Kurz: ${text}`)
      : (qKind === 'free' ? `Explain in two sentences: ${text}` : qKind === 'mc' ? `Which one fits: ${text}` : `In short: ${text}`);
    return { id: 'q' + (i + 1), goalId: g.id, prompt, kind: qKind, choices, answer };
  });
}

function shuffleChoices(answer: string, others: string[], salt: number): string[] {
  const opts = [answer, ...others.filter(o => o && o !== answer)].slice(0, 4);
  while (opts.length < 3) opts.push(opts.length === 1 ? '—' : '…');
  const arr = opts.slice(0, 4);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = (salt * 7 + i * 3) % (i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function publicQuestion(q: MockQuestion): Omit<MockQuestion, 'answer'> {
  const { answer: _a, ...rest } = q;
  return rest;
}

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/g, ' ').trim();

/** mc and short are graded here. Free text returns null so the model can look. */
export function gradeLocal(q: MockQuestion, given: string): { auto: boolean; score: number } | null {
  const g = norm(given || '');
  if (!g) return { auto: true, score: 0 };
  if (q.kind === 'free') return null;
  if (q.kind === 'mc') return { auto: true, score: g === norm(q.answer) || q.choices.some(c => norm(c) === g && norm(c) === norm(q.answer)) ? 1 : 0 };
  const want = norm(q.answer);
  if (!want) return { auto: true, score: 0 };
  if (g === want || want.includes(g) && g.length >= 3 || g.includes(want)) return { auto: true, score: 1 };
  return { auto: true, score: 0 };
}

/** German 1–6 from a 0–1 score. Higher percent, better grade. */
export function gradeFromScore(pct: number): string {
  const p = Math.max(0, Math.min(1, pct));
  if (p >= 0.9) return '1';
  if (p >= 0.8) return '2';
  if (p >= 0.65) return '3';
  if (p >= 0.5) return '4';
  if (p >= 0.3) return '5';
  return '6';
}

export function weakGoals(rows: { goalId: string; score: number }[], threshold = 0.6): string[] {
  const by = new Map<string, number[]>();
  for (const r of rows) {
    const list = by.get(r.goalId) || [];
    list.push(r.score);
    by.set(r.goalId, list);
  }
  const weak: string[] = [];
  for (const [id, scores] of by) {
    const avg = scores.reduce((n, s) => n + s, 0) / scores.length;
    if (avg < threshold) weak.push(id);
  }
  return weak;
}

/** One extra short session per weak goal, only while days remain. */
/** A classmate may see the score, never the answers. Hidden privacy shares nothing. */
export function canSeeMockSummary(connected: boolean, privacy: string): boolean {
  return connected && privacy !== 'hide';
}

export function extraSessions(weak: string[], daysLeft: number): { goalId: string; sessions: number }[] {
  if (daysLeft < 1) return [];
  return weak.map(goalId => ({ goalId, sessions: 1 }));
}
