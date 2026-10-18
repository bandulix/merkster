/** Shared caps. The server is the authority; the UI uses the same numbers so the message matches. */
export const PICTURES_PER_TEST = 10;
export const TESTS_PER_24H = 3;
export const DAY_MS = 86_400_000;

/** How many of `want` new pictures still fit. Never negative, never over the cap. */
export function acceptPictures(used: number, want: number, max = PICTURES_PER_TEST): number {
  const u = Math.max(0, Math.floor(used));
  const w = Math.max(0, Math.floor(want));
  return Math.max(0, Math.min(w, max - u));
}

/** Rolling window: a test created exactly 24h ago is already outside it. */
export function createdWithin24h(at: number, now: number): boolean {
  return Number.isFinite(at) && now >= at && now - at < DAY_MS;
}

/**
 * Local tests created in the last 24h. `createdAt` (ms) wins. Older rows that only have a
 * calendar day count from midnight UTC, which is the same fallback the migration backfill uses.
 */
export function recentTestCount(tests: { createdAt?: number; created?: string }[], now: number): number {
  return tests.filter(t => {
    const at = t.createdAt ?? (t.created ? Date.parse(t.created + 'T00:00:00Z') : NaN);
    return createdWithin24h(at, now);
  }).length;
}
