import { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { Toaster } from 'sonner';
import { supabase } from './supabase.js';
import { cloudDb, localDb } from './lib/db.js';
import { listModules } from './lib/data.js';
import { prefs } from './lib/prefs.js';
import { AppContext, go, useHashRoute } from './context.js';
import Shell from './components/Shell.jsx';
import Dashboard from './components/Dashboard.jsx';
import { DialogsProvider } from './ui/dialog.jsx';
import { Skeleton } from './ui/primitives.jsx';

// Pages other than the dashboard load on demand, so the first visit downloads less.
const Auth = lazy(() => import('./components/Auth.jsx'));
const Onboarding = lazy(() => import('./components/Onboarding.jsx'));
const Planner = lazy(() => import('./components/Planner.jsx'));
const Timetable = lazy(() => import('./components/Timetable.jsx'));
const Modules = lazy(() => import('./components/Modules.jsx'));
const ModuleView = lazy(() => import('./components/ModuleView.jsx'));
const Decks = lazy(() => import('./components/Decks.jsx'));
const DeckView = lazy(() => import('./components/DeckView.jsx'));
const Create = lazy(() => import('./components/Create.jsx'));
const Study = lazy(() => import('./components/Study.jsx'));
const Guide = lazy(() => import('./components/Guide.jsx'));
const Guides = lazy(() => import('./components/Guides.jsx'));
const GuideEditor = lazy(() => import('./components/GuideEditor.jsx'));
const Settings = lazy(() => import('./components/Settings.jsx'));

const FullScreenLoading = () => <div className="grid min-h-screen place-items-center text-sm text-muted">Loading…</div>;

const PageLoading = () => (
  <div className="flex flex-col gap-6">
    <Skeleton className="h-4 w-32" />
    <Skeleton className="h-10 w-72 max-w-full" />
    <Skeleton className="h-72 rounded-2xl" />
  </div>
);

export default function App() {
  const [session, setSession] = useState(undefined); // undefined = still checking
  const [guest, setGuest] = useState(prefs.isGuest());
  const [profile, setProfile] = useState(undefined);
  const [modules, setModules] = useState([]);
  const route = useHashRoute();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  const user = session?.user;
  const db = useMemo(() => (user ? cloudDb(user) : guest ? localDb() : null), [user, guest]);

  const reloadModules = () => db && listModules(db).then(setModules).catch(() => setModules([]));
  const reloadProfile = () => db && db.getProfile().then((p) => setProfile(p ?? null)).catch(() => setProfile(null));

  useEffect(() => {
    setProfile(undefined);
    if (!db) return;
    reloadProfile();
    reloadModules();
  }, [db]);

  if (session === undefined) return <FullScreenLoading />;

  if (!db)
    return (
      <Suspense fallback={<FullScreenLoading />}>
        <Auth
          onGuest={() => {
            prefs.setGuest(true);
            setGuest(true);
          }}
        />
      </Suspense>
    );

  async function signOut() {
    if (user) await supabase.auth.signOut();
    prefs.setGuest(false);
    setGuest(false);
    go('/');
  }

  const ctx = { db, user, profile, modules, reloadModules, reloadProfile, signOut, moduleById: (id) => modules.find((m) => m.id === id) };

  if (profile === undefined) return <FullScreenLoading />;

  return (
    <AppContext.Provider value={ctx}>
      <DialogsProvider>
        {!profile?.onboarded ? (
          <Suspense fallback={<FullScreenLoading />}>
            <Onboarding />
          </Suspense>
        ) : (
          <Shell route={route}>
            <Suspense fallback={<PageLoading />}>{page(route)}</Suspense>
          </Shell>
        )}
        <Toaster position="bottom-right" richColors closeButton toastOptions={{ className: 'font-sans' }} />
      </DialogsProvider>
    </AppContext.Provider>
  );
}

function page({ parts, query }) {
  const [section, id, sub] = parts;
  switch (section) {
    case 'planner':
      return <Planner />;
    case 'timetable':
      return <Timetable />;
    case 'modules':
      return id ? <ModuleView key={id} moduleId={id} /> : <Modules />;
    case 'decks':
      if (id && sub === 'study') return <Study key={id + query} deckId={id} mode={query.get('mode')} topic={query.get('topic')} />;
      return id ? <DeckView key={id} deckId={id} /> : <Decks />;
    case 'study':
      return <Study key={'all' + query} mode={query.get('mode')} moduleId={query.get('module')} />;
    case 'create':
      return <Create moduleId={query.get('module')} deckId={query.get('deck')} />;
    case 'guides':
      return id ? <GuideEditor key={id} guideId={id} section={query.get('section')} /> : <Guides />;
    case 'lectures':
      return <Guide key={id} materialId={id} />;
    case 'settings':
      return <Settings />;
    default:
      return <Dashboard />;
  }
}
