import { describe, expect, it } from 'vitest';
import { pgSsl } from '../src/db';
import type { Config } from '../src/config';

const cfg = (dbSsl: boolean, dbSslInsecure: boolean) => ({ dbSsl, dbSslInsecure }) as Config;

describe('database TLS', () => {
  it('checks the server certificate when SSL is on', () => {
    expect(pgSsl(cfg(true, false))).toEqual({ rejectUnauthorized: true });
  });
  it('can skip the check only when asked', () => {
    expect(pgSsl(cfg(true, true))).toEqual({ rejectUnauthorized: false });
  });
  it('stays off when the database is on a private socket', () => {
    expect(pgSsl(cfg(false, false))).toBeUndefined();
  });
});
