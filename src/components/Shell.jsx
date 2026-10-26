import { useApp } from '../context.js';

const NAV = [
  { path: '/', label: 'Today', icon: '🏠', match: (s) => !s },
  { path: '/planner', label: 'Planner', icon: '🗓️', match: (s) => s === 'planner' },
  { path: '/timetable', label: 'Timetable', icon: '⏰', match: (s) => s === 'timetable' },
  { path: '/modules', label: 'Modules', icon: '📚', match: (s) => s === 'modules' || s === 'guides' },
  { path: '/decks', label: 'Flashcards', icon: '🗂️', match: (s) => s === 'decks' || s === 'create' || s === 'study' },
];

export default function Shell({ route, children }) {
  const { user, profile, signOut } = useApp();
  const section = route.parts[0];

  return (
    <div className="shell">
      <aside className="sidebar">
        <a className="logo" href="#/">
          <span className="logo-mark">◎</span> CampusLoop
        </a>
        <nav>
          {NAV.map((n) => (
            <a key={n.path} href={`#${n.path}`} className={n.match(section) ? 'active' : ''}>
              <span aria-hidden="true">{n.icon}</span> {n.label}
            </a>
          ))}
        </nav>
        <div className="sidebar-foot">
          <a href="#/settings" className={section === 'settings' ? 'active' : ''}>
            <span aria-hidden="true">⚙️</span> Settings
          </a>
          <div className="who" title={user?.email ?? 'Saved in this browser only'}>
            {profile?.display_name || user?.email || 'Guest'}
          </div>
          <button className="link small" onClick={signOut}>
            {user ? 'Sign out' : 'Exit guest mode'}
          </button>
        </div>
      </aside>

      <main className="content">
        {!user && (
          <div className="banner">Guest mode: everything is saved in this browser only. Create an account to sync across devices.</div>
        )}
        {children}
      </main>

      <nav className="tabbar">
        {NAV.map((n) => (
          <a key={n.path} href={`#${n.path}`} className={n.match(section) ? 'active' : ''}>
            <span aria-hidden="true">{n.icon}</span>
            <small>{n.label}</small>
          </a>
        ))}
      </nav>
    </div>
  );
}
