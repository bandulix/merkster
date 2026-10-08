import { describe, expect, it } from 'vitest';
import { kidName, whoName } from '../supporters';

/* Regression: the supporter overview said "Mama hat 5 € verdient" – the link's label/relation ("Mama") describes the
   SUPPORTER, so a kid must always be named by their own name. */
describe('kidName (supporter-facing views)', () => {
  const kidWithLinkLabel = { name: 'Lena', label: 'Mama', relation: 'mom' };
  it("uses the kid's own first name, never the supporter label/relation", () => {
    expect(kidName(kidWithLinkLabel)).toBe('Lena');
    expect(kidName({ name: '  Lena Marie Kraus ' })).toBe('Lena');
    expect(kidName({ name: '' })).toBe('?');
  });
  it('whoName (for supporters) still prefers the label – which is why it must not be used for kids', () => {
    expect(whoName(kidWithLinkLabel)).toBe('Mama');
  });
});
