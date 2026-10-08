/* Snapwise server entry: validate config -> wait for DB -> migrate -> listen */
import { config, validateConfig } from './config';
import { createPool, migrate, waitForDb } from './db';
import { buildApp } from './app';

async function main() {
  const pool = createPool(config);
  const app = await buildApp(config, pool);
  validateConfig({ error: m => app.log.error(m), info: m => app.log.info(m) });
  await waitForDb(pool, { info: (o, m) => app.log.info(o as object, m), warn: m => app.log.warn(m) });
  await migrate(pool, config.migrationsDir, { info: (o, m) => app.log.info(o as object, m), warn: m => app.log.warn(m) });
  // housekeeping: expired sessions
  setInterval(() => { pool.query('DELETE FROM auth_sessions WHERE expires_at < now()').catch(() => undefined); }, 6 * 3600e3).unref();
  await app.listen({ port: config.port, host: config.host });
  app.log.info(`Snapwise listening on ${config.publicUrl} (AI ${config.aiConfigured ? 'on' : 'off'}, registration ${config.registrationOpen ? 'open' : 'closed'})`);
  const stop = async () => { await app.close(); await pool.end(); process.exit(0); };
  process.on('SIGTERM', stop); process.on('SIGINT', stop);
}
main().catch(e => { console.error('fatal:', e.message); process.exit(1); });
