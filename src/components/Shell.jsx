import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { BookOpen, CalendarDays, ClipboardCheck, Clock3, House, Layers, LogOut, MessagesSquare, MoreHorizontal, NotebookPen, Settings, Shapes, X } from 'lucide-react';
import { useApp } from '../context.js';
import { Aurora } from '../ui/motion.jsx';
import { Modal } from '../ui/dialog.jsx';
import { cn } from '../ui/cn.js';

// `tab` items get their own slot in the phone tab bar; the rest live under "More".
const NAV = [
  { path: '/', label: 'Today', icon: House, match: (s) => !s, tab: true },
  { path: '/planner', label: 'Planner', icon: CalendarDays, match: (s) => s === 'planner', tab: true },
  { path: '/timetable', label: 'Timetable', icon: Clock3, match: (s) => s === 'timetable' },
  { path: '/modules', label: 'Modules', icon: BookOpen, match: (s) => s === 'modules' || s === 'hubs' },
  { path: '/chat', label: 'Chat', icon: MessagesSquare, match: (s) => s === 'chat', tab: true },
  { path: '/workspaces', label: 'Workspaces', icon: Shapes, match: (s) => s === 'workspaces' },
  { path: '/guides', label: 'Guides', icon: NotebookPen, match: (s) => s === 'guides' || s === 'lectures' },
  { path: '/decks', label: 'Flashcards', icon: Layers, match: (s) => s === 'decks' || s === 'create' || s === 'study', tab: true },
  { path: '/exam', label: 'Exam practice', icon: ClipboardCheck, match: (s) => s === 'exam' },
];
// Phone order: the most-used places first, thumb-reachable.
const TABS = ['/', '/planner', '/decks', '/chat'].map((p) => NAV.find((n) => n.path === p));
const MORE = NAV.filter((n) => !n.tab);

// Selection moves without bounce: it follows a tap, not a throw.
const SLIDE = { type: 'spring', bounce: 0, duration: 0.35 };

const BANNER_KEY = 'cl_guest_banner_hidden';
const bannerHidden = () => {
  try {
    return localStorage.getItem(BANNER_KEY) === '1';
  } catch {
    return false;
  }
};

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
  const [moreOpen, setMoreOpen] = useState(false);
  const [hideBanner, setHideBanner] = useState(bannerHidden);
  // A study session is a focused task: no tab bar or banner competing with the card.
  const focused = section === 'study';
  const moreActive = MORE.some((n) => n.match(section));

  function dismissBanner() {
    setHideBanner(true);
    try {
      localStorage.setItem(BANNER_KEY, '1');
    } catch {
      /* storage blocked: hidden for this visit only */
    }
  }

  return (
    <div className="min-h-screen md:grid md:grid-cols-[76px_1fr] lg:grid-cols-[248px_1fr]">
      <Aurora />
      {/* Sidebar: icon rail on tablets, full width on desktop. */}
      <aside className="sticky top-0 hidden h-screen flex-col gap-8 border-r border-line bg-card px-3 py-5 text-muted md:flex lg:px-4">
        <a href="#/" className="flex items-center gap-3 px-1.5 text-fg no-underline">
          <LogoMark />
          <span className="hidden text-[17px] font-semibold tracking-tight lg:inline">Alma</span>
        </a>

        <nav aria-label="Main" className="flex flex-col gap-1">
          {NAV.map((n) => {
            const active = n.match(section);
            return (
              <a
                key={n.path}
                href={`#${n.path}`}
                title={n.label}
                aria-label={n.label}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium no-underline transition-colors max-lg:justify-center',
                  active ? 'text-orange-700 dark:text-orange-300' : 'text-muted hover:bg-subtle hover:text-fg',
                )}
              >
                {active && (
                  <motion.span layoutId="nav-active" className="absolute inset-0 rounded-xl bg-soft ring-1 ring-orange-200/70 dark:ring-orange-500/20" transition={SLIDE} />
                )}
                {active && <motion.span layoutId="nav-bar" className="absolute top-2 bottom-2 -left-3 w-1 rounded-r-full bg-sky-400 lg:-left-4" transition={SLIDE} />}
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
            aria-label="Settings"
            aria-current={section === 'settings' ? 'page' : undefined}
            className={cn(
              'group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium no-underline transition-colors max-lg:justify-center',
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
              aria-label={user ? 'Sign out' : 'Exit guest mode'}
              className="hidden rounded-lg p-1.5 text-muted transition-colors hover:bg-card hover:text-fg lg:block"
            >
              <LogOut className="size-4" />
            </button>
          </div>
        </div>
      </aside>

      <div className="min-w-0">
        {/* Phone header */}
        <header className="material sticky top-0 z-20 flex items-center justify-between border-b border-line bg-bg/80 px-4 py-2 backdrop-blur-xl md:hidden">
          <a href="#/" className="flex items-center gap-2.5 font-semibold tracking-tight text-fg no-underline">
            <LogoMark className="size-8" /> Alma
          </a>
          <a href="#/settings" className="grid size-11 place-items-center rounded-full text-muted hover:bg-subtle hover:text-fg" aria-label="Settings">
            <Settings className="size-5" />
          </a>
        </header>

        <main className={cn('mx-auto w-full max-w-6xl px-4 pt-6 sm:px-6 md:pb-12 lg:px-10 lg:pt-10', focused ? 'pb-36' : 'pb-32')}>
          {!user && !hideBanner && !focused && (
            <div className="mb-6 flex items-center gap-2 rounded-2xl border border-indigo-200/60 bg-soft py-1 pr-1 pl-4 text-[13px] text-indigo-900 dark:border-indigo-500/20 dark:text-indigo-200">
              <span className="size-1.5 shrink-0 rounded-full bg-sky-500" />
              <span className="flex-1 py-1.5">Guest mode: everything is saved in this browser only. Create an account to sync across devices.</span>
              <button onClick={dismissBanner} aria-label="Dismiss" className="grid size-9 shrink-0 place-items-center rounded-full text-indigo-900/60 hover:bg-card hover:text-indigo-900 dark:text-indigo-200/60 dark:hover:text-indigo-200">
                <X className="size-4" />
              </button>
            </div>
          )}
          {/* The new page appears at once; a short fade only softens the swap. */}
          <AnimatePresence initial={false}>
            <motion.div key={route.path} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.15 }}>
              {children}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      {/* Phone tab bar: four places plus More (the HIG's five-tab limit). */}
      {!focused && (
        <nav
          aria-label="Main"
          className="material fixed inset-x-3 bottom-3 z-30 flex rounded-2xl border border-line bg-card/95 p-1.5 shadow-lift backdrop-blur-xl md:hidden"
          style={{ marginBottom: 'env(safe-area-inset-bottom)' }}
        >
          {TABS.map((n) => (
            <TabItem key={n.path} href={`#${n.path}`} icon={n.icon} label={n.label} active={n.match(section)} />
          ))}
          <TabItem icon={MoreHorizontal} label="More" active={moreActive} onClick={() => setMoreOpen(true)} />
        </nav>
      )}

      <Modal open={moreOpen} onOpenChange={setMoreOpen} title="More" side="right">
        <nav aria-label="More" className="-mx-2 flex flex-col gap-1">
          {MORE.map((n) => {
            const active = n.match(section);
            return (
              <a
                key={n.path}
                href={`#${n.path}`}
                onClick={() => setMoreOpen(false)}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex min-h-12 items-center gap-3 rounded-xl px-3 text-[15px] font-medium no-underline',
                  active ? 'bg-soft text-orange-700 dark:text-orange-300' : 'text-fg hover:bg-subtle',
                )}
              >
                <n.icon className="size-5 text-muted" strokeWidth={1.9} />
                {n.label}
              </a>
            );
          })}
        </nav>
      </Modal>
    </div>
  );
}

function TabItem({ href, icon: Icon, label, active, onClick }) {
  const Tag = href ? 'a' : 'button';
  return (
    <Tag
      href={href}
      type={href ? undefined : 'button'}
      onClick={onClick}
      aria-current={href && active ? 'page' : undefined}
      className={cn(
        'relative flex min-h-12 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl py-1.5 text-[11px] font-medium no-underline',
        active ? 'text-orange-700 dark:text-orange-300' : 'text-muted',
      )}
    >
      {active && <motion.span layoutId="tab-active" className="absolute inset-0 rounded-xl bg-soft" transition={SLIDE} />}
      <Icon className="relative size-5" strokeWidth={1.9} />
      <span className="relative">{label}</span>
    </Tag>
  );
}
