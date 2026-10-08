/* Merkster – Postgres pool + tiny SQL-file migration runner */
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import type { Config } from './config';

// DATE as plain 'YYYY-MM-DD' strings, BIGINT as numbers (ms timestamps / revisions fit safely)
pg.types.setTypeParser(1082, v => v);
pg.types.setTypeParser(20, v => Number(v));

type Log = { info: (o: unknown, m?: string) => void; warn: (m: string) => void };

export function createPool(config: Config) {
  return new pg.Pool({ connectionString: config.databaseUrl, max: 10, ssl: config.dbSsl ? { rejectUnauthorized: false } : undefined });
}

/** Applies migrations/NNN_*.sql in order, each in its own transaction, under an advisory lock
 *  (safe when several app instances start at once). */
export async function migrate(pool: pg.Pool, dir: string, log: Log) {
  const files = fs.readdirSync(dir).filter(f => /^\d+_.+\.sql$/.test(f)).sort();
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock(727274)');
    await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())');
    const done = new Set((await client.query('SELECT name FROM schema_migrations')).rows.map(r => r.name as string));
    for (const f of files) {
      if (done.has(f)) continue;
      await client.query('BEGIN');
      try {
        await client.query(fs.readFileSync(path.join(dir, f), 'utf8'));
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [f]);
        await client.query('COMMIT');
        log.info({ migration: f }, 'migration applied');
      } catch (e) { await client.query('ROLLBACK'); throw new Error(`migration ${f} failed: ${(e as Error).message}`); }
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock(727274)').catch(() => undefined);
    client.release();
  }
}

/** Retry the first connection – in compose the database may still be starting. */
export async function waitForDb(pool: pg.Pool, log: Log, tries = 30) {
  for (let i = 1; ; i++) {
    try { await pool.query('SELECT 1'); return; }
    catch (e) {
      if (i >= tries) throw e;
      log.warn(`database not ready (${(e as { code?: string }).code || (e as Error).message}), retry ${i}/${tries}`);
      await new Promise(r => setTimeout(r, 2000));
    }
  }
}

export async function tx<T>(pool: pg.Pool, fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try { await c.query('BEGIN'); const r = await fn(c); await c.query('COMMIT'); return r; }
  catch (e) { await c.query('ROLLBACK').catch(() => undefined); throw e; }
  finally { c.release(); }
}
