import { useEffect, useMemo, useState } from 'react';
import { supabase } from './supabase.js';
import { cloudDb, localDb } from './lib/db.js';
import { listModules } from './lib/data.js';
import { prefs } from './lib/prefs.js';
import { AppContext, go, useHashRoute } from './context.js';
import Auth from './components/Auth.jsx';
import Shell from './components/Shell.jsx';
import Onboarding from './components/Onboarding.jsx';
import Dashboard from './components/Dashboard.jsx';
import Planner from './components/Planner.jsx';
import Timetable from './components/Timetable.jsx';
import Modules from './components/Modules.jsx';
import ModuleView from './components/ModuleView.jsx';
import Decks from './components/Decks.jsx';
import DeckView from './components/DeckView.jsx';
import Create from './components/Create.jsx';
import Study from './components/Study.jsx';
import Guide from './components/Guide.jsx';
import Settings from './components/Settings.jsx';

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

  if (session === undefined) return <div className="center muted">Loading…</div>;

  if (!db)
    return (
      <Auth
        onGuest={() => {
          prefs.setGuest(true);
          setGuest(true);
        }}
      />
    );

  async function signOut() {
    if (user) await supabase.auth.signOut();
    prefs.setGuest(false);
    setGuest(false);
    go('/');
  }

  const ctx = { db, user, profile, modules, reloadModules, reloadProfile, signOut, moduleById: (id) => modules.find((m) => m.id === id) };

  if (profile === undefined) return <div className="center muted">Loading…</div>;
  if (!profile?.onboarded)
    return (
      <AppContext.Provider value={ctx}>
        <Onboarding />
      </AppContext.Provider>
    );

  return (
    <AppContext.Provider value={ctx}>
      <Shell route={route}>{page(route)}</Shell>
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
      return <Guide key={id} materialId={id} />;
    case 'settings':
      return <Settings />;
    default:
      return <Dashboard />;
  }
}
