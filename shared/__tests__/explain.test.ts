import { describe, expect, it } from 'vitest';
import { acceptExplain, explainKey, fallbackExplain, parseSketch } from '../explain';

describe('another explanation', () => {
  it('caches by the card, the style and the age band', () => {
    const a = explainKey('Zellkern', 'DNA', 'example', 'young');
    const b = explainKey('Zellkern', 'DNA', 'steps', 'young');
    const c = explainKey('Zellkern', 'DNA', 'example', 'teen');
    expect(a).not.toBe(b);
    expect(a).not.toBe(c);
    expect(explainKey('Zellkern', 'DNA', 'example', 'young')).toBe(a);
    expect(explainKey('Zellkern', 'DNA', 'example', 'young', 'en')).not.toBe(a);
  });
  it('keeps a kind line and drops a link or a shove', () => {
    expect(acceptExplain('Der Kern ist wie ein Tresor für die DNA.', 'example')?.text).toMatch(/Tresor/);
    expect(acceptExplain('Schau auf https://evil.test', 'example')).toBeNull();
    expect(acceptExplain('Du musst das jetzt können.', 'mnemonic')).toBeNull();
  });
  it('turns two labels into a sketch and falls back to a fixed line', () => {
    expect(parseSketch('Zellkern → DNA')).toEqual([{ label: 'Zellkern' }, { label: 'DNA' }]);
    const fb = fallbackExplain('sketch', 'Zellkern', 'enthält die DNA', 'de');
    expect(fb.sketch?.length).toBe(2);
    expect(fallbackExplain('example', 'Zellkern', 'DNA', 'de').text).toMatch(/Zellkern/);
  });
});
