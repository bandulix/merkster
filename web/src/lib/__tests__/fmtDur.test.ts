import { describe, expect, it } from 'vitest';
import { setUiLang } from '../../i18n';
import { fmtDur } from '../util';

describe('fmtDur', () => {
  it('uses a clock under a minute and whole minutes after', () => {
    setUiLang('de');
    expect(fmtDur(0)).toBe('0:00');
    expect(fmtDur(45_000)).toBe('0:45');
    expect(fmtDur(59_400)).toBe('0:59');
    expect(fmtDur(60_000)).toBe('1 Min');
    expect(fmtDur(90_000)).toBe('2 Min');
    setUiLang('en');
    expect(fmtDur(60_000)).toBe('1 min');
    expect(fmtDur(120_000)).toBe('2 min');
  });
});
