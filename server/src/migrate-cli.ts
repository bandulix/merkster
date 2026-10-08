/* Run migrations without starting the server: `npm run migrate` */
import { config } from './config';
import { createPool, migrate, waitForDb } from './db';
const log = { info: (o: unknown, m?: string) => console.log(m || '', o), warn: (m: string) => console.warn(m) };
(async () => { const pool = createPool(config); await waitForDb(pool, log, 5); await migrate(pool, config.migrationsDir, log); await pool.end(); console.log('migrations up to date'); })()
  .catch(e => { console.error(e.message); process.exit(1); });
