/* A second explanation. Cached per card, style and age band. The model cannot shame or link. */
import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { acceptExplain, explainKey, fallbackExplain, isStyle, type ExplainStyle } from '../../shared/explain';
import { callLLM, parseContent } from './ai';
import type { Config } from './config';

const PROMPT = `EXPLAIN_CARD
You explain one school card again, in a different way. ONE or TWO short sentences, or up to four short steps.
The student is a minor. No shame, no pressure, no links, no personal facts.
Style example: a concrete everyday example.
Style mnemonic: a picture they can remember.
Style steps: numbered steps, one idea each.
Style sketch: two to four short labels separated by " → ". No sentences.
Reply JSON {"text":"..."}.`;

export async function explainPlugin(app: FastifyInstance, { pool, config }: { pool: pg.Pool; config: Config }) {
  app.post('/api/explain', { preHandler: app.requireUser }, async (req, reply) => {
    const body = (req.body || {}) as { term?: unknown; meaning?: unknown; style?: unknown; band?: unknown; lang?: unknown };
    if (!isStyle(body.style)) return reply.code(400).send({ error: 'bad_style' });
    const term = String(body.term || '').replace(/\s+/g, ' ').trim().slice(0, 200);
    const meaning = String(body.meaning || '').replace(/\s+/g, ' ').trim().slice(0, 200);
    if (term.length < 1 || meaning.length < 1) return reply.code(400).send({ error: 'empty' });
    const lang = body.lang === 'en' ? 'en' : 'de';
    const band = body.band === 'young' || body.band === 'teen' || body.band === 'mid' ? body.band : 'mid';
    const key = explainKey(term, meaning, body.style, band);
    const cached = (await pool.query('SELECT body, sketch FROM explain_cache WHERE item_key = $1 AND style = $2 AND band = $3', [key, body.style, band])).rows[0];
    if (cached) return { text: cached.body, sketch: cached.sketch, cached: true };
    let packed = fallbackExplain(body.style, term, meaning, lang);
    if (config.aiConfigured) {
      try {
        const out = await callLLM(config, {
          model: config.llm.textModel, temperature: 0.3, max_tokens: 220,
          messages: [
            { role: 'system', content: PROMPT },
            { role: 'user', content: `Style: ${body.style}. Age band: ${band}. Language: ${lang}. Term: ${term}. Meaning: ${meaning}.` }
          ]
        });
        const obj = parseContent(out?.choices?.[0]?.message?.content) as { text?: unknown };
        const ok = acceptExplain(obj?.text, body.style as ExplainStyle);
        if (ok) packed = ok;
      } catch { /* fallback already set */ }
    }
    await pool.query(`INSERT INTO explain_cache (item_key, style, band, body, sketch) VALUES ($1,$2,$3,$4,$5)
      ON CONFLICT (item_key, style, band) DO NOTHING`, [key, body.style, band, packed.text, packed.sketch ? JSON.stringify(packed.sketch) : null]);
    return { text: packed.text, sketch: packed.sketch, cached: false };
  });
}
