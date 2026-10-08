/* Snapwise – server configuration. Everything comes from environment variables / the .env file
   on the server. Nothing here is sent to the browser except publicConfig(). */
import fs from 'node:fs';
import path from 'node:path';
import type { PublicConfig } from '../../shared/types';

/** Minimal .env loader (KEY=VALUE, # comments, optional quotes). Real environment variables win. */
export function loadDotEnv(file: string) {
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const m = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[2];
    if (/^"(.*)"$/.test(v)) v = v.slice(1, -1).replace(/\\n/g, '\n').replace(/\\"/g, '"');
    else if (/^'(.*)'$/.test(v)) v = v.slice(1, -1);
    else v = v.replace(/\s+#.*$/, '').trim();
    if (process.env[m[1]] === undefined) process.env[m[1]] = v;
  }
}
loadDotEnv(process.env.ENV_FILE || path.resolve(process.cwd(), '.env'));

const env = (k: string, d = '') => (process.env[k] !== undefined && process.env[k] !== '' ? String(process.env[k]) : d);
const bool = (k: string, d: boolean) => { const v = env(k); return v === '' ? d : /^(1|true|yes|on)$/i.test(v); };
const int = (k: string, d: number) => { const v = parseInt(env(k), 10); return Number.isFinite(v) ? v : d; };

function databaseUrl() {
  if (env('DATABASE_URL')) return env('DATABASE_URL');
  const u = encodeURIComponent(env('POSTGRES_USER', 'snapwise')), p = encodeURIComponent(env('POSTGRES_PASSWORD'));
  return `postgres://${u}:${p}@${env('POSTGRES_HOST', 'db')}:${env('POSTGRES_PORT', '5432')}/${env('POSTGRES_DB', 'snapwise')}`;
}
function firstExisting(...cands: string[]) { return cands.find(c => fs.existsSync(c)) || cands[0]; }

const port = int('PORT', 8080);
const publicUrl = env('PUBLIC_URL', `http://localhost:${port}`).replace(/\/+$/, '');
const cookieSecureRaw = env('COOKIE_SECURE', 'auto');

export const config = {
  nodeEnv: env('NODE_ENV', 'production'),
  port,
  host: env('HOST', '0.0.0.0'),
  publicUrl,
  logLevel: env('LOG_LEVEL', 'info'),
  trustProxy: bool('TRUST_PROXY', false),
  appSecret: env('APP_SECRET'),
  databaseUrl: databaseUrl(),
  dbSsl: bool('DATABASE_SSL', false),
  registrationOpen: bool('REGISTRATION_OPEN', true),
  sessionDays: int('SESSION_DAYS', 60),
  cookieSecure: cookieSecureRaw === 'auto' ? publicUrl.startsWith('https://') : bool('COOKIE_SECURE', false),
  maxUploadMB: int('MAX_UPLOAD_MB', 8),
  maxUploadFiles: int('MAX_UPLOAD_FILES', 10),
  maxSyncMB: int('MAX_SYNC_MB', 5),
  llm: {
    baseUrl: env('LLM_BASE_URL').replace(/\/+$/, ''),
    apiKey: env('LLM_API_KEY'),
    visionModel: env('LLM_VISION_MODEL'),
    textModel: env('LLM_TEXT_MODEL') || env('LLM_VISION_MODEL'),
    timeoutMs: int('LLM_TIMEOUT_MS', 120000),
    jsonMode: env('LLM_JSON_MODE', 'auto') as 'auto' | 'on' | 'off',
    maxTokens: int('LLM_MAX_TOKENS', 4000)
  },
  aiLimitHour: int('AI_RATE_LIMIT_PER_HOUR', 30),
  aiLimitDay: int('AI_RATE_LIMIT_PER_DAY', 100),
  authLimitPer10Min: int('AUTH_RATE_LIMIT_PER_10MIN', 20),
  staticDir: env('STATIC_DIR') || firstExisting(path.resolve(__dirname, '../web'), path.resolve(process.cwd(), 'dist/web')),
  migrationsDir: firstExisting(path.resolve(__dirname, 'migrations'), path.resolve(__dirname, '../migrations'), path.resolve(process.cwd(), 'server/migrations')),
  version: '1.0.0',
  aiConfigured: false
};
config.aiConfigured = !!(config.llm.baseUrl && config.llm.apiKey && config.llm.visionModel);
export type Config = typeof config;

export function validateConfig(log: { error: (m: string) => void; info: (m: string) => void }) {
  const problems: string[] = [];
  if (!config.appSecret || config.appSecret.length < 32 || /change[-_ ]?me/i.test(config.appSecret)) {
    problems.push('APP_SECRET must be a random string of at least 32 characters (e.g. `openssl rand -hex 32`).');
  }
  if (!/^postgres(ql)?:\/\//.test(config.databaseUrl)) problems.push('DATABASE_URL (or POSTGRES_*) is not a postgres:// URL.');
  if (problems.length) { problems.forEach(p => log.error(p)); throw new Error('Invalid configuration: ' + problems.join(' ')); }
  if (!config.aiConfigured) log.info('AI extraction not configured (LLM_BASE_URL / LLM_API_KEY / LLM_VISION_MODEL) – clients use on-device OCR.');
}

/** The only configuration the browser ever sees – never the key or URL of the LLM. */
export function publicConfig(): PublicConfig {
  return {
    ai: { configured: config.aiConfigured, model: config.aiConfigured ? config.llm.visionModel : null },
    registrationOpen: config.registrationOpen,
    maxUploadMB: config.maxUploadMB,
    maxUploadFiles: config.maxUploadFiles,
    version: config.version
  };
}
