/* Snapwise – domain types shared by the web app and the server */
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
}
export interface Settings { uiLang: UiLang; theme: 'auto' | 'light' | 'dark'; sessionSize: number; tts: boolean; onboarded: boolean; }
export interface Streak { count: number; best: number; lastDay: string | null; }
export interface Stats { sessions: number; answers: number; firstTry: number; ms: number; }
export interface HistoryEntry { id: string; day: string; n: number; firstTry: number; ms: number; tests?: string[]; }
export interface AppData { v: 2; settings: Settings; streak: Streak; stats: Stats; history: HistoryEntry[]; tests: Test[]; }

/** a row on the review/edit screen (before it becomes a card) */
export interface DraftRow { type: CardType; a: string; b: string; example?: string; distractors?: string[]; low?: boolean; conf?: number; flags?: string[]; sep?: string; }

/* ---- sync wire format ---- */
export interface WireTest { id: string; name: string; subject: Subject; foreign: Lang | null; native: Lang; testDate: string; format: Format; articles: boolean; created: string | null; days: string[]; updatedAt: number; deleted?: boolean; }
export interface WireCard { id: string; testId: string; position: number; type: CardType; term: string; meaning: string; example: string; distractors: string[]; st: CardState; updatedAt: number; deleted?: boolean; }
export interface WireSession { id: string; day: string; n: number; firstTry: number; ms: number; tests: string[]; }
export interface WireProfile { data: { settings?: Partial<Settings>; streak?: Streak; stats?: Stats }; updatedAt: number; }
export interface SyncRequest { since: number; push: { profile?: WireProfile; tests?: WireTest[]; cards?: WireCard[]; sessions?: WireSession[] }; }
export interface SyncResponse { rev: number; profile: WireProfile | null; tests: WireTest[]; cards: WireCard[]; sessions: WireSession[]; }

export interface PublicConfig { ai: { configured: boolean; model: string | null }; registrationOpen: boolean; maxUploadMB: number; maxUploadFiles: number; version: string; }
export interface User { id: string; login: string; email: string | null; isAdmin: boolean; createdAt?: string; }
export interface ExtractMeta { testId?: string; subject: Subject; format: Format; foreign: Lang | null; native: Lang; }
export interface ExtractResult { rows: DraftRow[]; unreadable: string[]; language: string; model?: string; }
