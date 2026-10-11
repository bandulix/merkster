/* Merkster – domain types shared by the web app and the server */
export type Lang = 'en' | 'de' | 'fr' | 'es' | 'la';
export type UiLang = 'en' | 'de';
export type CardType = 'pair' | 'qa' | 'cloze' | 'mc';
export type Subject = 'languages' | 'biology' | 'history' | 'geography' | 'chemistry' | 'physics' | 'math' | 'politics' | 'economics' | 'religion' | 'music' | 'other';
export type Format = 'meaning' | 'produce' | 'mc' | 'match' | 'cloze' | 'sentence' | 'written' | 'mixed';

export const LANG_CODES: Lang[] = ['en', 'de', 'fr', 'es', 'la'];
export const CARD_TYPES: CardType[] = ['pair', 'qa', 'cloze', 'mc'];
export const SUBJECT_KEYS: Subject[] = ['languages', 'biology', 'history', 'geography', 'chemistry', 'physics', 'math', 'politics', 'economics', 'religion', 'music', 'other'];
export const FORMATS: Format[] = ['meaning', 'produce', 'mc', 'match', 'cloze', 'sentence', 'written', 'mixed'];

/** per-card review state (successive relearning) */
export interface CardState {
  introduced: boolean;
  introducedDay?: string;
  sessions: number;
  lapses: number;
  dueAt: number | null;
  struggledLast: boolean;
  morningDone?: boolean;
  lastAt?: number;
  log?: number[];
}
export interface Card {
  id: string;
  type: CardType;
  term: string;      // front: foreign word / term / question / sentence with [[gap]]
  meaning: string;   // back: translation / definition / answer / gap text
  example: string;
  distractors?: string[];
  st: CardState;
}
export interface Test {
  id: string;
  name: string;
  subject: Subject;
  foreign: Lang | null;   // only for languages
  native: Lang;           // student language (languages) or material language (other subjects)
  created: string;        // ISO day
  testDate: string;       // ISO day
  format: Format;
  articles: boolean;
  items: Card[];
  days: string[];         // days practised
  result?: ExamResult | null;   // the grade the student got (entered after the test date)
  resultSkipped?: boolean;      // student dismissed "How did it go?"
  grading?: GradeSystem | null; // per-test grading system (null = the profile default)
}
export type GradeSystem = 'de_grade' | 'points15' | 'at_grade' | 'ch_grade' | 'us_letter' | 'uk_gcse' | 'percent' | 'xofy';
export const GRADE_SYSTEMS: GradeSystem[] = ['de_grade', 'points15', 'at_grade', 'ch_grade', 'us_letter', 'uk_gcse', 'percent', 'xofy'];
/** original value in its own system + normalised score (0–100, higher = better) */
export interface ExamResult { system: GradeSystem; value: number; max?: number; score?: number; enteredAt: number; note?: string; }
export interface Settings {
  uiLang: UiLang; theme: 'auto' | 'light' | 'dark'; sessionSize: number; tts: boolean; onboarded: boolean;
  grading: GradeSystem;   // preferred grading system (editable per result)
  sound: boolean;         // celebration sounds (off by default)
  ackLevel: number;       // highest level already celebrated
  ackBadges: string[];    // badges already celebrated
  termStarts?: [number, number];   // months the school year / 2nd half start (default Aug, Feb)
}
export interface Streak { count: number; best: number; lastDay: string | null; }
export interface Stats { sessions: number; answers: number; firstTry: number; ms: number; }
/** one finished practice session. ms = wall time, activeMs = active practice time (idle gaps don't count) */
export interface HistoryEntry { id: string; day: string; n: number; firstTry: number; ms: number; tests?: string[]; at?: number; correct?: number; activeMs?: number; }
export interface AppData { v: 2; settings: Settings; streak: Streak; stats: Stats; history: HistoryEntry[]; tests: Test[]; }

/** a row on the review/edit screen (before it becomes a card) */
export interface DraftRow { type: CardType; a: string; b: string; example?: string; distractors?: string[]; low?: boolean; conf?: number; flags?: string[]; sep?: string; }

/* ---- sync wire format ---- */
export interface WireTest { id: string; name: string; subject: Subject; foreign: Lang | null; native: Lang; testDate: string; format: Format; articles: boolean; created: string | null; days: string[]; result: ExamResult | null; resultSkipped: boolean; grading?: GradeSystem | null; updatedAt: number; deleted?: boolean; }
export interface WireCard { id: string; testId: string; position: number; type: CardType; term: string; meaning: string; example: string; distractors: string[]; st: CardState; updatedAt: number; deleted?: boolean; }
export interface WireSession { id: string; day: string; n: number; firstTry: number; ms: number; tests: string[]; at: number | null; correct: number; activeMs: number; }
export interface WireProfile { data: { settings?: Partial<Settings>; streak?: Streak; stats?: Stats }; updatedAt: number; }
export interface SyncRequest { since: number; push: { profile?: WireProfile; tests?: WireTest[]; cards?: WireCard[]; sessions?: WireSession[] }; }
export interface SyncResponse { rev: number; profile: WireProfile | null; tests: WireTest[]; cards: WireCard[]; sessions: WireSession[]; }

export interface PublicConfig { ai: { configured: boolean; model: string | null }; auth: { google: boolean; testProvider: boolean; /** a codeword (SIGNUP_CODE) is needed to create a new account – the code itself is never sent */ signupCode?: boolean }; registrationOpen: boolean; maxUploadMB: number; maxUploadFiles: number; version: string; }
/** what the browser knows about the signed-in user (from Google: name, e-mail, avatar URL) */
export interface User { id: string; name: string; email: string | null; avatar: string | null; isAdmin: boolean; createdAt?: string; isSupporter?: boolean; kids?: number; supporters?: number }
export interface ExtractMeta { testId?: string; subject: Subject; format: Format; foreign: Lang | null; native: Lang; }
export interface ExtractResult { rows: DraftRow[]; unreadable: string[]; language: string; model?: string; }
