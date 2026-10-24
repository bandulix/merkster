import { describe, expect, it } from 'vitest';
import { localizeNote, setUiLang, tp } from './index';

describe('tp plural forms', () => {
  it('picks one/other for DE card counts', () => {
    setUiLang('de');
    expect(tp('n_cards', 1)).toBe('1 Karte');
    expect(tp('n_cards', 6)).toBe('6 Karten');
    expect(tp('hero_ready', 1)).toBe('1 Karte wartet auf dich');
    expect(tp('done_sub', 1)).toBe('1 Karte abgerufen.');
    expect(tp('done_sub', 4)).toBe('4 Karten abgerufen.');
    expect(tp('streak_days', 1)).toBe('1 Tag in Folge');
    expect(tp('streak_days', 3)).toBe('3 Tage in Folge');
    expect(tp('day_streak', 1)).toBe('Tag-Serie');
    expect(tp('day_streak', 0)).toBe('Tage-Serie');
    expect(tp('save_n', 1)).toBe('1 Karte speichern');
    expect(tp('n_days', 1)).toBe('1 Tag');
    expect(tp('results_count', 1)).toBe('1 Note');
  });
  it('picks one/other for EN', () => {
    setUiLang('en');
    expect(tp('n_cards', 1)).toBe('1 card');
    expect(tp('n_cards', 2)).toBe('2 cards');
    expect(tp('streak_days', 1)).toBe('1-day streak');
    expect(tp('more_today', 1)).toBe('1 more card is waiting today.');
    expect(tp('dur_min', 1)).toBe('1 min');
  });
});

describe('localizeNote', () => {
  it('translates known OCR notes into DE', () => {
    setUiLang('de');
    expect(localizeNote('last line is cut off at the bottom edge')).toBe('Die letzte Zeile ist am unteren Rand abgeschnitten');
  });
  it('keeps unknown notes as-is', () => {
    setUiLang('de');
    expect(localizeNote('weird custom note')).toBe('weird custom note');
  });
});
