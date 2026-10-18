/* Merkster – profile pictures.
   On every sign-in we take the OIDC `picture` claim, ask Google for a 256 px square (=s256-c), download it
   (https://*.googleusercontent.com only; size/type checked) and store it in Postgres. Clients get a
   *signed* same-origin URL /api/avatars/:id?v=<etag>&s=<hmac>: only endpoints that are allowed to show
   a person hand out their URL, it is cacheable forever (the etag changes with the picture), and it works
   in <canvas> without CORS taint. No picture / download failed → the app draws colourful initials. */
import crypto from 'node:crypto';
import type { FastifyBaseLogger, FastifyInstance } from 'fastify';
import type pg from 'pg';
import type { Config } from './config';

const MAX_BYTES = 2 * 1024 * 1024;
let secret = '';
export const initAvatars = (config: Config) => { secret = config.appSecret; };
const sig = (id: string, etag: string) => crypto.createHmac('sha256', secret).update(`avatar:${id}:${etag}`).digest('base64url').slice(0, 22);
/** the URL the browser uses for a user's picture (null = draw initials) */
export const avatarPath = (id: number | string, etag: string | null | undefined) => (etag ? `/api/avatars/${id}?v=${etag}&s=${sig(String(id), etag)}` : null);

/** Google picture URLs take a size suffix: …=s96-c → …=s256-c */
export function sizedPictureUrl(u: string, size = 256) {
  if (/=s\d+(-[a-z]+)*$/i.test(u)) return u.replace(/=s\d+(-[a-z]+)*$/i, `=s${size}-c`);
  if (/=[whscpk0-9-]+$/i.test(u) && /googleusercontent\.com\//.test(u)) return u.replace(/=[whscpk0-9-]+$/i, `=s${size}-c`);
  return u + `=s${size}-c`;
}
export function pictureAllowed(u: string, config: Pick<Config, 'google'>) {
  try {
    const url = new URL(u);
    if (url.protocol === 'https:' && /(^|\.)googleusercontent\.com$/i.test(url.hostname)) return true;
    // the bundled mock provider (tests only – refused in production by validateConfig)
    return config.google.testIssuer && url.origin === new URL(config.google.issuer).origin;
  } catch { return false; }
}
const sniff = (b: Buffer) => b.length > 3 && b[0] === 0x89 && b[1] === 0x50 ? 'image/png' : b.length > 3 && b[0] === 0xff && b[1] === 0xd8 ? 'image/jpeg'
  : b.length > 12 && b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP' ? 'image/webp' : b.length > 3 && b.subarray(0, 3).toString() === 'GIF' ? 'image/gif' : null;

/** True once the student has chosen a picture or chosen to have none. Google login must not replace that. */
export const keepUserAvatar = (custom: boolean | null | undefined) => !!custom;

/** Drop JPEG APP/COM segments (EXIF, GPS, comments) and keep the image data. */
export function stripJpegMeta(raw: Buffer): Buffer {
  if (raw.length < 4 || raw[0] !== 0xff || raw[1] !== 0xd8) return raw;
  const out: Buffer[] = [raw.subarray(0, 2)];
  let i = 2;
  while (i + 3 < raw.length && raw[i] === 0xff) {
    const marker = raw[i + 1];
    if (marker === 0xda || marker === 0xd9) { out.push(raw.subarray(i)); return Buffer.concat(out); }
    if (marker === 0x00 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) { out.push(raw.subarray(i, i + 2)); i += 2; continue; }
    if (i + 4 > raw.length) break;
    const len = raw.readUInt16BE(i + 2);
    if (len < 2 || i + 2 + len > raw.length) break;
    const skip = (marker >= 0xe0 && marker <= 0xef) || marker === 0xfe;
    if (!skip) out.push(raw.subarray(i, i + 2 + len));
    i += 2 + len;
  }
  out.push(raw.subarray(i));
  return Buffer.concat(out);
}

export const AVATAR_UPLOAD_MAX = 512 * 1024;
const CUSTOM_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

/** Validate a student upload. JPEG metadata is removed. Anything else is refused. */
export function prepareAvatarUpload(raw: Buffer): { bytes: Buffer; type: string; etag: string } | null {
  if (raw.length < 32 || raw.length > AVATAR_UPLOAD_MAX) return null;
  const type = sniff(raw);
  if (!type || !CUSTOM_TYPES.has(type)) return null;
  const bytes = type === 'image/jpeg' ? stripJpegMeta(raw) : raw;
  if (sniff(bytes) !== type || bytes.length < 32 || bytes.length > AVATAR_UPLOAD_MAX) return null;
  return { bytes, type, etag: crypto.createHash('sha256').update(bytes).digest('hex').slice(0, 16) };
}

/** download + store the Google picture, unless the student has chosen their own (or chosen none) */
export async function refreshAvatar(pool: pg.Pool, config: Config, userId: number, picture: string | null, log: FastifyBaseLogger) {
  const row = (await pool.query('SELECT avatar_custom FROM users WHERE id = $1', [userId])).rows[0];
  if (keepUserAvatar(row?.avatar_custom)) return;
  if (!picture) { await pool.query('UPDATE users SET avatar_data = NULL, avatar_type = NULL, avatar_etag = NULL, avatar_url = NULL WHERE id = $1', [userId]); return; }
  const url = sizedPictureUrl(picture);
  if (!pictureAllowed(url, config)) { log.warn({ userId: String(userId) }, 'profile picture host not allowed – using initials'); return; }
  const ac = new AbortController(), timer = setTimeout(() => ac.abort(), 4000);
  try {
    const res = await fetch(url, { signal: ac.signal, redirect: 'error', headers: { accept: 'image/*' } });
    if (!res.ok) throw new Error('http ' + res.status);
    if (Number(res.headers.get('content-length') || 0) > MAX_BYTES) throw new Error('too large');
    const buf = Buffer.from(await res.arrayBuffer());
    const type = sniff(buf);
    if (!type || buf.length > MAX_BYTES || buf.length < 32) throw new Error('not an image');
    const etag = crypto.createHash('sha256').update(buf).digest('hex').slice(0, 16);
    await pool.query('UPDATE users SET avatar_data = $2, avatar_type = $3, avatar_etag = $4, avatar_fetched_at = now() WHERE id = $1', [userId, buf, type, etag]);
  } catch (e) {
    log.warn({ userId: String(userId), err: (e as Error).message }, 'profile picture download failed – keeping cached/initials');
  } finally { clearTimeout(timer); }
}

async function meUser(pool: pg.Pool, id: number) {
  const u = (await pool.query('SELECT id, email, name, avatar_etag, is_admin, is_supporter, created_at FROM users WHERE id = $1', [id])).rows[0];
  const c = (await pool.query(`SELECT (SELECT count(*) FROM supporter_links WHERE supporter_id = $1)::int AS kids, (SELECT count(*) FROM supporter_links WHERE student_id = $1)::int AS supporters`, [id])).rows[0];
  return {
    id: String(u.id), name: u.name, email: u.email || null, avatar: avatarPath(u.id, u.avatar_etag), isAdmin: !!u.is_admin, createdAt: u.created_at,
    isSupporter: !!u.is_supporter || c.kids > 0, kids: c.kids, supporters: c.supporters
  };
}

export async function avatarsPlugin(app: FastifyInstance, { pool }: { pool: pg.Pool }) {
  app.post('/api/me/avatar', { preHandler: app.requireUser }, async (req, reply) => {
    if (!req.isMultipart()) return reply.code(415).send({ error: 'multipart_required' });
    let buf: Buffer | null = null;
    try {
      for await (const part of req.parts()) {
        if (part.type !== 'file') continue;
        buf = await part.toBuffer();
        if (part.file.truncated) return reply.code(413).send({ error: 'file_too_large' });
        break;
      }
    } catch (e) {
      const code = (e as { code?: string }).code || '';
      if (code === 'FST_REQ_FILE_TOO_LARGE') return reply.code(413).send({ error: 'file_too_large' });
      throw e;
    }
    const prepared = buf ? prepareAvatarUpload(buf) : null;
    if (!prepared) return reply.code(415).send({ error: 'unsupported_image' });
    const uid = req.user!.id;
    await pool.query('UPDATE users SET avatar_data = $2, avatar_type = $3, avatar_etag = $4, avatar_custom = TRUE, avatar_fetched_at = now() WHERE id = $1', [uid, prepared.bytes, prepared.type, prepared.etag]);
    req.log.info({ userId: String(uid) }, 'profile picture set by user');
    return { user: await meUser(pool, uid) };
  });

  app.delete('/api/me/avatar', { preHandler: app.requireUser }, async req => {
    const uid = req.user!.id;
    await pool.query('UPDATE users SET avatar_data = NULL, avatar_type = NULL, avatar_etag = NULL, avatar_custom = TRUE WHERE id = $1', [uid]);
    req.log.info({ userId: String(uid) }, 'profile picture removed by user');
    return { user: await meUser(pool, uid) };
  });

  app.get<{ Params: { id: string }; Querystring: { v?: string; s?: string } }>('/api/avatars/:id', async (req, reply) => {
    const { id } = req.params, { v = '', s = '' } = req.query;
    if (!/^\d{1,18}$/.test(id) || !/^[a-f0-9]{16}$/.test(v) || s.length !== 22) return reply.code(404).send({ error: 'not_found' });
    const want = Buffer.from(sig(id, v)), got = Buffer.from(s);
    if (want.length !== got.length || !crypto.timingSafeEqual(want, got)) return reply.code(404).send({ error: 'not_found' });
    const r = (await pool.query('SELECT avatar_data, avatar_type, avatar_etag FROM users WHERE id = $1', [id])).rows[0];
    if (!r?.avatar_data) return reply.code(404).send({ error: 'not_found' });
    return reply
      .header('Content-Type', r.avatar_type)
      .header('Cache-Control', r.avatar_etag === v ? 'private, max-age=31536000, immutable' : 'private, max-age=300')
      .header('X-Content-Type-Options', 'nosniff')
      .header('Content-Security-Policy', "default-src 'none'")
      .header('Cross-Origin-Resource-Policy', 'same-origin')
      .send(r.avatar_data);
  });
}
