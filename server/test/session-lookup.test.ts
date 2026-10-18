import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';
import { config } from '../src/config';
import { APP_COOKIE } from '../../shared/brand';

describe('session lookup', () => {
  it('skips the database for files that are not API calls', async () => {
    const sql: string[] = [];
    const pool = { query: async (text: string) => { sql.push(text); return { rows: [] }; } } as never;
    const app = await buildApp(config, pool);
    const res = await app.inject({ method: 'GET', url: '/icons/favicon.svg', headers: { cookie: `${APP_COOKIE}=abc` } });
    expect(res.statusCode).toBeLessThan(500);
    expect(sql.some(q => q.includes('auth_sessions'))).toBe(false);
    await app.close();
  });

  it('still loads the session for an API call', async () => {
    const sql: string[] = [];
    const pool = { query: async (text: string) => { sql.push(text); return { rows: text.includes('SELECT 1') ? [{ ok: 1 }] : [] }; } } as never;
    const app = await buildApp(config, pool);
    await app.inject({ method: 'GET', url: '/api/health', headers: { cookie: `${APP_COOKIE}=abc` } });
    expect(sql.some(q => q.includes('auth_sessions'))).toBe(true);
    await app.close();
  });
});
