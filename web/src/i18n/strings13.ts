export const en13 = {
  mock_open: 'Practice test',
  mock_lead: 'Practice test opens',
  mock_days: '{n} days before',
  mock_title: 'Practice test',
  mock_untimed: 'No timer',
  mock_timed: '15 minutes',
  mock_start: 'Start',
  mock_send: 'Hand in',
  mock_score: 'Score',
  mock_grade: 'Estimated grade',
  mock_weak: 'We will practise these again',
  mock_none: 'Nothing wobbled. Nice.',
  mock_extra: 'Added to your plan',
  mock_note: 'This is a practice test, not the real grade.'
} as const;
export const de13: Record<keyof typeof en13, string> = {
  mock_open: 'Probeprüfung',
  mock_lead: 'Probeprüfung öffnet',
  mock_days: '{n} Tage vorher',
  mock_title: 'Probeprüfung',
  mock_untimed: 'Ohne Uhr',
  mock_timed: '15 Minuten',
  mock_start: 'Start',
  mock_send: 'Abgeben',
  mock_score: 'Punkte',
  mock_grade: 'Geschätzte Note',
  mock_weak: 'Das üben wir noch einmal',
  mock_none: 'Nichts wackelt. Stark.',
  mock_extra: 'In den Plan gelegt',
  mock_note: 'Das ist eine Übung, nicht die echte Note.'
};
