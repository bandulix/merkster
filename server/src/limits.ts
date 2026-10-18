/* Picture and test caps. Callers that insert a test must already be inside a transaction
   so the user-row lock covers the count and the insert together. */
import type pg from 'pg';
import { PICTURES_PER_TEST, TESTS_PER_24H, acceptPictures } from '../../shared/limits';
import { tx } from './db';

type Q = pg.Pool | pg.PoolClient;

export { PICTURES_PER_TEST, TESTS_PER_24H };

/** Includes soft-deleted tests: deleting one does not give the slot back. */
export async function testsInLast24h(q: Q, uid: number): Promise<number> {
  const r = await q.query(`SELECT count(*)::int AS n FROM tests WHERE user_id = $1 AND created_at > now() - interval '24 hours'`, [uid]);
  return Number(r.rows[0].n);
}

export async function picturesUsed(q: Q, uid: number, testId: string): Promise<number> {
  const r = await q.query(`SELECT pictures FROM test_picture_uses WHERE user_id = $1 AND test_id = $2`, [uid, testId]);
  return r.rows[0] ? Number(r.rows[0].pictures) : 0;
}

/**
 * Reserve up to `want` picture slots for one test. The row can exist before the test
 * itself is synced. A full test accepts nothing and is left unchanged.
 */
export async function reservePictures(pool: pg.Pool, uid: number, testId: string, want: number): Promise<{ accepted: number; used: number; max: number }> {
  return tx(pool, async c => {
    await c.query(`INSERT INTO test_picture_uses (user_id, test_id, pictures) VALUES ($1, $2, 0) ON CONFLICT (user_id, test_id) DO NOTHING`, [uid, testId]);
    const row = (await c.query(`SELECT pictures FROM test_picture_uses WHERE user_id = $1 AND test_id = $2 FOR UPDATE`, [uid, testId])).rows[0];
    const used = Number(row.pictures);
    const accepted = acceptPictures(used, want);
    if (accepted > 0) await c.query(`UPDATE test_picture_uses SET pictures = pictures + $3 WHERE user_id = $1 AND test_id = $2`, [uid, testId, accepted]);
    return { accepted, used: used + accepted, max: PICTURES_PER_TEST };
  });
}
