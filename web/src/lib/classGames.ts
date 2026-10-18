/* After a practice session, claim boss damage for any taken class share that has an open boss. */
import { api } from './api';
import type { ClassBoss, ClassSummary } from './classes';
import { toast } from './util';
import { t } from '../i18n';

export async function reportBossDamage(opts: { sessionId: string; correct: number; tests: string[] }): Promise<void> {
  if (!opts.correct || !opts.tests.length || !opts.sessionId) return;
  try {
    const list = await api<{ classes: ClassSummary[] }>('/api/classes');
    for (const c of list.classes || []) {
      const r = await api<{ boss: ClassBoss | null }>('/api/classes/' + c.id + '/boss');
      const boss = r.boss;
      if (!boss || boss.status !== 'open' || !boss.myTestId) continue;
      if (!opts.tests.includes(boss.myTestId)) continue;
      const hit = await api<{ boss: ClassBoss; applied: number }>(
        '/api/classes/' + c.id + '/boss/' + boss.id + '/hit',
        { body: { sessionId: opts.sessionId, testId: boss.myTestId, damage: opts.correct } }
      );
      if (hit.applied > 0) {
        const left = hit.boss.hp;
        toast(
          hit.boss.status === 'won'
            ? t('boss_won_toast', { name: hit.boss.shareName })
            : t('boss_hit_toast', { n: hit.applied, left }),
          hit.boss.status === 'won' ? 'ok' : 'ok'
        );
      }
    }
  } catch { /* offline or no class – practice still counts locally */ }
}
