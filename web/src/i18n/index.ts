/* Merkster – i18n (EN/DE), languages, subjects, test formats, demo material */
import type { DraftRow, Format, Lang, Subject, Test, UiLang } from '../../../shared/types';
import { APP_SLUG } from '../../../shared/brand';
import { de as de1, en as en1, SUBJECTS as SUBJ } from './strings';
import { de3, en3 } from './strings3';
import { de4, en4 } from './strings4';
import { de5, en5 } from './strings5';
import { de6, en6 } from './strings6';
import { de7, en7 } from './strings7';
import { de8, en8 } from './strings8';
import { de9, en9 } from './strings9';

const en2 = {
    login_btn: 'Log in', register_btn: 'Create account', to_register: 'New here? Create an account', to_login: 'Already have an account? Log in',
  reg_closed: 'Sign-up is closed – ask your admin for an account.', first_admin: 'The first account on this server becomes the admin.',
    err_rate_limited: 'Too many attempts – wait a few minutes.', err_network: 'Can’t reach the server.',
  err_registration_closed: 'Sign-up is closed – ask your admin for an account.', err_unknown: 'Something went wrong.',
  s_account: 'Account', logged_in_as: 'Logged in as {login}', admin_badge: 'Admin', logout: 'Log out', logout_confirm: 'Log out on this device?',
  sync_ok: 'Synced', sync_pending: 'Saving…', sync_offline: 'Offline – saved on this device', sync_error: 'Sync problem – retrying',
  s_ai_server_on: 'AI mode is on – configured on the server ({model}). Photos of worksheets, book pages and notes become great cards.',
  s_ai_server_off: 'AI mode is off. Your admin can switch it on in the server’s .env file (LLM_…). Until then, text recognition runs on your device – fine for vocab lists, weaker for other material.',
  s_ai_ping: 'Test AI connection', s_ai_ping_ok: 'AI connection works ✓', s_ai_ping_fail: 'AI connection failed',
  ai_rate_limited: 'AI limit reached for now – used on-device text recognition instead.', ai_tip_admin: 'Ask your admin to switch on AI mode.',
  s_users: 'Accounts', s_add_user: 'Add account', user_added: 'Account created', s_admin: 'Admin',
  update_ready: 'A new version of the app is ready.', update_now: 'Update', offline_ready: 'Ready to work offline.', loading: 'Loading…', later: 'Later',
  not_found: 'Page not found', tab_new: 'New', s_offline_hint: 'Downloads the text-recognition engine and language data (~17 MB) so photo import works without internet.'
} as const;
const de2: Record<keyof typeof en2, string> = {
    login_btn: 'Anmelden', register_btn: 'Konto erstellen', to_register: 'Neu hier? Konto erstellen', to_login: 'Schon ein Konto? Anmelden',
  reg_closed: 'Registrierung ist geschlossen – frag deine Admin nach einem Konto.', first_admin: 'Das erste Konto auf diesem Server wird Admin.',
    err_rate_limited: 'Zu viele Versuche – warte ein paar Minuten.', err_network: 'Server nicht erreichbar.',
  err_registration_closed: 'Registrierung ist geschlossen – frag deine Admin nach einem Konto.', err_unknown: 'Da ist etwas schiefgelaufen.',
  s_account: 'Konto', logged_in_as: 'Angemeldet als {login}', admin_badge: 'Admin', logout: 'Abmelden', logout_confirm: 'Auf diesem Gerät abmelden?',
  sync_ok: 'Synchronisiert', sync_pending: 'Speichert…', sync_offline: 'Offline – auf dem Gerät gespeichert', sync_error: 'Sync-Problem – neuer Versuch läuft',
  s_ai_server_on: 'KI-Modus ist an – auf dem Server eingerichtet ({model}). Fotos von Arbeitsblättern, Buchseiten und Notizen werden zu richtig guten Karten.',
  s_ai_server_off: 'KI-Modus ist aus. Deine Admin kann ihn in der .env-Datei des Servers einschalten (LLM_…). Bis dahin läuft die Texterkennung auf deinem Gerät – gut für Vokabellisten, schwächer für anderes Material.',
  s_ai_ping: 'KI-Verbindung testen', s_ai_ping_ok: 'KI-Verbindung klappt ✓', s_ai_ping_fail: 'KI-Verbindung fehlgeschlagen',
  ai_rate_limited: 'KI-Limit gerade erreicht – stattdessen Texterkennung auf dem Gerät genutzt.', ai_tip_admin: 'Frag deine Admin, ob sie den KI-Modus einschaltet.',
  s_users: 'Konten', s_add_user: 'Konto hinzufügen', user_added: 'Konto erstellt', s_admin: 'Admin',
  update_ready: 'Eine neue Version der App ist bereit.', update_now: 'Aktualisieren', offline_ready: 'Bereit für die Offline-Nutzung.', loading: 'Lädt…', later: 'Später',
  not_found: 'Seite nicht gefunden', tab_new: 'Neu', s_offline_hint: 'Lädt die Texterkennung und Sprachdaten (~17 MB), damit der Foto-Import ohne Internet klappt.'
};
export const STRINGS = { en: { ...en1, ...en2, ...en3, ...en4, ...en5, ...en6, ...en7, ...en8, ...en9 }, de: { ...de1, ...de2, ...de3, ...de4, ...de5, ...de6, ...de7, ...de8, ...de9 } };
export type Key = keyof typeof STRINGS.en;

/* ---- current UI language (set by the app from the user's settings) ---- */
const UI_KEY = APP_SLUG + '.ui';
let current: UiLang = (() => {
  try { const v = localStorage.getItem(UI_KEY); if (v === 'de' || v === 'en') return v; } catch { /* ignore */ }
  return typeof navigator !== 'undefined' && (navigator.language || '').toLowerCase().startsWith('de') ? 'de' : 'en';
})();
export const uiLang = () => current;
export function setUiLang(l: UiLang) { current = l; try { localStorage.setItem(UI_KEY, l); } catch { /* ignore */ } if (typeof document !== 'undefined') document.documentElement.lang = l; }

export function t(key: Key, vars?: Record<string, string | number>): string {
  const s = (STRINGS[current] as Record<string, string>)[key] ?? (STRINGS.en as Record<string, string>)[key] ?? key;
  return String(s).replace(/\{(\w+)\}/g, (_, k) => (vars && vars[k] != null ? String(vars[k]) : ''));
}
/** Plural-aware t(): string forms use `one;;other` (double semicolon). Falls back to `t` when no split. */
export function tp(key: Key, n: number, vars?: Record<string, string | number>): string {
  const raw = (STRINGS[current] as Record<string, string>)[key] ?? (STRINGS.en as Record<string, string>)[key] ?? key;
  const parts = String(raw).split(';;');
  const s = parts.length >= 2 ? (n === 1 ? parts[0] : parts[1]) : raw;
  const all: Record<string, string | number> = { n, ...vars };
  return String(s).replace(/\{(\w+)\}/g, (_, k: string) => (all[k] != null ? String(all[k]) : ''));
}
export const pick = (key: Key) => { const p = t(key).split('|'); return p[Math.floor(Math.random() * p.length)]; };

/** Map known English OCR/LLM notes into the active UI language. */
const NOTE_MAP: Record<string, Key> = {
  'last line is cut off at the bottom edge': 'note_cut_off',
  'religion grade is covered by a stamp': 'note_stamp_cover',
};
export function localizeNote(note: string): string {
  const key = NOTE_MAP[note.trim().toLowerCase()];
  return key ? t(key) : note;
}

/* ---- languages ---- */
export const LANGS: Record<Lang, { flag: string; tts: string; ocr: string; name: Record<UiLang, string>; chars: string }> = {
  en: { flag: '🇬🇧', tts: 'en-GB', ocr: 'eng', name: { en: 'English', de: 'Englisch' }, chars: '' },
  fr: { flag: '🇫🇷', tts: 'fr-FR', ocr: 'fra', name: { en: 'French', de: 'Französisch' }, chars: 'éèêàâçôîûëïœ' },
  es: { flag: '🇪🇸', tts: 'es-ES', ocr: 'spa', name: { en: 'Spanish', de: 'Spanisch' }, chars: 'áéíóúñü¿¡' },
  la: { flag: '🏛️', tts: 'it-IT', ocr: 'lat', name: { en: 'Latin', de: 'Latein' }, chars: '' },
  de: { flag: '🇩🇪', tts: 'de-DE', ocr: 'deu', name: { en: 'German', de: 'Deutsch' }, chars: 'äöüßÄÖÜ' }
};
export const langName = (l: Lang | null | undefined) => (l && LANGS[l] ? LANGS[l].name[current] : '');
export const flag = (l: Lang | null | undefined) => (l && LANGS[l] ? LANGS[l].flag : '🌐');

/* ---- subjects ---- */
export const SUBJECTS = SUBJ as unknown as Record<Subject, { icon: string; name: Record<UiLang, string> }>;
export const subjectName = (s: Subject) => (SUBJECTS[s] || SUBJECTS.other).name[current];
export const subjectIcon = (s: Subject) => (SUBJECTS[s] || SUBJECTS.other).icon;
export const testIcon = (x: Pick<Test, 'subject' | 'foreign'>) => (x.subject === 'languages' ? flag(x.foreign) : subjectIcon(x.subject));

/* ---- test formats (question asked in the student's language) ---- */
const F: Record<UiLang, Record<Format, [string, string, string]>> = {
  en: {
    meaning: ['👀', 'I see the {f} word and write what it means', 'Cue: {f} word → you write the meaning in your own words.'],
    produce: ['✍️', 'I see the {n} word and write it in {f}', 'Cue: meaning → you write the {f} word. Spelling counts.'],
    mc: ['🔘', 'I tick the right answer (multiple choice)', 'You recall first, then pick – tricky look-alike options included.'],
    match: ['🧩', 'I connect words with their meanings', 'Matching in both directions, longer side first.'],
    cloze: ['🕳️', 'I fill gaps in sentences', 'A sentence with a gap → you write the missing word. Spelling counts.'],
    sentence: ['💬', 'I use the words in my own sentences', 'Recall the word first, then write your own sentence.'],
    written: ['📝', 'I write answers in my own words', 'Questions & terms → you answer from memory, then compare.'],
    mixed: ['🤷', "I don't know / a bit of everything", 'Safe choice: you practise recalling in both directions.']
  },
  de: {
    meaning: ['👀', 'Ich sehe das Wort auf {f} und schreibe, was es heißt', 'Hinweis: Wort auf {f} → du schreibst die Bedeutung.'],
    produce: ['✍️', 'Ich sehe das Wort auf {n} und schreibe es auf {f}', 'Hinweis: Bedeutung → du schreibst das Wort auf {f}. Rechtschreibung zählt.'],
    mc: ['🔘', 'Ich kreuze die richtige Antwort an (Multiple Choice)', 'Erst selbst erinnern, dann wählen – mit kniffligen Ähnlichen.'],
    match: ['🧩', 'Ich ordne Wörter ihren Bedeutungen zu', 'Zuordnen in beide Richtungen, die längere Seite zuerst.'],
    cloze: ['🕳️', 'Ich fülle Lücken in Sätzen', 'Satz mit Lücke → du schreibst das fehlende Wort. Rechtschreibung zählt.'],
    sentence: ['💬', 'Ich benutze die Wörter in eigenen Sätzen', 'Erst das Wort abrufen, dann einen eigenen Satz schreiben.'],
    written: ['📝', 'Ich schreibe Antworten in eigenen Worten', 'Fragen & Begriffe → du antwortest aus dem Kopf und vergleichst.'],
    mixed: ['🤷', 'Weiß ich nicht / von allem etwas', 'Sichere Wahl: du übst das Abrufen in beide Richtungen.']
  }
};
export function formatsFor(subject: Subject, foreign: Lang | null, native: Lang) {
  const ids: Format[] = subject === 'languages' ? ['meaning', 'produce', 'mc', 'match', 'cloze', 'sentence', 'mixed'] : ['written', 'mc', 'cloze', 'mixed'];
  return ids.map(id => {
    const [icon, label, how] = F[current][id];
    const rep = (s: string) => s.replace(/\{f\}/g, langName(foreign)).replace(/\{n\}/g, langName(native));
    return { id, icon, label: rep(label), how: rep(how) };
  });
}

/* ---- demo material ("try with an example") ---- */
export function demoRows(test: Pick<Test, 'subject' | 'foreign' | 'native'>): DraftRow[] {
  if (test.subject === 'languages') {
    const sets: Record<string, [string, string][]> = {
      en: [['the table', 'der Tisch'], ['friendly', 'freundlich'], ['to run', 'laufen'], ['the window', 'das Fenster'], ['tired', 'müde'], ['the teacher', 'der Lehrer'], ['to look forward to sth', 'sich auf etw. freuen'], ['the neighbour', 'der Nachbar'], ['to believe', 'glauben'], ['enough', 'genug'], ['the weather', 'das Wetter'], ['to remember', 'sich erinnern']],
      fr: [["l'école (f)", 'die Schule'], ['la fenêtre', 'das Fenster'], ['fatigué, e', 'müde'], ['le voisin', 'der Nachbar'], ['courir', 'laufen'], ['aimable', 'freundlich'], ['le temps', 'das Wetter'], ['croire', 'glauben']],
      es: [['la mesa', 'der Tisch'], ['la ventana', 'das Fenster'], ['cansado, a', 'müde'], ['el vecino', 'der Nachbar'], ['correr', 'laufen'], ['amable', 'freundlich'], ['el tiempo', 'das Wetter'], ['creer', 'glauben']],
      la: [['amicus, -i m.', 'der Freund'], ['villa, -ae f.', 'das Landhaus'], ['laudare', 'loben'], ['magnus, -a, -um', 'groß'], ['semper', 'immer'], ['videre', 'sehen'], ['templum, -i n.', 'der Tempel'], ['bonus, -a, -um', 'gut']],
      de: [['der Tisch', 'the table'], ['freundlich', 'friendly'], ['laufen', 'to run'], ['das Fenster', 'the window'], ['müde', 'tired'], ['die Schule', 'the school'], ['das Mädchen', 'the girl'], ['glauben', 'to believe']]
    };
    let rows = sets[test.foreign || 'en'] || sets.en;
    if (test.native === 'en' && test.foreign !== 'de') rows = rows.map(([a]) => [a, ''] as [string, string]);
    return rows.map(([a, b]) => ({ type: 'pair', a, b, low: !b }));
  }
  return test.native === 'de' ? [
    { type: 'qa', a: 'Was ist die kleinste Einheit des Lebens?', b: 'die Zelle' },
    { type: 'pair', a: 'Mitochondrien', b: 'Kraftwerke der Zelle – erzeugen Energie (ATP)' },
    { type: 'pair', a: 'Zellkern', b: 'enthält die Erbinformation (DNA)' },
    { type: 'cloze', a: 'Bei der [[Photosynthese]] wird Lichtenergie in chemische Energie umgewandelt.', b: 'Photosynthese' },
    { type: 'mc', a: 'Welche Organelle gibt es nur in Pflanzenzellen?', b: 'Chloroplasten', distractors: ['Mitochondrien', 'Ribosomen', 'Zellkern'] },
    { type: 'qa', a: 'Was umgibt jede Zelle?', b: 'die Zellmembran' }
  ] : [
    { type: 'qa', a: 'What is the smallest unit of life?', b: 'the cell' },
    { type: 'pair', a: 'Mitochondria', b: 'power plants of the cell – produce energy (ATP)' },
    { type: 'pair', a: 'Nucleus', b: 'contains the genetic information (DNA)' },
    { type: 'cloze', a: 'In [[photosynthesis]], light energy is turned into chemical energy.', b: 'photosynthesis' },
    { type: 'mc', a: 'Which organelle is found only in plant cells?', b: 'chloroplasts', distractors: ['mitochondria', 'ribosomes', 'nucleus'] },
    { type: 'qa', a: 'What surrounds every cell?', b: 'the cell membrane' }
  ];
}
