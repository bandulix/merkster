/* Merkster – Fastify app: static PWA (dist/web) + /api on the same origin */
import fs from 'node:fs';
import path from 'node:path';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import type pg from 'pg';
import { publicConfig, type Config } from './config';
import { authPlugin } from './auth';
import { dataPlugin } from './data';
import { aiPlugin, reportAiPlugin } from './ai';
import { supportersPlugin } from './supporters';
import { rewardsPlugin } from './rewards';
import { reportCardsPlugin } from './reportcards';
import { avatarsPlugin, initAvatars } from './avatars';

const CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",          // tesseract.js WebAssembly
  "worker-src 'self' blob:",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",   // profile pictures are cached and served same-origin (/api/avatars)
  "font-src 'self'",
  "connect-src 'self' data: blob:",
  "media-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'"
].join('; ');

export async function buildApp(config: Config, pool: pg.Pool) {
  const app = Fastify({
    logger: { level: config.logLevel, redact: ['req.headers.cookie', 'req.headers.authorization', 'res.headers["set-cookie"]'] },
    trustProxy: config.trustProxy,
    bodyLimit: config.maxSyncMB * 1024 * 1024,
    disableRequestLogging: config.logLevel !== 'debug'
  });

  await app.register(cookie);
  await app.register(multipart, { limits: { fileSize: config.maxUploadMB * 1024 * 1024, files: config.maxUploadFiles, fields: 5, fieldSize: 200 * 1024, parts: config.maxUploadFiles + 5 } });

  app.addHook('onSend', async (req, reply, payload) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Referrer-Policy', 'same-origin');
    reply.header('Permissions-Policy', 'camera=(self), microphone=(), geolocation=()');
    if (!req.url.startsWith('/api/')) reply.header('Content-Security-Policy', CSP);
    else if (!reply.getHeader('Cache-Control')) reply.header('Cache-Control', 'no-store');   // routes may set their own (avatars: long cache)
    if (config.publicUrl.startsWith('https://')) reply.header('Strict-Transport-Security', 'max-age=15552000');
    return payload;
  });

  app.get('/api/health', async (_req, reply) => {
    try { await pool.query('SELECT 1'); return { ok: true, db: 'up', ai: config.aiConfigured, version: config.version }; }
    catch { return reply.code(503).send({ ok: false, db: 'down' }); }
  });
  app.get('/api/config', async () => publicConfig());

  app.setErrorHandler((error, req, reply) => {
    const err = error as { statusCode?: number; message: string; code?: string };
    const status = err.statusCode && err.statusCode >= 400 ? err.statusCode : 500;
    if (status >= 500) req.log.error({ err: { message: err.message, code: err.code } }, 'request failed');
    reply.code(status).send({ error: status >= 500 ? 'server_error' : err.code || 'bad_request' });
  });
  // called directly (not app.register) on purpose: auth hooks + decorators must apply to ALL routes,
  // and Fastify would otherwise encapsulate them inside the plugin's own context
  await authPlugin(app, { pool, config });
  await dataPlugin(app, { pool });
  await aiPlugin(app, { pool, config });
  await reportAiPlugin(app, { pool, config });
  await supportersPlugin(app, { pool, config });
  await rewardsPlugin(app, { pool });
  await reportCardsPlugin(app, { pool });
  initAvatars(config);
  await avatarsPlugin(app, { pool });

  const hasWeb = fs.existsSync(path.join(config.staticDir, 'index.html'));
  if (hasWeb) {
    await app.register(fastifyStatic, {
      root: config.staticDir, wildcard: false, index: ['index.html'],
      setHeaders(res, file) {
        const rel = path.relative(config.staticDir, file);
        if (rel.startsWith('assets' + path.sep)) res.header('Cache-Control', 'public, max-age=31536000, immutable');
        else if (/^(index\.html|sw\.js|registerSW\.js|manifest\.webmanifest|workbox-.*\.js)$/.test(rel)) res.header('Cache-Control', 'no-cache');
        else res.header('Cache-Control', 'public, max-age=86400');
      }
    });
    // client-side routes (/test/abc, /settings …) -> index.html
    app.setNotFoundHandler((req, reply) => {
      if (req.method === 'GET' && !req.url.startsWith('/api/') && !path.extname(req.url.split('?')[0])) {
        return reply.header('Cache-Control', 'no-cache').sendFile('index.html');
      }
      return reply.code(404).send({ error: 'not_found' });
    });
  } else {
    app.log.warn(`no built web app in ${config.staticDir} – run "npm run build" (API still works)`);
  }
  return app;
}
