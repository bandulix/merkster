import { lazy, Suspense, useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useMe, useStore, useTheme } from './hooks';
import { store } from './lib/store';
import { startSync, stopSync } from './lib/sync';
import { Logo, Nav, Toasts } from './components/ui';
import { UpdatePrompt } from './pwa';
import { t } from './i18n';
import { clearToasts } from './lib/util';
import { Login } from './pages/Login';
import { Onboarding } from './pages/Onboarding';
import { Home } from './pages/Home';
import { NewTest } from './pages/NewTest';
import { GoalsPage } from './pages/Goals';
import { ImportPage, PastePage } from './pages/Import';
import { Review } from './pages/Review';
import { TestDetail } from './pages/TestDetail';
import { SessionPage, DonePage } from './pages/Session';
import { Settings } from './pages/Settings';
import { Me } from './pages/Me';
import { Celebrations } from './components/Celebrate';
import { MerkiMomentHost } from './components/MerkiSay';
import { ClassJoin } from './pages/ClassJoin';
import { ClassPage, Classes } from './pages/Classes';
import { ClashPage } from './pages/Clash';
import { ComparePage } from './pages/Compare';
const Results = lazy(() => import('./pages/Results'));

function Splash() { return <div className="splash"><Logo size={72} className="pulse" /><p className="muted">{t('loading')}</p></div>; }

export function App() {
  const me = useMe();
  const qc = useQueryClient();
  const data = useStore();
  const loc = useLocation();
  const user = me.data?.user || null;
  const [openFor, setOpenFor] = useState<string | null>(null);
  useTheme(data.settings.theme);
  useEffect(() => { clearToasts(); }, [loc.pathname]);
  useEffect(() => {
    let cancelled = false;
    if (!user) { if (store.userId) { stopSync(); store.close(); } setOpenFor(null); return; }
    (async () => {
      await store.open(user.id);
      // wait briefly for the first sync so a new device shows the user's real data, but never block offline use
      // (longer when this device has no data for the account yet – otherwise it would briefly look like a new account)
      const fresh = !store.data.settings.onboarded && store.data.tests.length === 0 && navigator.onLine;
      await Promise.race([startSync(user.id, () => qc.setQueryData(['me'], { user: null, offline: false })), new Promise(r => setTimeout(r, fresh ? 12000 : 4000))]);
      if (!cancelled) setOpenFor(user.id);
    })();
    return () => { cancelled = true; };
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (me.isLoading) return <Splash />;
  if (!user) {
    return (<><Routes><Route path="/login" element={<Login />} /><Route path="/class" element={<ClassJoin user={null} />} /><Route path="*" element={<Navigate to={loc.pathname === '/' ? '/login' : '/login?next=' + encodeURIComponent(loc.pathname)} replace />} /></Routes><Toasts /><UpdatePrompt /></>);
  }
  if (openFor !== user.id) return <Splash />;
  const p = loc.pathname;
  const free = ['/welcome', '/new', '/goals', '/test', '/settings', '/me', '/results', '/compare', '/class'].some(x => p.startsWith(x));
  if (!data.settings.onboarded && !free) return <Navigate to="/welcome/1" replace />;
  const chrome = !/^\/(practice|done|welcome)/.test(p) && p !== '/class';
  return (
    <div className={'app' + (chrome ? ' with-nav' : '')}>
      <a className="skip-link" href="#main">{t('skip_to_main')}</a>
      {chrome && <Nav />}
      <main className="main" id="main" tabIndex={-1}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Navigate to="/" replace />} />
          <Route path="/welcome/:step" element={<Onboarding />} />
          <Route path="/new" element={<NewTest />} />
          <Route path="/goals" element={<GoalsPage />} />
          <Route path="/test/:id" element={<TestDetail />} />
          <Route path="/test/:id/import" element={<ImportPage />} />
          <Route path="/test/:id/paste" element={<PastePage />} />
          <Route path="/test/:id/review" element={<Review />} />
          <Route path="/practice" element={<SessionPage />} />
          <Route path="/done" element={<DonePage />} />
          <Route path="/results" element={<Suspense fallback={<Splash />}><Results /></Suspense>} />
          <Route path="/compare/:id" element={<ComparePage />} />
          <Route path="/me" element={<Me />} />
          <Route path="/classes" element={<Classes />} />
          <Route path="/classes/:id" element={<ClassPage />} />
          <Route path="/classes/:id/clash/:clashId" element={<ClashPage />} />
          <Route path="/class" element={<ClassJoin user={user} />} />
          <Route path="/settings" element={<Settings user={user} offline={!!me.data?.offline} />} />
          <Route path="*" element={<div className="empty-hero"><h2>{t('not_found')}</h2></div>} />
        </Routes>
      </main>
      <Celebrations />
      <MerkiMomentHost />
      <Toasts />
      <UpdatePrompt />
    </div>
  );
}
