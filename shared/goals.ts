/* Learning-goal programmes: knowledge types, method choice, clarifying questions,
   task generation, worksheet fingerprints. Pure functions – no I/O. */
import type { CardSource, CardType, LearningGoal, Subject } from './types';
export type { LearningGoal };
import { SUBJECT_KEYS } from './types';

export type KnowledgeKind = 'facts' | 'concepts' | 'procedures' | 'transfer' | 'essay' | 'sequence';
export type StudyMethod = 'retrieval' | 'worked' | 'elaboration' | 'essay' | 'timeline' | 'mixed';
export type StudyActivity = 'recall' | 'worked' | 'problem' | 'explain' | 'outline' | 'sequence' | 'transfer';
export type ClarifyKind = 'minutes' | 'exam' | 'level' | 'material' | 'scope';
export type TaskPhase = 'learn' | 'mock';

export const KNOWLEDGE_KINDS: KnowledgeKind[] = ['facts', 'concepts', 'procedures', 'transfer', 'essay', 'sequence'];
export const STUDY_METHODS: StudyMethod[] = ['retrieval', 'worked', 'elaboration', 'essay', 'timeline', 'mixed'];
export const CLARIFY_KINDS: ClarifyKind[] = ['minutes', 'exam', 'level', 'material', 'scope'];

/** Evidence-based default. The app chooses this; the model only classifies the goal. */
export const METHOD_OF: Record<KnowledgeKind, StudyMethod> = {
  facts: 'retrieval',
  concepts: 'elaboration',
  procedures: 'worked',
  transfer: 'mixed',
  essay: 'essay',
  sequence: 'timeline'
};

export interface ClarifyQuestion {
  id: string;
  kind: ClarifyKind;
  /** model-written prompt, already in the UI language; built-in questions use i18n instead */
  prompt?: string;
}

export interface StudyTask {
  goalId: string;
  activity: StudyActivity;
  type: CardType;
  phase: TaskPhase;
  front: string;
  back: string;
  distractors: string[];
  source?: CardSource;
}

export interface GoalsExtract {
  subject: Subject;
  title: string;
  language: string;
  level: string;
  examFormat: string;
  goals: LearningGoal[];
  questions: ClarifyQuestion[];
  unreadable: string[];
}

const SUBJECT_ALIAS: Record<string, Subject> = {
  biology: 'biology', biologie: 'biology', bio: 'biology',
  history: 'history', geschichte: 'history',
  geography: 'geography', geografie: 'geography', erdkunde: 'geography',
  chemistry: 'chemistry', chemie: 'chemistry',
  physics: 'physics', physik: 'physics',
  math: 'math', maths: 'math', mathematics: 'math', mathematik: 'math',
  politics: 'politics', politik: 'politics',
  economics: 'economics', wirtschaft: 'economics',
  religion: 'religion',
  music: 'music', musik: 'music',
  languages: 'languages', sprache: 'languages', deutsch: 'languages', english: 'languages', englisch: 'languages',
  other: 'other'
};

export function asSubject(v: unknown): Subject {
  const k = String(v || '').trim().toLowerCase();
  if ((SUBJECT_KEYS as readonly string[]).includes(k)) return k as Subject;
  return SUBJECT_ALIAS[k] || 'other';
}
export function asKind(v: unknown): KnowledgeKind {
  return (KNOWLEDGE_KINDS as readonly string[]).includes(String(v)) ? v as KnowledgeKind : 'facts';
}
export function asMethod(v: unknown, kind: KnowledgeKind): StudyMethod {
  return (STUDY_METHODS as readonly string[]).includes(String(v)) ? v as StudyMethod : METHOD_OF[kind];
}

const clip = (v: unknown, n: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, n) : '');

export function validateGoalsExtract(obj: unknown): GoalsExtract {
  const o = (obj && typeof obj === 'object' ? obj : {}) as Record<string, unknown>;
  const goals: LearningGoal[] = [];
  const seen = new Set<string>();
  const rawGoals = Array.isArray(o.goals) ? o.goals : [];
  for (const raw of rawGoals.slice(0, 24)) {
    const g = (raw || {}) as Record<string, unknown>;
    const text = clip(g.text || g.goal, 400);
    if (text.length < 8) continue;
    const kind = asKind(g.kind);
    const id = clip(g.id, 40).replace(/[^A-Za-z0-9_-]/g, '') || 'g' + (goals.length + 1);
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    goals.push({ id, text, topic: clip(g.topic, 80) || text.split(/[.:–-]/)[0].trim().slice(0, 80), kind, method: asMethod(g.method, kind) });
  }
  const questions: ClarifyQuestion[] = [];
  for (const raw of (Array.isArray(o.questions) ? o.questions : []).slice(0, 4)) {
    const q = (raw || {}) as Record<string, unknown>;
    const kind = String(q.kind || '');
    if (!CLARIFY_KINDS.includes(kind as ClarifyKind)) continue;
    const prompt = clip(q.prompt, 240);
    if (prompt.length < 8) continue;
    if (questions.some(x => x.kind === kind)) continue;
    questions.push({ id: 'llm-' + kind, kind: kind as ClarifyKind, prompt });
  }
  return {
    subject: asSubject(o.subject),
    title: clip(o.title, 80) || 'Lernziele',
    language: clip(o.language, 5) || 'de',
    level: clip(o.gradeLevel || o.level, 80),
    examFormat: clip(o.examFormat, 40),
    goals,
    questions,
    unreadable: Array.isArray(o.unreadable) ? o.unreadable.map(u => clip(u, 200)).filter(Boolean).slice(0, 8) : []
  };
}

const MATERIAL_RE = /\b(seite|seiten|s\.\s*\d|page|pages|kapitel|chapter|lehrbuch|textbook|schulbuch)\b/i;
const VAGUE_RE = /^(alles|everything|all of|das thema|the topic|grundlagen)\b/i;

export function questionsFor(opts: {
  goals: LearningGoal[];
  days: number;
  level?: string;
  exam?: string;
  llm?: ClarifyQuestion[];
}): ClarifyQuestion[] {
  const blob = opts.goals.map(g => g.text).join('\n');
  const vague = opts.goals.some(g => g.text.trim().length < 18 || VAGUE_RE.test(g.text.trim()));
  const material = MATERIAL_RE.test(blob);
  const have = new Set<ClarifyKind>();
  const out: ClarifyQuestion[] = [];
  const add = (kind: ClarifyKind, prompt?: string) => {
    if (have.has(kind) || out.length >= 3) return;
    have.add(kind);
    out.push({ id: 'q-' + kind, kind, ...(prompt ? { prompt } : {}) });
  };
  if (!opts.exam) add('exam');
  if (material) add('material', opts.llm?.find(q => q.kind === 'material')?.prompt);
  if (opts.days >= 7) add('minutes');
  if (!opts.level && (vague || opts.llm?.some(q => q.kind === 'level'))) add('level', opts.llm?.find(q => q.kind === 'level')?.prompt);
  if (vague) add('scope', opts.llm?.find(q => q.kind === 'scope')?.prompt);
  return out;
}

/** Sensible default when the student skips a question. */
export function skipDefault(kind: ClarifyKind, days: number): string {
  if (kind === 'minutes') return String(days <= 3 ? 25 : days <= 14 ? 20 : 15);
  if (kind === 'exam') return 'written';
  return '';
}

export function minutesFrom(answers: Record<string, string>, days: number): number {
  const n = Number(answers.minutes);
  if (Number.isFinite(n) && n >= 5 && n <= 180) return Math.round(n);
  return Number(skipDefault('minutes', days));
}

const ACTIVITY_OF: Record<StudyMethod, StudyActivity[]> = {
  retrieval: ['recall', 'recall'],
  worked: ['worked', 'problem'],
  elaboration: ['explain', 'explain'],
  essay: ['outline', 'explain'],
  timeline: ['sequence', 'recall'],
  mixed: ['transfer', 'recall']
};

function dePair(goal: LearningGoal, activity: StudyActivity, phase: TaskPhase): StudyTask {
  const topic = goal.topic || 'diesem Lernziel';
  const text = goal.text.replace(/\s+/g, ' ').trim();
  if (activity === 'worked') return { goalId: goal.id, activity, type: 'qa', phase, front: `Beispiel: ${text}`, back: `1. Lies das Lernziel und markiere die Fachwörter zu ${topic}. 2. Schreibe die Schritte in der Reihenfolge des Materials auf. 3. Prüfe, ob jeder Schritt zum vorherigen passt. So bleibt das Verfahren hängen.`, distractors: [] };
  if (activity === 'problem') return { goalId: goal.id, activity, type: 'qa', phase, front: `Löse ohne Nachsehen: ${text}`, back: `Nenne die Schritte zu ${topic} in der richtigen Reihenfolge und das Ergebnis des letzten Schritts.`, distractors: [] };
  if (activity === 'explain') return { goalId: goal.id, activity, type: 'qa', phase, front: `Erkläre mit eigenen Worten: ${text}`, back: `Eine gute Erklärung nennt ${topic}, sagt warum es so ist, und gibt ein kurzes Beispiel aus dem Unterricht.`, distractors: [] };
  if (activity === 'outline') return { goalId: goal.id, activity, type: 'qa', phase, front: `Gliedere eine Antwort: ${text}`, back: `Einleitung: These zu ${topic}. Hauptteil: zwei Argumente mit Beispiel. Schluss: Folgerung in einem Satz.`, distractors: [] };
  if (activity === 'sequence') return { goalId: goal.id, activity, type: 'qa', phase, front: `Bringe in die richtige Reihenfolge: ${text}`, back: `Die Reihenfolge aus dem Lernziel zu ${topic}, vom ersten zum letzten Punkt.`, distractors: [] };
  if (activity === 'transfer') return { goalId: goal.id, activity, type: 'mc', phase, front: `Neuer Fall zu ${topic}: Welche Idee aus dem Lernziel hilft hier?`, back: text, distractors: ['Eine Regel aus einem anderen Fach.', 'Nur die Überschrift, ohne den Inhalt.', 'Das Gegenteil des Lernziels.'] };
  if (phase === 'mock') return { goalId: goal.id, activity: 'recall', type: 'qa', phase, front: `Prüfungskurzfrage: ${text}`, back: goal.topic ? `${goal.topic}: das Wesentliche in einem Satz.` : text, distractors: [] };
  return { goalId: goal.id, activity: 'recall', type: activity === 'recall' && phase === 'learn' ? 'qa' : 'qa', phase, front: `Was gehört zu ${topic}?`, back: text, distractors: [] };
}
function enPair(goal: LearningGoal, activity: StudyActivity, phase: TaskPhase): StudyTask {
  const topic = goal.topic || 'this goal';
  const text = goal.text.replace(/\s+/g, ' ').trim();
  if (activity === 'worked') return { goalId: goal.id, activity, type: 'qa', phase, front: `Worked example: ${text}`, back: `1. Mark the key terms for ${topic}. 2. Write the steps in the order the material uses. 3. Check that each step follows from the one before it.`, distractors: [] };
  if (activity === 'problem') return { goalId: goal.id, activity, type: 'qa', phase, front: `Solve without looking: ${text}`, back: `State the steps for ${topic} in order and the result of the last step.`, distractors: [] };
  if (activity === 'explain') return { goalId: goal.id, activity, type: 'qa', phase, front: `Explain in your own words: ${text}`, back: `A solid explanation names ${topic}, says why it works, and gives one short example.`, distractors: [] };
  if (activity === 'outline') return { goalId: goal.id, activity, type: 'qa', phase, front: `Outline an answer: ${text}`, back: `Intro: your claim about ${topic}. Body: two reasons with an example. Close: one-sentence conclusion.`, distractors: [] };
  if (activity === 'sequence') return { goalId: goal.id, activity, type: 'qa', phase, front: `Put in order: ${text}`, back: `The order from the goal for ${topic}, first to last.`, distractors: [] };
  if (activity === 'transfer') return { goalId: goal.id, activity, type: 'mc', phase, front: `New case for ${topic}: which idea from the goal applies?`, back: text, distractors: ['A rule from a different subject.', 'Only the heading, not the content.', 'The opposite of the goal.'] };
  return { goalId: goal.id, activity: 'recall', type: 'qa', phase, front: phase === 'mock' ? `Exam quick question: ${text}` : `What belongs with ${topic}?`, back: text, distractors: [] };
}

/** Local fallback so a programme exists even when the model returns too little. */
export function templateTasks(goals: LearningGoal[], lang: 'de' | 'en'): StudyTask[] {
  const make = lang === 'de' ? dePair : enPair;
  const out: StudyTask[] = [];
  for (const g of goals) {
    const acts = ACTIVITY_OF[g.method] || ACTIVITY_OF.retrieval;
    acts.forEach((a, i) => out.push(make(g, a, 'learn')));
    if (acts[0] === 'recall') {
      const mc = make(g, 'transfer', 'learn');
      mc.activity = 'recall'; mc.type = 'mc';
      mc.front = (lang === 'de' ? 'Welche Aussage stimmt? ' : 'Which statement fits? ') + g.text;
      mc.back = g.topic || g.text;
      mc.distractors = lang === 'de' ? ['Das steht so nicht im Lernziel.', 'Das ist ein anderes Thema.', 'Das Gegenteil ist gemeint.'] : ['That is not in the goal.', 'That is a different topic.', 'That is the opposite.'];
      out.splice(out.length - 1, 0, mc);
    }
    out.push(make(g, 'recall', 'mock'));
  }
  return out.filter(t => t.front && t.back);
}

export function taskBudget(days: number, minutes: number, goalCount: number): number {
  const learnDays = Math.max(1, days - 1);
  const perDay = Math.max(3, Math.round(Math.max(10, minutes) / 4));
  const total = Math.round(perDay * learnDays / 2.2);
  return Math.max(goalCount * 2, Math.min(goalCount * 6, total, 40));
}

/** Keep at least one learn-task and the mock task per goal, then fill up to the budget, interleaved. */
export function limitTasks(tasks: StudyTask[], goals: LearningGoal[], budget: number): StudyTask[] {
  const byGoal = new Map<string, StudyTask[]>();
  for (const t of tasks) {
    const list = byGoal.get(t.goalId) || [];
    list.push(t);
    byGoal.set(t.goalId, list);
  }
  const kept: StudyTask[][] = goals.map(g => {
    const list = byGoal.get(g.id) || [];
    const learn = list.find(t => t.phase !== 'mock');
    const mock = list.find(t => t.phase === 'mock');
    return [learn, mock].filter((t): t is StudyTask => !!t);
  });
  const rest: StudyTask[] = [];
  for (const g of goals) {
    for (const t of byGoal.get(g.id) || []) {
      if (!kept.some(row => row.includes(t))) rest.push(t);
    }
  }
  const flat = interleaveTasks(kept.flat());
  for (const t of interleaveTasks(rest)) {
    if (flat.length >= budget) break;
    flat.push(t);
  }
  return interleaveTasks(flat).slice(0, Math.max(budget, goals.length));
}

export function interleaveTasks<T extends { goalId: string }>(tasks: T[]): T[] {
  const groups = new Map<string, T[]>();
  const order: string[] = [];
  for (const t of tasks) {
    if (!groups.has(t.goalId)) { groups.set(t.goalId, []); order.push(t.goalId); }
    groups.get(t.goalId)!.push(t);
  }
  if (order.length <= 1) return [...tasks];
  const out: T[] = [];
  let left = tasks.length;
  while (left > 0) {
    let moved = false;
    for (const id of order) {
      const g = groups.get(id)!;
      if (g.length) { out.push(g.shift()!); left--; moved = true; }
    }
    if (!moved) break;
  }
  return out;
}

export function validateTasks(obj: unknown, goals: LearningGoal[]): StudyTask[] {
  const raw = Array.isArray(obj) ? obj : (obj && typeof obj === 'object' && Array.isArray((obj as { tasks?: unknown }).tasks) ? (obj as { tasks: unknown[] }).tasks : []);
  const ids = new Set(goals.map(g => g.id));
  const out: StudyTask[] = [];
  const activities: StudyActivity[] = ['recall', 'worked', 'problem', 'explain', 'outline', 'sequence', 'transfer'];
  const types: CardType[] = ['pair', 'qa', 'cloze', 'mc'];
  for (const item of raw.slice(0, 80)) {
    const t = (item || {}) as Record<string, unknown>;
    const goalId = clip(t.goalId, 40);
    if (!ids.has(goalId)) continue;
    const front = clip(t.front, 500), back = clip(t.back, 800);
    if (!front || !back) continue;
    const activity = activities.includes(t.activity as StudyActivity) ? t.activity as StudyActivity : 'recall';
    let type: CardType = types.includes(t.type as CardType) ? t.type as CardType : 'qa';
    let distractors = Array.isArray(t.distractors) ? t.distractors.map(d => clip(d, 200)).filter(d => d && d.toLowerCase() !== back.toLowerCase()).slice(0, 3) : [];
    if (type === 'mc' && distractors.length < 2) type = 'qa';
    if (type !== 'mc') distractors = [];
    out.push({ goalId, activity, type, phase: t.phase === 'mock' ? 'mock' : 'learn', front, back, distractors });
  }
  return out;
}

/** Merge model tasks with templates so every goal has real work, then cap the daily load. */
export function buildTasks(goals: LearningGoal[], model: unknown, lang: 'de' | 'en', days: number, minutes: number): StudyTask[] {
  const fromModel = validateTasks(model, goals);
  const templates = templateTasks(goals, lang);
  const merged = [...fromModel];
  for (const t of templates) {
    const have = merged.filter(x => x.goalId === t.goalId && x.phase === t.phase);
    if (t.phase === 'mock' && !have.some(x => x.phase === 'mock')) merged.push(t);
    else if (t.phase === 'learn' && have.filter(x => x.phase === 'learn').length < 2) merged.push(t);
  }
  return limitTasks(merged, goals, taskBudget(days, minutes, goals.length));
}

export function addISO(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, (m || 1) - 1, (d || 1) + n);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}
export function isoBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number), [by, bm, bd] = b.split('-').map(Number);
  return Math.round((new Date(by, (bm || 1) - 1, bd || 1).getTime() - new Date(ay, (am || 1) - 1, ad || 1).getTime()) / 864e5);
}

/** Mock-phase cards wait until two days before the exam when there is time to learn first. */
export function readyOn(phase: TaskPhase, today: string, exam: string): string | undefined {
  if (phase !== 'mock') return undefined;
  if (isoBetween(today, exam) < 5) return undefined;
  const on = addISO(exam, -2);
  return on > today ? on : undefined;
}

/* ---------- worksheet fingerprint ---------- */
const STOP = new Set('der die das und oder ein eine einem einen dem den des von zu zur zum mit auf im in ist sind war für for the a an of to and or with from that this eine ein ein ein'.split(/\s+/));

export function normaliseText(s: string): string {
  return s.toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .normalize('NFKD').replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
export function textTokens(s: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const w of normaliseText(s).split(' ')) {
    if (w.length < 3 || STOP.has(w) || seen.has(w)) continue;
    seen.add(w);
    out.push(w);
  }
  return out;
}

/**
 * Identity of a sheet: subject + sorted goal/card lines.
 * Exam date is NOT part of the identity – classmates often share a sheet and sit the exam on different days.
 * A matching date only adds a small similarity boost.
 */
export function fingerprint(subject: string, texts: string[]): { canon: string; tokens: string[] } {
  const lines = texts.map(normaliseText).filter(Boolean).sort();
  const canon = asSubject(subject) + '\n' + lines.join('\n');
  return { canon, tokens: textTokens(canon) };
}
export function jaccard(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const B = new Set(b);
  let inter = 0;
  for (const x of new Set(a)) if (B.has(x)) inter++;
  const union = new Set([...a, ...b]).size;
  return union ? inter / union : 0;
}

export const MATCH_STRONG = 0.82;
export const MATCH_NEAR = 0.62;

export function similarity(a: string[], b: string[], dates?: { left?: string | null; right?: string | null }): number {
  const boost = dates?.left && dates?.right && dates.left === dates.right ? 0.04 : 0;
  return Math.min(1, jaccard(a, b) + boost);
}

export interface RankedMatch<T> { item: T; sim: number; band: 'strong' | 'near' }
export function rankMatches<T>(query: string[], cands: { item: T; tokens: string[]; examDate?: string | null }[], queryDate?: string | null): RankedMatch<T> | null {
  let best: RankedMatch<T> | null = null;
  for (const c of cands) {
    const sim = similarity(query, c.tokens, { left: queryDate, right: c.examDate });
    if (sim < MATCH_NEAR) continue;
    if (!best || sim > best.sim) best = { item: c.item, sim, band: sim >= MATCH_STRONG ? 'strong' : 'near' };
  }
  return best;
}
