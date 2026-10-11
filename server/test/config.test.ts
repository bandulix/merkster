/* Config validation – the mock OIDC issuer must be impossible to enable in production. */
import { afterEach, describe, expect, it, vi } from 'vitest';

describe('OIDC_TEST_ISSUER safety', () => {
  const saved = { ...process.env };
  afterEach(() => { for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k]; Object.assign(process.env, saved); vi.resetModules(); });

  it('refuses to start when OIDC_TEST_ISSUER is set and NODE_ENV=production', async () => {
    process.env.NODE_ENV = 'production';
    process.env.OIDC_TEST_ISSUER = 'http://localhost:9090';
    process.env.APP_SECRET = 'x'.repeat(40);
    process.env.DATABASE_URL = 'postgres://u:p@localhost:5432/merkster';
    process.env.GOOGLE_CLIENT_ID = 'x'; process.env.GOOGLE_CLIENT_SECRET = 'y';
    const { config, validateConfig } = await import('../src/config');
    expect(config.google.testIssuer).toBe(true);
    expect(config.nodeEnv).toBe('production');
    const log = { error: vi.fn(), info: vi.fn() };
    expect(() => validateConfig(log)).toThrow(/OIDC_TEST_ISSUER/);
    expect(log.error).toHaveBeenCalledWith(expect.stringMatching(/cannot be used with NODE_ENV=production/));
  });

  it('allows the mock issuer in development', async () => {
    process.env.NODE_ENV = 'development';
    process.env.OIDC_TEST_ISSUER = 'http://localhost:9090';
    process.env.APP_SECRET = 'x'.repeat(40);
    process.env.DATABASE_URL = 'postgres://u:p@localhost:5432/merkster';
    const { validateConfig } = await import('../src/config');
    const log = { error: vi.fn(), info: vi.fn() };
    expect(() => validateConfig(log)).not.toThrow();
    expect(log.info).toHaveBeenCalledWith(expect.stringMatching(/mock OpenID/));
  });
});

describe('SIGNUP_CODE', () => {
  const saved = { ...process.env };
  afterEach(() => { for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k]; Object.assign(process.env, saved); vi.resetModules(); });
  it('the browser only learns that a code is required – never the code', async () => {
    process.env.SIGNUP_CODE = '  Geheim-Wort-42 ';
    const { config, publicConfig } = await import('../src/config');
    expect(config.signupCode).toBe('Geheim-Wort-42');
    const pub = JSON.stringify(publicConfig());
    expect(publicConfig().auth.signupCode).toBe(true);
    expect(pub).not.toMatch(/geheim/i);
  });
  it('empty or unset = no code required (backward compatible)', async () => {
    process.env.SIGNUP_CODE = '';
    const { config, publicConfig } = await import('../src/config');
    expect(config.signupCode).toBe('');
    expect(publicConfig().auth.signupCode).toBe(false);
  });
});

describe('SOURCE_CODE_URL (AGPL §13)', () => {
  const saved = { ...process.env };
  afterEach(() => { for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k]; Object.assign(process.env, saved); vi.resetModules(); });
  it('defaults to the GitHub repo and is exposed to the browser', async () => {
    delete process.env.SOURCE_CODE_URL;
    const { publicConfig } = await import('../src/config');
    expect(publicConfig().sourceCodeUrl).toBe('https://github.com/bandulix/merkster');
  });
  it('takes a custom http(s) URL, ignores anything else', async () => {
    process.env.SOURCE_CODE_URL = 'https://git.example.org/me/merkster-fork';
    expect((await import('../src/config')).publicConfig().sourceCodeUrl).toBe('https://git.example.org/me/merkster-fork');
    vi.resetModules(); process.env.SOURCE_CODE_URL = 'javascript:alert(1)';
    expect((await import('../src/config')).publicConfig().sourceCodeUrl).toBe('https://github.com/bandulix/merkster');
  });
});
