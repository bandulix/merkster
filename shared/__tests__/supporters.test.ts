import { describe, expect, it } from 'vitest';
import { FAMILY_RELATIONS, INVITE_SHARE_DEFAULTS, RELATIONS, familyNeedsStudentStats } from '../supporters';

describe('invite share: parents and relatives see grades/stats', () => {
  it('new invitees get results + practice by default; photos stay opt-in', () => {
    expect(INVITE_SHARE_DEFAULTS).toEqual({ showResults: true, showPractice: true, showPhotos: false });
  });
  it('every parent/relative relation needs student stats; coach and other do not force them', () => {
    for (const r of FAMILY_RELATIONS) expect(familyNeedsStudentStats(r), r).toBe(true);
    expect(familyNeedsStudentStats('coach')).toBe(false);
    expect(familyNeedsStudentStats('other')).toBe(false);
    expect(FAMILY_RELATIONS.every(r => (RELATIONS as readonly string[]).includes(r))).toBe(true);
  });
});
