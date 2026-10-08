/* Tiny in-memory sliding-window limiter (per process) – enough for a single app container. */
export function limiter(max: number, windowMs: number) {
  const hits = new Map<string, number[]>();
  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) { const keep = v.filter(t => now - t < windowMs); if (keep.length) hits.set(k, keep); else hits.delete(k); }
  }, windowMs).unref();
  return (key: string): { ok: true } | { ok: false; retryAfter: number } => {
    const now = Date.now(), arr = (hits.get(key) || []).filter(t => now - t < windowMs);
    if (arr.length >= max) { hits.set(key, arr); return { ok: false, retryAfter: Math.ceil((windowMs - (now - arr[0])) / 1000) }; }
    arr.push(now); hits.set(key, arr); return { ok: true };
  };
}
