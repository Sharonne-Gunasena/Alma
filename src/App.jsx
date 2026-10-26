import { useEffect, useMemo, useState } from 'react';
import { supabase } from './supabase.js';
import { localStore, supabaseStore } from './lib/store.js';
import { prefs } from './lib/prefs.js';
import Auth from './components/Auth.jsx';
import DeckList from './components/DeckList.jsx';
import DeckView from './components/DeckView.jsx';
import CreateFromMaterial from './components/CreateFromMaterial.jsx';
import Study from './components/Study.jsx';
import Settings from './components/Settings.jsx';

export default function App() {
  const [session, setSession] = useState(undefined); // undefined = still checking
  const [guest, setGuest] = useState(prefs.isGuest());
  const [view, setView] = useState({ name: 'decks' });

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  const user = session?.user;
  const store = useMemo(() => (user ? supabaseStore(user) : guest ? localStore() : null), [user, guest]);

  if (session === undefined) return <div className="center muted">Loading…</div>;

  if (!store) {
    return (
      <Auth
        onGuest={() => {
          prefs.setGuest(true);
          setGuest(true);
        }}
      />
    );
  }

  const go = (name, extra = {}) => setView({ name, ...extra });

  async function signOut() {
    if (user) await supabase.auth.signOut();
    prefs.setGuest(false);
    setGuest(false);
    go('decks');
  }

  let page;
  switch (view.name) {
    case 'deck':
      page = <DeckView store={store} deckId={view.deckId} go={go} />;
      break;
    case 'create':
      page = <CreateFromMaterial store={store} go={go} initialDeckId={view.deckId} />;
      break;
    case 'study':
      page = <Study store={store} deckId={view.deckId} practice={view.practice} go={go} />;
      break;
    case 'settings':
      page = <Settings go={go} />;
      break;
    default:
      page = <DeckList store={store} go={go} />;
  }

  return (
    <div className="app">
      <header className="topbar">
        <button className="brand" onClick={() => go('decks')}>
          🗂️ Flashcard Study
        </button>
        <nav>
          <button className="link" onClick={() => go('create')}>
            New from material
          </button>
          <button className="link" onClick={() => go('settings')}>
            Settings
          </button>
          <span className="who" title={user ? user.email : 'Saved in this browser only'}>
            {user ? user.email : 'Guest'}
          </span>
          <button className="link" onClick={signOut}>
            {user ? 'Sign out' : 'Exit guest mode'}
          </button>
        </nav>
      </header>
      {store.kind === 'local' && (
        <div className="banner">
          Guest mode: your decks are saved in this browser only. Create an account to keep them across devices.
        </div>
      )}
      <main>{page}</main>
    </div>
  );
}
