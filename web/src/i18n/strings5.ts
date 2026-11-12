/* Grading systems. The student picks one; it can differ per test. */
export const en5 = {
  gs_at_grade: 'Austria 1–5', gs_ch_grade: 'Switzerland 6–1', gs_us_letter: 'US letters A–F', gs_uk_gcse: 'UK GCSE 9–1',
  ob_grading: 'How are your tests graded?', ob_grading_sub: 'You can change this later and per test.', td_grading: 'Grading for this test', td_grading_default: 'My default ({sys})'
} as const;
export const de5: Record<keyof typeof en5, string> = {
  gs_at_grade: 'Österreich 1–5', gs_ch_grade: 'Schweiz 6–1', gs_us_letter: 'US-Noten A–F', gs_uk_gcse: 'UK GCSE 9–1',
  ob_grading: 'Wie werden deine Arbeiten benotet?', ob_grading_sub: 'Du kannst das später und pro Test ändern.', td_grading: 'Notensystem für diesen Test', td_grading_default: 'Mein Standard ({sys})'
};
