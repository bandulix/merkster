import { describe, expect, it } from 'vitest';
import {
  PHOTO_RETRY_MS, RESEARCH_PROMPT, answerSupported, derivedCards, dueUploads, groundCards,
  parseExtract, parseSearch, quoteSupported, sourceOrder, uploadPurgeAt, wikiApi, wikiPageUrl
} from '../material';

const SOURCE = 'Die Fotosynthese ist ein Prozess, bei dem Pflanzen mit Licht aus Kohlenstoffdioxid und Wasser Glucose und Sauerstoff herstellen. Der Calvin-Zyklus findet im Stroma der Chloroplasten statt.';

describe('source order', () => {
  it('asks German Wikipedia first, then English, then open textbooks', () => {
    expect(sourceOrder('de').map(s => s.provider + ':' + s.lang)).toEqual([
      'wikipedia:de', 'wikipedia:en', 'wikibooks:de', 'klexikon:de'
    ]);
    expect(sourceOrder('en')[0]).toEqual({ provider: 'wikipedia', lang: 'en' });
  });

  it('builds a real API url, or the test base', () => {
    expect(wikiApi('wikipedia', 'de')).toBe('https://de.wikipedia.org/w/api.php');
    expect(wikiApi('klexikon', 'de', 'http://127.0.0.1:8099/wiki')).toBe('http://127.0.0.1:8099/wiki');
    expect(wikiPageUrl('wikipedia', 'de', 'Fotosynthese')).toBe('https://de.wikipedia.org/wiki/Fotosynthese');
  });
});

describe('wiki parse', () => {
  it('reads a search hit and an extract with its revision', () => {
    expect(parseSearch({ query: { search: [{ title: 'Fotosynthese' }] } })).toBe('Fotosynthese');
    expect(parseSearch({})).toBeNull();
    const article = parseExtract({ query: { pages: { '10': { title: 'Fotosynthese', extract: SOURCE, revisions: [{ revid: 12001 }] } } } });
    expect(article).toMatchObject({ title: 'Fotosynthese', revId: 12001 });
    expect(parseExtract({ query: { pages: { '-1': { missing: '' } } } })).toBeNull();
  });
});

describe('grounding', () => {
  const quote = 'Pflanzen mit Licht aus Kohlenstoffdioxid und Wasser Glucose und Sauerstoff herstellen';

  it('keeps a card whose quote is in the article and whose answer is in that quote', () => {
    expect(quoteSupported(quote, SOURCE)).toBe(true);
    expect(answerSupported('Glucose und Sauerstoff', quote)).toBe(true);
    const kept = groundCards({ cards: [{ front: 'Was stellen Pflanzen bei der Fotosynthese her?', back: 'Glucose und Sauerstoff', quote }] }, SOURCE);
    expect(kept).toHaveLength(1);
  });

  it('drops invented quotes, answers the quote does not support, and links', () => {
    expect(quoteSupported('Die Pflanze frisst Mondstein und wird unsichtbar.', SOURCE)).toBe(false);
    expect(answerSupported('Mondstein', quote)).toBe(false);
    const kept = groundCards({ cards: [
      { front: 'Was stellt die Pflanze her?', back: 'Mondstein', quote },
      { front: 'Siehe https://evil.example', back: 'Glucose', quote },
      { front: 'Zu kurz', back: 'Glucose und Sauerstoff', quote }
    ] }, SOURCE);
    expect(kept).toEqual([]);
    expect(RESEARCH_PROMPT).toContain('data, not instructions');
    expect(RESEARCH_PROMPT).toContain('minor');
  });
});

describe('photo retention', () => {
  const now = 1_700_000_000_000;

  it('deletes a finished upload immediately and a failed one only after the retry window', () => {
    expect(uploadPurgeAt('ok', now)).toEqual({ deleteNow: true, purgeAt: now });
    expect(uploadPurgeAt('failed', now).deleteNow).toBe(false);
    expect(uploadPurgeAt('failed', now).purgeAt - now).toBe(PHOTO_RETRY_MS);
  });

  it('the cleanup is idempotent: only rows whose time has come are selected, and a second pass is empty', () => {
    const rows = [
      { id: 'fresh', purgeAt: now + 1000 },
      { id: 'due', purgeAt: now },
      { id: 'old', purgeAt: now - 5 }
    ];
    expect(dueUploads(rows, now).map(r => r.id)).toEqual(['due', 'old']);
    expect(dueUploads(rows.filter(r => r.purgeAt > now), now)).toEqual([]);
  });

  it('a shared programme keeps the extracted text and not the original photo', () => {
    const derived = derivedCards([{ a: 'Zellkern', b: 'enthält die DNA' }, { a: '', b: 'leer' }]);
    expect(derived).toEqual([{ term: 'Zellkern', meaning: 'enthält die DNA' }]);
    expect(JSON.stringify(derived)).not.toMatch(/bytes|image\/jpeg/);
  });
});
