/* Service-worker registration with an "update available" prompt (vite-plugin-pwa / Workbox) */
import { useRegisterSW } from 'virtual:pwa-register/react';
import { t } from './i18n';
import { toast } from './lib/util';
import { useEffect } from 'react';

export function UpdatePrompt() {
  const { needRefresh: [needRefresh, setNeedRefresh], offlineReady: [offlineReady, setOfflineReady], updateServiceWorker } = useRegisterSW({
    onRegisteredSW(_url, reg) { if (reg) setInterval(() => { reg.update().catch(() => undefined); }, 60 * 60 * 1000); }
  });
  useEffect(() => { if (offlineReady) { toast(t('offline_ready'), 'ok'); setOfflineReady(false); } }, [offlineReady, setOfflineReady]);
  if (!needRefresh) return null;
  return (
    <div className="update-bar pop-in" role="status" data-testid="update-prompt">
      <span>✨ {t('update_ready')}</span>
      <button className="btn ghost sm" onClick={() => setNeedRefresh(false)}>{t('later')}</button>
      <button className="btn primary sm" onClick={() => updateServiceWorker(true)}>{t('update_now')}</button>
    </div>
  );
}
