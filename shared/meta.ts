/* Snapwise – static metadata shared by web + server (English names are used in LLM prompts) */
import type { Format, Lang, Subject } from './types';

export const LANG_EN: Record<Lang, string> = { en: 'English', de: 'German', fr: 'French', es: 'Spanish', la: 'Latin' };
export const SUBJECT_EN: Record<Subject, string> = {
  languages: 'Languages', biology: 'Biology', history: 'History', geography: 'Geography', chemistry: 'Chemistry', physics: 'Physics',
  math: 'Maths', politics: 'Politics & Society', economics: 'Economics', religion: 'Religion & Ethics', music: 'Music & Art', other: 'Other'
};
export const FORMAT_DESC_EN: Record<Format, string> = {
  meaning: 'the student sees the foreign word and writes its meaning',
  produce: 'the student sees the meaning and must write the foreign word, spelling counts',
  mc: 'multiple choice with close distractors',
  match: 'matching words to meanings',
  cloze: 'fill in the gap in a sentence',
  sentence: 'use the word in an own sentence',
  written: 'open written answers to questions',
  mixed: 'unknown / mixed formats'
};
