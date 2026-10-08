import { lazy, Suspense, useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useMe, useStore, useTheme } from './hooks';
import { store } from './lib/store';
import { startSync, stopSync } from './lib/sync';
import { Logo, Nav, Toasts } from './components/ui';
import { UpdatePrompt } from './pwa';
import { t } from './i18n';
import { Login } from './pages/Login';
import { Onboarding } from './pages/Onboarding';
import { Home } from './pages/Home';
import { NewTest } from './pages/NewTest';
import { ImportPage, PastePage } from './pages/Import';
import { Review } from './pages/Review';
import { TestDetail } from './pages/TestDetail';
import { SessionPage, DonePage } from './pages/Session';
import { Settings } from './pages/Settings';
import { Me } from './pages/Me';
import { Celebrations } from './components/Celebrate';
import { Join } from './pages/Join';
import { CheerHome } from './pages/Cheer';
import { Supporters } from './pages/Supporters';
import { useCheers } from './lib/supporters';
import { useGivenRewards, useMyRewards } from './lib/rewards';
const Results = lazy(() => import('./pages/Results'));
const KidDetail = lazy(() => import('./pages/Results').then(m => ({ default: m.KidDetail })));
const RewardsPage = lazy(() => import('./pages/Results').then(m => ({ default: m.Rewards })));
const GivenRewards = lazy(() => import('./pages/Results').then(m => ({ default: m.GivenRewards })));
const ReportCardsPage = lazy(() => import('./pages/Results').then(m => ({ default: m.ReportCards })));
const ReportDetail = lazy(() => import('./pages/Results').then(m => ({ default: m.ReportDetail })));
const ReportNew = lazy(() => import('./pages/Results').then(m => ({ default: m.ReportNew })));
const Simulator = lazy(() => import('./pages/Results').then(m => ({ default: m.Simulator })));

function Splash() { return <div className="splash"><Logo size={72} className="pulse" /><p className="muted">{t('loading')}</p></div>; }

export function App() {
  const me = useMe();
  const qc = useQueryClient();
  const data = useStore();
  const loc = useLocation();
  const user = me.data?.user || null;
  const [openFor, setOpenFor] = useState<string | null>(null);
  useTheme(data.settings.theme);
  const cheers = useCheers(!!user && !me.data?.offline);
  const myRewards = useMyRewards(!!user && !me.data?.offline);
  const given = useGivenRewards(!!user?.isSupporter && !me.data?.offline);

  useEffect(() => {
    let cancelled = false;
    if (!user) { if (store.userId) { stopSync(); store.close(); } setOpenFor(null); return; }
    (async () => {
      await store.open(user.id);
      // wait briefly for the first sync so a new device shows the user's real data, but never block offline use
      await Promise.race([startSync(user.id, () => qc.setQueryData(['me'], { user: null, offline: false })), new Promise(r => setTimeout(r, 4000))]);
      if (!cancelled) setOpenFor(user.id);
    })();
    return () => { cancelled = true; };
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (me.isLoading) return <Splash />;
  if (!user) {
    return (<><Routes><Route path="/login" element={<Login />} /><Route path="/join" element={<Join user={null} />} /><Route path="*" element={<Navigate to={loc.pathname === '/' ? '/login' : '/login?next=' + encodeURIComponent(loc.pathname)} replace />} /></Routes><Toasts /><UpdatePrompt /></>);
  }
  if (openFor !== user.id) return <Splash />;
  const p = loc.pathname;
  // a supporter who never started learning lands on the cheering overview instead of the student onboarding
  const supporterOnly = !!user.isSupporter && !data.settings.onboarded && data.tests.length === 0;
  const mode = supporterOnly ? 'supporter' : user.isSupporter ? 'both' : 'student';
  const free = ['/welcome', '/new', '/test', '/settings', '/me', '/results', '/join', '/cheer', '/supporters', '/rewards'].some(x => p.startsWith(x));
  if (!data.settings.onboarded && !free) return <Navigate to={supporterOnly ? '/cheer' : '/welcome/1'} replace />;
  const chrome = !/^\/(practice|done|welcome|join)/.test(p);
  const unseen = (cheers.data || []).filter(c => !c.seen).length + (myRewards.data?.earned || []).filter(e => !e.seen).length;
  const rewardDot = given.data?.unseen || 0;
  return (
    <div className={'app' + (chrome ? ' with-nav' : '')}>
      {chrome && <Nav mode={mode} unseen={unseen} rewardDot={rewardDot} />}
      <main className="main" id="main">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Navigate to="/" replace />} />
          <Route path="/welcome/:step" element={<Onboarding />} />
          <Route path="/new" element={<NewTest />} />
          <Route path="/test/:id" element={<TestDetail />} />
          <Route path="/test/:id/import" element={<ImportPage />} />
          <Route path="/test/:id/paste" element={<PastePage />} />
          <Route path="/test/:id/review" element={<Review />} />
          <Route path="/practice" element={<SessionPage />} />
          <Route path="/done" element={<DonePage />} />
          <Route path="/results" element={<Suspense fallback={<Splash />}><Results /></Suspense>} />
          <Route path="/reports" element={<Suspense fallback={<Splash />}><ReportCardsPage /></Suspense>} />
          <Route path="/reports/new" element={<Suspense fallback={<Splash />}><ReportNew /></Suspense>} />
          <Route path="/reports/simulate" element={<Suspense fallback={<Splash />}><Simulator /></Suspense>} />
          <Route path="/reports/:id" element={<Suspense fallback={<Splash />}><ReportDetail /></Suspense>} />
          <Route path="/me" element={<Me />} />
          <Route path="/supporters" element={<Supporters />} />
          <Route path="/join" element={<Join user={user} />} />
          <Route path="/cheer" element={<CheerHome />} />
          <Route path="/rewards" element={<Suspense fallback={<Splash />}><RewardsPage /></Suspense>} />
          <Route path="/cheer/rewards" element={<Suspense fallback={<Splash />}><GivenRewards /></Suspense>} />
          <Route path="/cheer/:id" element={<Suspense fallback={<Splash />}><KidDetail /></Suspense>} />
          <Route path="/settings" element={<Settings user={user} offline={!!me.data?.offline} />} />
          <Route path="*" element={<div className="empty-hero"><h2>{t('not_found')}</h2></div>} />
        </Routes>
      </main>
      <Celebrations />
      <Toasts />
      <UpdatePrompt />
    </div>
  );
}
