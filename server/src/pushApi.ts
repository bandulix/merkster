/* Opt-in reminders. Quiet hours default to 20:00–07:00. One a day. */
import crypto from 'node:crypto';
import { generateVAPIDKeys, sendNotification, setVapidDetails } from 'web-push';
import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { mayNotify, reminderText, type PushPrefs } from '../../shared/offline';
import type { Config } from './config';
import { speakingCompanion } from './companionsApi';

let publicKey = process.env.VAPID_PUBLIC_KEY || '';
let privateKey = process.env.VAPID_PRIVATE_KEY || '';
if (!publicKey || !privateKey) {
  const made = generateVAPIDKeys();
  publicKey = publicKey || made.publicKey;
  privateKey = privateKey || made.privateKey;
}
const subject = process.env.VAPID_SUBJECT || 'mailto:merkster@localhost';
setVapidDetails(subject, publicKey, privateKey);

function prefsOf(row: { enabled?: boolean; hour?: number; quiet_after?: number; quiet_before?: number; last_day?: string | Date | null } | undefined): PushPrefs {
  return {
    enabled: !!row?.enabled,
    hour: row?.hour ?? 16,
    quietAfter: row?.quiet_after ?? 20,
    quietBefore: row?.quiet_before ?? 7,
    lastDay: row?.last_day ? String(row.last_day).slice(0, 10) : null
  };
}

export async function sendDueReminders(pool: pg.Pool, now = new Date()) {
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const rows = (await pool.query('SELECT user_id, enabled, hour, quiet_after, quiet_before, last_day FROM push_prefs WHERE enabled')).rows;
  let sent = 0;
  for (const row of rows) {
    const prefs = prefsOf(row);
    if (!mayNotify(now, prefs, today)) continue;
    const subs = (await pool.query('SELECT endpoint, p256dh, auth FROM push_subs WHERE user_id = $1', [row.user_id])).rows;
    if (!subs.length) continue;
    const speaker = await speakingCompanion(pool, Number(row.user_id)).catch(() => null);
    const body = reminderText(speaker?.name || 'Merki', 1, 'de');
    const payload = JSON.stringify({ title: speaker?.name || 'Merki', body });
    for (const sub of subs) {
      try {
        await sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload);
        sent++;
      } catch { /* drop a dead browser on the next save */ }
    }
    await pool.query('UPDATE push_prefs SET last_day = $2 WHERE user_id = $1', [row.user_id, today]);
  }
  return sent;
}

export async function pushPlugin(app: FastifyInstance, { pool }: { pool: pg.Pool; config: Config }) {
  app.get('/api/push/key', async () => ({ publicKey }));
  app.get('/api/push/prefs', { preHandler: app.requireUser }, async req => {
    const row = (await pool.query('SELECT enabled, hour, quiet_after, quiet_before, last_day FROM push_prefs WHERE user_id = $1', [req.user!.id])).rows[0];
    return { prefs: prefsOf(row) };
  });
  app.put('/api/push/prefs', { preHandler: app.requireUser }, async (req, reply) => {
    const body = (req.body || {}) as { enabled?: unknown; hour?: unknown };
    const enabled = body.enabled === true;
    const hour = Number(body.hour);
    const h = Number.isInteger(hour) && hour >= 7 && hour <= 19 ? hour : 16;
    if (enabled && (h >= 20 || h < 7)) return reply.code(400).send({ error: 'quiet_hours' });
    await pool.query(`INSERT INTO push_prefs (user_id, enabled, hour) VALUES ($1,$2,$3)
      ON CONFLICT (user_id) DO UPDATE SET enabled = EXCLUDED.enabled, hour = EXCLUDED.hour`, [req.user!.id, enabled, h]);
    return { prefs: prefsOf({ enabled, hour: h, quiet_after: 20, quiet_before: 7, last_day: null }) };
  });
  app.post('/api/push/subscribe', { preHandler: app.requireUser }, async (req, reply) => {
    const body = (req.body || {}) as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
    const endpoint = String(body.endpoint || '');
    const p256dh = String(body.keys?.p256dh || '');
    const auth = String(body.keys?.auth || '');
    if (!endpoint.startsWith('https://') || !p256dh || !auth) return reply.code(400).send({ error: 'bad_sub' });
    await pool.query(`INSERT INTO push_subs (id, user_id, endpoint, p256dh, auth) VALUES ($1,$2,$3,$4,$5)
      ON CONFLICT (endpoint) DO UPDATE SET user_id = EXCLUDED.user_id, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth`,
      [crypto.randomBytes(9).toString('base64url'), req.user!.id, endpoint.slice(0, 500), p256dh.slice(0, 200), auth.slice(0, 200)]);
    return { ok: true };
  });
}
