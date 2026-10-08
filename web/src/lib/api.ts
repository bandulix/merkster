/* Same-origin API client. Session = httpOnly cookie (set by the server); every write carries the CSRF header. */
import { APP_CSRF_HEADER } from '../../../shared/brand';

export class ApiError extends Error {
  constructor(public status: number, public code: string, public body?: Record<string, unknown>) { super(code); }
}
export const isNetworkError = (e: unknown) => e instanceof ApiError && e.status === 0;

export async function api<T = unknown>(path: string, opts: { method?: string; body?: unknown; form?: FormData; signal?: AbortSignal; keepalive?: boolean } = {}): Promise<T> {
  const method = opts.method || (opts.body !== undefined || opts.form ? 'POST' : 'GET');
  const headers: Record<string, string> = {};
  if (method !== 'GET') headers[APP_CSRF_HEADER] = '1';
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  let res: Response;
  try {
    res = await fetch(path, { method, headers, credentials: 'same-origin', body: opts.form || (opts.body !== undefined ? JSON.stringify(opts.body) : undefined), signal: opts.signal, keepalive: opts.keepalive });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new ApiError(0, 'network');
  }
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try { json = text ? JSON.parse(text) : {}; } catch { json = {}; }
  if (!res.ok) throw new ApiError(res.status, String(json.error || 'http_' + res.status), json);
  return json as T;
}
