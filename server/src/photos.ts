/* Original uploads live only until the read finishes, or until the retry window
   if it failed. Nothing here is sent to a training job. */
import crypto from 'node:crypto';
import type pg from 'pg';
import { PHOTO_RETRY_MS } from '../../shared/material';

export async function keepUploads(pool: pg.Pool, userId: number, testId: string, files: { bytes: Buffer; mime: string }[], retryMs = PHOTO_RETRY_MS): Promise<string[]> {
  const ids: string[] = [];
  const purge = new Date(Date.now() + retryMs);
  for (const file of files) {
    const id = crypto.randomBytes(9).toString('base64url');
    await pool.query(
      `INSERT INTO material_photos (id, user_id, test_id, bytes, mime, purge_at) VALUES ($1,$2,$3,$4,$5,$6)`,
      [id, userId, testId, file.bytes, file.mime, purge]
    );
    ids.push(id);
  }
  return ids;
}

export async function dropUploads(pool: pg.Pool, ids: string[]): Promise<void> {
  if (!ids.length) return;
  await pool.query(`DELETE FROM material_photos WHERE id = ANY($1::text[])`, [ids]);
}

/** Idempotent. A second call deletes nothing that the first call already removed. */
export async function purgeDueUploads(pool: pg.Pool): Promise<number> {
  const r = await pool.query(`DELETE FROM material_photos WHERE purge_at <= now()`);
  return r.rowCount || 0;
}

/** Remember the bytes, delete them when the work succeeds, and leave a failed read until purge_at. */
export async function retainDuring<T>(pool: pg.Pool, userId: number, testId: string, files: { bytes: Buffer; mime: string }[], retryMs: number, fn: () => Promise<T>): Promise<T> {
  let ids: string[] = [];
  try { ids = await keepUploads(pool, userId, testId, files, retryMs); } catch { ids = []; }
  const out = await fn();
  if (ids.length) await dropUploads(pool, ids).catch(() => undefined);
  return out;
}
