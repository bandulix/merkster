/* Fetch a real article, then keep only cards the article itself supports. */
import { groundCards, parseExtract, parseSearch, sourceOrder, wikiApi, wikiPageUrl, type DraftCard } from '../../shared/material';
import type { CardSource, CardSourceProvider, LearningGoal } from '../../shared/types';

const UA = 'Merkster/0.3.0 (https://github.com/bandulix/merkster; educational study app)';

export interface Article {
  provider: CardSourceProvider;
  lang: 'de' | 'en';
  title: string;
  extract: string;
  revId: number;
  url: string;
}

async function getJson(fetchImpl: typeof fetch, url: string): Promise<unknown | null> {
  try {
    const res = await fetchImpl(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(12_000) });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

export async function lookupArticle(fetchImpl: typeof fetch, provider: CardSourceProvider, lang: 'de' | 'en', query: string, base?: string): Promise<Article | null> {
  const api = wikiApi(provider, lang, base);
  const q = query.replace(/\s+/g, ' ').trim().slice(0, 180);
  if (q.length < 2) return null;
  const search = await getJson(fetchImpl, api + '?' + new URLSearchParams({ action: 'query', list: 'search', srsearch: q, srlimit: '1', format: 'json' }).toString());
  const title = search ? parseSearch(search) : null;
  if (!title) return null;
  const page = await getJson(fetchImpl, api + '?' + new URLSearchParams({
    action: 'query', prop: 'extracts|revisions', explaintext: '1', exchars: '3500', rvprop: 'ids', redirects: '1', titles: title, format: 'json'
  }).toString());
  const parsed = page ? parseExtract(page) : null;
  if (!parsed) return null;
  return { provider, lang, title: parsed.title, extract: parsed.extract, revId: parsed.revId, url: wikiPageUrl(provider, lang, parsed.title) };
}

export interface ResearchCard { goalId: string; front: string; back: string; source: CardSource }

export async function researchGoals(args: {
  goals: LearningGoal[];
  lang: 'de' | 'en';
  fetch: typeof fetch;
  wikiBase?: string;
  complete: (goal: string, extract: string) => Promise<unknown>;
}): Promise<{ cards: ResearchCard[]; missing: { id: string; topic: string }[]; noSource: boolean }> {
  const cards: ResearchCard[] = [];
  const missing: { id: string; topic: string }[] = [];
  for (const goal of args.goals.slice(0, 8)) {
    const query = (goal.topic || goal.text).slice(0, 120);
    let article: Article | null = null;
    for (const step of sourceOrder(args.lang)) {
      article = await lookupArticle(args.fetch, step.provider, step.lang, query, args.wikiBase);
      if (article) break;
    }
    if (!article) { missing.push({ id: goal.id, topic: goal.topic }); continue; }
    let raw: unknown = null;
    try { raw = await args.complete(goal.text, article.extract); } catch { raw = null; }
    const kept: DraftCard[] = groundCards(raw, article.extract);
    if (!kept.length) { missing.push({ id: goal.id, topic: goal.topic }); continue; }
    const source: CardSource = { provider: article.provider, lang: article.lang, title: article.title, url: article.url, revId: article.revId };
    for (const card of kept) cards.push({ goalId: goal.id, front: card.front, back: card.back, source });
  }
  return { cards, missing, noSource: cards.length === 0 };
}
