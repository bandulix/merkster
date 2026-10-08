import { describe, expect, it } from 'vitest';
import { rulingMask, skewAngle } from '../ocr';

/** synthetic grayscale page (1 byte per pixel): white background, a tilted ruling and a few "letters" */
function page(w: number, h: number, deg: number) {
  const g = new Uint8ClampedArray(w * h).fill(255);
  const t = Math.tan(deg * Math.PI / 180);
  for (const y0 of [40, 90, 140]) for (let x = 10; x < w - 10; x++) { const y = Math.round(y0 + x * t); if (y >= 0 && y < h) g[y * w + x] = 0; }
  for (let i = 0; i < 30; i++) { const x0 = 20 + i * 12, y0 = Math.round(60 + x0 * t); for (let y = y0; y < y0 + 12; y++) for (let x = x0; x < x0 + 6; x++) g[y * w + x] = 0; }
  return g;
}

describe('OCR preprocessing', () => {
  it('finds the skew of a tilted table', () => {
    expect(skewAngle(page(420, 220, 2), 420, 220, 1)).toBeCloseTo(2, 0);
    expect(skewAngle(page(420, 220, -3), 420, 220, 1)).toBeCloseTo(-3, 0);
    expect(skewAngle(page(420, 220, 0), 420, 220, 1)).toBe(0);
  });
  it('masks long rulings but keeps letters', () => {
    const w = 420, h = 220, g = page(w, h, 0), m = rulingMask(g, w, h, 1);
    expect(m[40 * w + 200]).toBe(1);          // on the ruling
    expect(m[65 * w + 22]).toBe(0);           // inside a letter
  });
});

describe('restoreDiacritics', () => {
  it('takes umlauts from the second pass, leaves other words alone', async () => {
    const { restoreDiacritics } = await import('../ocr');
    const w = (text: string) => ({ text, conf: 90, x0: 0, y0: 0, x1: 1, y1: 1 });
    const r = { words: [w('der'), w('Schuler'), w('spat'), w('pupil')], lines: [[w('der'), w('Schuler')]], text: 'der Schuler spat pupil' };
    expect(restoreDiacritics(r, [w('Schüler'), w('spät'), w('Strasse')])).toBe(3);
    expect(r.words.map(x => x.text)).toEqual(['der', 'Schüler', 'spät', 'pupil']);
    expect(r.text).toBe('der Schüler spät pupil');
  });
});
