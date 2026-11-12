/* Merki speaks one way. The model only sees a small sanitized context.
   A bad or missing reply falls back to a fixed line. Cached per trigger and day. */
import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { cleanContext, fallbackLine, MERKI_POSES, MERKI_TRIGGERS, poseFor, promptFor, validateLine, type MerkiPose, type MerkiTrigger } from '../../shared/merki';
import { callLLM, parseContent } from './ai';
import type { Config } from './config';
import { companionSystem, speakingCompanion } from './companionsApi';

export const MERKI_PROMPT = `MERKI_LINE
You are Merki, a kind alien who studies with a school student. You speak in ONE or TWO short sentences. You never ask them to reply.
RULES
- Motivate. Comment on the numbers you are given. Invite them to a short study round. Celebrate a streak or a saved grade. If they are behind, be gentle and specific, never harsh.
- Age band "young": warm, playful, simple words. "mid": friendly, plain. "teen": cool, short, no baby talk, no slang that mocks.
- Use only the name, counts, and plan title you are given. Do not invent grades, friends, schools, or facts.
- No links, no email, no pressure, no shame, no comparison that ranks someone as worse.
- Output STRICT JSON: {"line":"...","pose":"happy|cheering|thinking|nudging|sleepy|proud"}.`;

const dayISO = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export async function merkiPlugin(app: FastifyInstance, { pool, config }: { pool: pg.Pool; config: Config }) {
  app.post('/api/merki', { preHandler: app.requireUser }, async (req, reply) => {
    const body = (req.body || {}) as { trigger?: unknown; context?: unknown };
    const trigger = (MERKI_TRIGGERS as readonly string[]).includes(String(body.trigger)) ? body.trigger as MerkiTrigger : null;
    if (!trigger) return reply.code(400).send({ error: 'bad_trigger' });
    const uid = req.user!.id;
    const user = (await pool.query('SELECT name FROM users WHERE id = $1', [uid])).rows[0];
    const ctx = cleanContext(body.context, String(user?.name || ''));
    const day = dayISO();
    const speaker = await speakingCompanion(pool, uid);
    const cid = speaker?.id || '';
    const cached = (await pool.query('SELECT line, pose FROM merki_lines WHERE user_id = $1 AND day = $2 AND trigger = $3 AND band = $4 AND companion_id = $5', [uid, day, trigger, ctx.band, cid])).rows[0];
    if (cached) return { line: cached.line, pose: cached.pose, cached: true };
    const used = Number((await pool.query(`SELECT count(*) FROM merki_lines WHERE user_id = $1 AND created_at > now() - interval '1 day'`, [uid])).rows[0].count);
    let line = '', pose: MerkiPose = poseFor(trigger, ctx.hour);
    if (config.aiConfigured && used < 12) {
      try {
        const out = await callLLM(config, {
          model: config.llm.textModel, temperature: 0.4, max_tokens: 180,
          messages: [{ role: 'system', content: companionSystem(MERKI_PROMPT, speaker) }, { role: 'user', content: promptFor(ctx, trigger) }]
        });
        const obj = parseContent(out?.choices?.[0]?.message?.content) as { line?: unknown; pose?: unknown };
        const ok = validateLine(obj?.line);
        if (ok) {
          line = ok;
          if ((MERKI_POSES as readonly string[]).includes(String(obj.pose))) pose = obj.pose as MerkiPose;
        }
      } catch { /* fallback below */ }
    }
    if (!line) ({ line, pose } = fallbackLine(ctx, trigger));
    await pool.query(`INSERT INTO merki_lines (user_id, day, trigger, band, companion_id, line, pose) VALUES ($1,$2,$3,$4,$5,$6,$7)
      ON CONFLICT (user_id, day, trigger, band, companion_id) DO NOTHING`, [uid, day, trigger, ctx.band, cid, line, pose]);
    return { line, pose, cached: false };
  });
}
