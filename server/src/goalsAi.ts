/* Vision read of a Lernziele sheet, then a text call that writes the study tasks.
   The key stays on the server. Images are not stored. */
import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { buildTasks, questionsFor, validateGoalsExtract, type LearningGoal } from '../../shared/goals';
import type { Subject } from '../../shared/types';
import { callLLM, parseContent, screenSchoolMaterial } from './ai';
import type { Config } from './config';
import { reservePictures } from './limits';
import { ID_RE } from './sanitize';

export const GOALS_PROMPT = `GOALS_SHEET
You read a photo or text of a school's learning goals (Lernziele) for any subject. The student will get a study plan from what you extract.
RULES
- Use ONLY goals that are visible. Do not invent extra goals.
- One goal per item, in the student's wording (keep umlauts).
- kind is one of: facts (definitions, names, dates), concepts (why/how it works), procedures (steps, calculations, methods), transfer (apply to a new case), essay (argue, interpret, write), sequence (order, timeline).
- subject is one of: biology, history, geography, chemistry, physics, math, politics, economics, religion, music, languages, other.
- gradeLevel: the year or school type if it is printed (e.g. "Gymnasium Klasse 10"), else "".
- examFormat: written, oral, mixed, mc, or "" if the sheet does not say.
- questions: ONLY if something essential is missing and is not on the sheet. Usually an empty array. Each question has kind material|scope|level|exam and a short prompt in the UI language given below.
- Do not ask for the exam date, a name, or anything already printed.
- unreadable: short notes in the UI language for cut-off lines. Do not guess them into goals.
- Output STRICT JSON only.
SCHEMA
{"language":"de","subject":"biology","title":"short title","gradeLevel":"","examFormat":"","goals":[{"id":"g1","text":"...","topic":"short","kind":"facts"}],"questions":[],"unreadable":[]}`;

export const PLAN_PROMPT = `STUDY_PLAN
You write practice tasks for learning goals. The app already chose the method. You only write the tasks.
RULES
- Stay inside the goal text. You may phrase questions, short answers, worked steps and plausible wrong options. Do not add unrelated facts.
- For each goal write 2 learn tasks and 1 mock task (phase "mock", a mixed exam-style question).
- activity: recall (short answer), worked (numbered steps of a solved example), problem (a similar unsolved problem), explain (why, in their own words), outline (essay structure), sequence (order), transfer (new situation).
- Match the activity to the method you are given: retrieval→recall, worked→worked then problem, elaboration→explain, essay→outline, timeline→sequence, mixed→transfer.
- Answers that are explanations may be 1–3 sentences. Fact answers stay short.
- mc needs 3 distractors. Other types use distractors: [].
- Write in the language requested.
- Output STRICT JSON only.
SCHEMA
{"tasks":[{"goalId":"g1","activity":"recall","type":"qa","phase":"learn","front":"...","back":"...","distractors":[]}]}`;

function sniffImage(buf: Buffer): string | null {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.length > 12 && buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  return null;
}
class UpstreamError extends Error { constructor(public status: number) { super('upstream_' + status); } }

async function complete(config: Config, model: string, system: string, user: unknown, maxTokens: number) {
  const body: Record<string, unknown> = { model, temperature: 0.2, max_tokens: maxTokens, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] };
  if (config.llm.jsonMode !== 'off') body.response_format = { type: 'json_object' };
  try { return await callLLM(config, body); }
  catch (e) {
    const status = (e as { status?: number }).status;
    if (config.llm.jsonMode === 'auto' && (status === 400 || status === 422)) { delete body.response_format; return await callLLM(config, body); }
    if (e instanceof UpstreamError) throw e;
    throw e;
  }
}

export async function goalsAiPlugin(app: FastifyInstance, { pool, config }: { pool: pg.Pool; config: Config }) {
  app.post('/api/ai/goals', { preHandler: app.requireUser }, async (req, reply) => {
    if (!config.aiConfigured) return reply.code(503).send({ error: 'ai_not_configured' });
    const uid = req.user!.id;
    const usage = (await pool.query(`SELECT count(*) FILTER (WHERE created_at > now() - interval '1 hour') AS h, count(*) AS d FROM ai_requests WHERE user_id = $1 AND created_at > now() - interval '1 day'`, [uid])).rows[0];
    if (Number(usage.h) >= config.aiLimitHour || Number(usage.d) >= config.aiLimitDay) return reply.code(429).send({ error: 'ai_rate_limited' });
    if (!req.isMultipart()) return reply.code(415).send({ error: 'multipart_required' });
    const images: Buffer[] = [], mimes: string[] = [];
    let text = '', meta: Record<string, unknown> = {};
    try {
      for await (const part of req.parts()) {
        if (part.type === 'file') {
          const buf = await part.toBuffer();
          if (part.file.truncated) return reply.code(413).send({ error: 'file_too_large', maxMB: config.maxUploadMB });
          const mime = sniffImage(buf);
          if (!mime) return reply.code(415).send({ error: 'unsupported_image' });
          images.push(buf); mimes.push(mime);
        } else if (part.fieldname === 'meta') { try { meta = JSON.parse(String(part.value || '{}')); } catch { return reply.code(400).send({ error: 'bad_meta' }); } }
        else if (part.fieldname === 'text') text = String(part.value || '').slice(0, 20000);
      }
    } catch (e) {
      const code = (e as { code?: string }).code || '';
      if (code === 'FST_REQ_FILE_TOO_LARGE') return reply.code(413).send({ error: 'file_too_large', maxMB: config.maxUploadMB });
      if (code === 'FST_FILES_LIMIT') return reply.code(413).send({ error: 'too_many_files', max: config.maxUploadFiles });
      throw e;
    }
    if (!images.length && !text.trim()) return reply.code(400).send({ error: 'nothing_to_read' });
    if (images.length) {
      const testId = typeof meta.testId === 'string' ? meta.testId : '';
      if (!ID_RE.test(testId)) return reply.code(400).send({ error: 'test_required' });
      const slot = await reservePictures(pool, uid, testId, images.length);
      if (!slot.accepted) return reply.code(422).send({ error: 'picture_limit', max: slot.max, used: slot.used });
      images.splice(slot.accepted); mimes.splice(slot.accepted);
    }
    const ui = meta.uiLang === 'en' ? 'English' : 'German';
    const started = Date.now();
    const log = await pool.query('INSERT INTO ai_requests (user_id, images) VALUES ($1, $2) RETURNING id', [uid, images.length]);
    try {
      await screenSchoolMaterial(config, images, mimes, text || undefined);
      const user: unknown[] = [{ type: 'text', text: `UI language for questions and unreadable notes: ${ui}.\nSubject hint: ${typeof meta.subject === 'string' ? meta.subject : 'detect'}.` + (text.trim() ? '\n"""\n' + text.slice(0, 12000) + '\n"""' : '') }];
      images.forEach((buf, i) => user.push({ type: 'image_url', image_url: { url: `data:${mimes[i]};base64,${buf.toString('base64')}`, detail: 'high' } }));
      const model = images.length ? config.llm.visionModel : config.llm.textModel;
      const out = await complete(config, model, GOALS_PROMPT, user, config.llm.maxTokens);
      const msg = out?.choices?.[0]?.message;
      if (!msg) throw Object.assign(new Error('bad_json'), { code: 'bad_json' });
      const parsed = validateGoalsExtract(parseContent(msg.content));
      if (!parsed.goals.length) throw Object.assign(new Error('bad_json'), { code: 'bad_json' });
      const days = typeof meta.days === 'number' ? meta.days : 14;
      parsed.questions = questionsFor({ goals: parsed.goals, days, level: parsed.level, exam: parsed.examFormat, llm: parsed.questions });
      await pool.query('UPDATE ai_requests SET ok = TRUE, cards = $2, ms = $3 WHERE id = $1', [log.rows[0].id, parsed.goals.length, Date.now() - started]);
      req.log.info({ userId: String(uid), goals: parsed.goals.length, ms: Date.now() - started }, 'ai goals');
      return { ...parsed, model };
    } catch (e) {
      await pool.query('UPDATE ai_requests SET ms = $2 WHERE id = $1', [log.rows[0].id, Date.now() - started]);
      const err = e as Error & { status?: number; code?: string };
      if (err.code === 'not_school_material') return reply.code(422).send({ error: 'not_school_material' });
      req.log.warn({ userId: String(uid), upstreamStatus: err.status, err: err.name === 'AbortError' ? 'timeout' : err.code || err.message }, 'ai goals failed');
      if (err.name === 'AbortError') return reply.code(504).send({ error: 'ai_timeout' });
      if (err.code === 'bad_json') return reply.code(502).send({ error: 'ai_bad_output' });
      return reply.code(502).send({ error: 'ai_upstream', status: err.status || null });
    }
  });

  app.post('/api/ai/goals/plan', { preHandler: app.requireUser }, async (req, reply) => {
    if (!config.aiConfigured) return reply.code(503).send({ error: 'ai_not_configured' });
    const uid = req.user!.id;
    const body = (req.body || {}) as { goals?: LearningGoal[]; lang?: string; days?: number; minutes?: number; subject?: Subject };
    const extracted = validateGoalsExtract({ goals: body.goals, subject: body.subject, language: body.lang });
    if (!extracted.goals.length) return reply.code(400).send({ error: 'no_goals' });
    const days = Math.max(1, Math.min(120, Math.round(Number(body.days) || 7)));
    const minutes = Math.max(10, Math.min(120, Math.round(Number(body.minutes) || 20)));
    const lang = body.lang === 'en' ? 'en' : 'de';
    const lines = extracted.goals.map(g => `GOAL ${g.id} ${g.kind} ${g.method} ${g.text}`).join('\n');
    const usage = (await pool.query(`SELECT count(*) FILTER (WHERE created_at > now() - interval '1 hour') AS h, count(*) AS d FROM ai_requests WHERE user_id = $1 AND created_at > now() - interval '1 day'`, [uid])).rows[0];
    if (Number(usage.h) >= config.aiLimitHour || Number(usage.d) >= config.aiLimitDay) {
      return { tasks: buildTasks(extracted.goals, null, lang, days, minutes), model: null, fallback: true };
    }
    const started = Date.now();
    const log = await pool.query('INSERT INTO ai_requests (user_id, images) VALUES ($1, 0) RETURNING id', [uid]);
    try {
      const out = await complete(config, config.llm.textModel, PLAN_PROMPT, `Language: ${lang === 'de' ? 'German' : 'English'}.\n${lines}`, config.llm.maxTokens);
      const msg = out?.choices?.[0]?.message;
      const content = msg ? parseContent(msg.content) : null;
      const tasks = buildTasks(extracted.goals, content, lang, days, minutes);
      await pool.query('UPDATE ai_requests SET ok = TRUE, cards = $2, ms = $3 WHERE id = $1', [log.rows[0].id, tasks.length, Date.now() - started]);
      return { tasks, model: config.llm.textModel };
    } catch (e) {
      await pool.query('UPDATE ai_requests SET ms = $2 WHERE id = $1', [log.rows[0].id, Date.now() - started]);
      req.log.warn({ userId: String(uid), err: (e as Error).message }, 'ai plan fell back to templates');
      return { tasks: buildTasks(extracted.goals, null, lang, days, minutes), model: null, fallback: true };
    }
  });
}
