import { AnimatePresence, motion } from 'motion/react';
import { BookOpen, CalendarDays, Clock3, House, Layers, LogOut, MessagesSquare, NotebookPen, Settings, Shapes } from 'lucide-react';
import { useApp } from '../context.js';
import { cn } from '../ui/cn.js';

const NAV = [
  { path: '/', label: 'Today', icon: House, match: (s) => !s },
  { path: '/planner', label: 'Planner', icon: CalendarDays, match: (s) => s === 'planner' },
  { path: '/timetable', label: 'Timetable', icon: Clock3, match: (s) => s === 'timetable' },
  { path: '/modules', label: 'Modules', icon: BookOpen, match: (s) => s === 'modules' || s === 'hubs' },
  { path: '/chat', label: 'Chat', icon: MessagesSquare, match: (s) => s === 'chat' },
  // Sidebar only: the phone tab bar is full, so phones reach workspaces from Chat.
  { path: '/workspaces', label: 'Workspaces', icon: Shapes, match: (s) => s === 'workspaces', phone: false },
  { path: '/guides', label: 'Guides', icon: NotebookPen, match: (s) => s === 'guides' || s === 'lectures' },
  { path: '/decks', label: 'Flashcards', icon: Layers, match: (s) => s === 'decks' || s === 'create' || s === 'study' },
];

export function LogoMark({ className }) {
  return (
    <span className={cn('relative inline-grid size-9 place-items-center rounded-xl bg-gradient-to-br from-orange-500 to-red-600 shadow-glow', className)}>
      <svg viewBox="0 0 24 24" className="size-5" fill="none" aria-hidden>
        <circle cx="12" cy="12" r="6.5" stroke="white" strokeWidth="2.6" />
        <circle cx="18.2" cy="8.4" r="2.4" fill="#7dd3fc" stroke="#ea580c" strokeWidth="1.4" />
      </svg>
    </span>
  );
}

const initials = (name) =>
  name
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');

export default function Shell({ route, children }) {
  const { user, profile, signOut } = useApp();
  const section = route.parts[0];
  const name = profile?.display_name || user?.email || 'Guest';

  return (
    <div className="min-h-screen md:grid md:grid-cols-[76px_1fr] lg:grid-cols-[248px_1fr]">
      {/* Sidebar: icon rail on tablets, full width on desktop. */}
      <aside className="sticky top-0 hidden h-screen flex-col gap-8 border-r border-line bg-card px-3 py-5 text-muted md:flex lg:px-4">
        <a href="#/" className="flex items-center gap-3 px-1.5 text-fg no-underline">
          <LogoMark />
          <span className="hidden text-[17px] font-semibold tracking-tight lg:inline">CampusLoop</span>
        </a>

        <nav className="flex flex-col gap-1">
          {NAV.map((n) => {
            const active = n.match(section);
            return (
              <a
                key={n.path}
                href={`#${n.path}`}
                title={n.label}
                className={cn(
                  'relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium no-underline transition-colors max-lg:justify-center',
                  active ? 'text-orange-700 dark:text-orange-300' : 'text-muted hover:bg-subtle hover:text-fg',
                )}
              >
                {active && (
                  <motion.span
                    layoutId="nav-active"
                    className="absolute inset-0 rounded-xl bg-soft ring-1 ring-orange-200/70 dark:ring-orange-500/20"
                    transition={{ type: 'spring', bounce: 0.18, duration: 0.5 }}
                  />
                )}
                {active && <motion.span layoutId="nav-bar" className="absolute top-2 bottom-2 -left-3 w-1 rounded-r-full bg-sky-400 lg:-left-4" />}
                <n.icon className="relative size-[18px]" strokeWidth={1.9} />
                <span className="relative hidden lg:inline">{n.label}</span>
              </a>
            );
          })}
        </nav>

        <div className="mt-auto flex flex-col gap-1">
          <a
            href="#/settings"
            title="Settings"
            className={cn(
              'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium no-underline transition-colors max-lg:justify-center',
              section === 'settings' ? 'bg-soft text-orange-700 dark:text-orange-300' : 'text-muted hover:bg-subtle hover:text-fg',
            )}
          >
            <Settings className="size-[18px]" strokeWidth={1.9} />
            <span className="hidden lg:inline">Settings</span>
          </a>
          <div className="mt-2 flex items-center gap-3 rounded-2xl bg-subtle p-2.5 ring-1 ring-sky-100 max-lg:justify-center dark:ring-sky-500/10">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-orange-400 to-red-500 text-[13px] font-semibold text-white">
              {initials(name) || 'G'}
            </span>
            <div className="hidden min-w-0 flex-1 lg:block">
              <p className="truncate text-sm font-medium text-fg">{profile?.display_name || 'Student'}</p>
              <p className="truncate text-xs text-muted">{user?.email ?? 'Guest · this browser only'}</p>
            </div>
            <button
              onClick={signOut}
              title={user ? 'Sign out' : 'Exit guest mode'}
              className="hidden rounded-lg p-1.5 text-muted transition-colors hover:bg-card hover:text-fg lg:block"
            >
              <LogOut className="size-4" />
            </button>
          </div>
        </div>
      </aside>

      <div className="min-w-0">
        {/* Phone header */}
        <header className="sticky top-0 z-20 flex items-center justify-between border-b border-line bg-bg/80 px-4 py-3 backdrop-blur-xl md:hidden">
          <a href="#/" className="flex items-center gap-2.5 font-semibold tracking-tight text-fg no-underline">
            <LogoMark className="size-8" /> CampusLoop
          </a>
          <a href="#/settings" className="rounded-full p-2 text-muted hover:bg-subtle hover:text-fg" aria-label="Settings">
            <Settings className="size-5" />
          </a>
        </header>

        <main className="mx-auto w-full max-w-6xl px-4 pt-6 pb-32 sm:px-6 md:pb-12 lg:px-10 lg:pt-10">
          {!user && (
            <div className="mb-6 flex items-center gap-2 rounded-2xl border border-indigo-200/60 bg-soft px-4 py-2.5 text-[13px] text-indigo-900 dark:border-indigo-500/20 dark:text-indigo-200">
              <span className="size-1.5 shrink-0 rounded-full bg-sky-500" />
              Guest mode: everything is saved in this browser only. Create an account to sync across devices.
            </div>
          )}
          <AnimatePresence mode="wait">
            <motion.div
              key={route.path}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      {/* Phone tab bar */}
      <nav className="fixed inset-x-3 bottom-3 z-30 flex rounded-2xl border border-line bg-card/95 p-1.5 shadow-lift backdrop-blur-xl md:hidden" style={{ marginBottom: 'env(safe-area-inset-bottom)' }}>
        {NAV.filter((n) => n.phone !== false).map((n) => {
          const active = n.match(section);
          return (
            <a key={n.path} href={`#${n.path}`} className={cn('relative flex flex-1 flex-col items-center gap-0.5 rounded-xl py-1.5 text-[10px] font-medium no-underline', active ? 'text-orange-700 dark:text-orange-300' : 'text-muted')}>
              {active && <motion.span layoutId="tab-active" className="absolute inset-0 rounded-xl bg-soft" transition={{ type: 'spring', bounce: 0.2, duration: 0.45 }} />}
              <n.icon className="relative size-5" strokeWidth={1.9} />
              <span className="relative">{n.label}</span>
            </a>
          );
        })}
      </nav>
    </div>
  );
}
