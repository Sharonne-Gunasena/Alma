import { useState } from 'react';
import { motion } from 'motion/react';
import { ArrowRight, CalendarDays, Layers, Sparkles } from 'lucide-react';
import { RevealText } from '../ui/motion.jsx';
import { supabase } from '../supabase.js';
import { LogoMark } from './Shell.jsx';
import { Button } from '../ui/Button.jsx';
import { Field, Input, PasswordInput } from '../ui/form.jsx';
import { Segmented } from '../ui/primitives.jsx';
import { MIN_PASSWORD, passwordStrength } from '../lib/password.js';

const FEATURES = [
  { icon: Sparkles, title: 'Lecture slides → flashcards', text: 'AI reads your slides, diagrams included, and writes cards and a study guide.' },
  { icon: CalendarDays, title: 'A plan that adapts', text: 'Study sessions fit around your timetable and reshuffle when life happens.' },
  { icon: Layers, title: 'Spaced repetition', text: 'Review each card right before you would forget it.' },
];

// Floating notification chips on the brand panel.
const CHIPS = [
  { dot: 'bg-orange-400', title: 'COMP10110 lecture', sub: 'In 25 min · Science Hub', className: 'top-[16%] right-[8%]' },
  { dot: 'bg-emerald-400', title: '12 cards reviewed', sub: '92% recall today', className: 'top-[44%] right-[5%]' },
  { dot: 'bg-sky-400', title: 'Assignment due Thu', sub: '3h planned before then', className: 'bottom-[18%] right-[6%]' },
];

const TITLES = { signin: 'Welcome back', signup: 'Create your account', reset: 'Reset your password' };
const SUBTITLES = {
  signin: 'Sign in to pick up where you left off.',
  signup: 'Free. Your notes stay private unless you choose to share them.',
  reset: "Enter your account's email and we'll send you a link to set a new password.",
};
const SUBMIT = { signin: 'Sign in', signup: 'Create account', reset: 'Send reset link' };

// A bar and a word that update as the student types a new password.
export function StrengthMeter({ password, email }) {
  const { score, label } = passwordStrength(password, email);
  const tone = ['bg-rose-500', 'bg-amber-500', 'bg-sky-500', 'bg-emerald-500'][score];
  return (
    <div className="-mt-2 flex flex-col gap-1.5" aria-live="polite">
      <div className="flex gap-1" aria-hidden>
        {[1, 2, 3].map((i) => (
          <span key={i} className={`h-1 flex-1 rounded-full ${i <= Math.max(score, 1) ? tone : 'bg-line'}`} />
        ))}
      </div>
      <p className="text-xs text-muted">Password strength: {label}</p>
    </div>
  );
}

function friendlyAuthError(message) {
  if (/rate limit/i.test(message))
    return "Too many sign-up emails have been sent in the last hour, so this one couldn't go out. Please try again later, or use \"Try it without an account\" for now.";
  if (/invalid login credentials/i.test(message)) return 'That email and password don’t match. Check them, or create an account.';
  if (/email not confirmed/i.test(message)) return 'Please confirm your email first. Check your inbox (and spam) for the link.';
  return message;
}

export default function Auth({ onGuest }) {
  const [mode, setMode] = useState('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  function switchTo(m) {
    setMode(m);
    setMessage(null);
  }

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    // Links in emails come back to this page; App picks up the session from the URL.
    const back = window.location.origin + window.location.pathname;
    if (mode === 'reset') {
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: back });
      setBusy(false);
      // Same message whether or not the email has an account, so the form can't be used to find accounts.
      if (error) setMessage({ kind: 'error', text: friendlyAuthError(error.message) });
      else setMessage({ kind: 'ok', text: 'If that email has an account, a link to set a new password is on its way. Check your inbox (and spam).' });
      return;
    }
    const strength = passwordStrength(password, email);
    if (mode === 'signup' && strength.score === 0) {
      setBusy(false);
      setMessage({ kind: 'error', text: `Choose a stronger password: ${strength.label.toLowerCase()}.` });
      return;
    }
    const { data, error } =
      mode === 'signin'
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password, options: { emailRedirectTo: back } });
    setBusy(false);
    if (error) setMessage({ kind: 'error', text: friendlyAuthError(error.message) });
    else if (mode === 'signup' && !data.session) setMessage({ kind: 'ok', text: 'Check your email for a confirmation link, then sign in.' });
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      {/* Brand panel */}
      <section className="relative hidden overflow-hidden bg-gradient-to-br from-orange-700 via-orange-700 to-red-700 p-12 text-white lg:flex lg:flex-col">
        <div className="pointer-events-none absolute -top-40 -left-40 size-[520px] rounded-full bg-amber-300/30 blur-3xl motion-safe:animate-[drift-a_24s_ease-in-out_infinite_alternate]" />
        <div className="pointer-events-none absolute -right-32 bottom-0 size-[380px] rounded-full bg-sky-300/30 blur-3xl motion-safe:animate-[drift-b_30s_ease-in-out_infinite_alternate]" />
        <div className="relative flex items-center gap-3 text-lg font-semibold tracking-tight">
          <LogoMark /> Alma
        </div>
        <div className="relative mt-auto mb-auto flex max-w-md flex-col gap-8">
          <div className="flex flex-col gap-4">
            <p className="flex items-center gap-2 text-sm font-medium text-orange-100">
              <span className="size-1.5 rotate-45 bg-sky-300" /> Built for university students
            </p>
            <h1 className="text-5xl leading-[1.05] font-semibold tracking-[-0.04em]">
              <RevealText text="Your whole semester." className="block" />
              <RevealText text="One loop." className="block text-sky-200" delay={0.25} />
            </h1>
          </div>
          <ul className="flex flex-col gap-5">
            {FEATURES.map((f, i) => (
              <motion.li key={f.title} initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.15 + i * 0.1 }} className="flex gap-4">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/10 text-indigo-200 ring-1 ring-white/10">
                  <f.icon className="size-5" />
                </span>
                <span>
                  <p className="font-medium">{f.title}</p>
                  <p className="text-sm text-orange-50/90">{f.text}</p>
                </span>
              </motion.li>
            ))}
          </ul>
        </div>
        {CHIPS.map((c, i) => (
          <motion.div
            key={c.title}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: [0, -6, 0] }}
            transition={{ opacity: { delay: 0.4 + i * 0.15 }, y: { duration: 5 + i, repeat: Infinity, ease: 'easeInOut', delay: i } }}
            className={`absolute hidden rounded-2xl bg-white px-4 py-2.5 text-slate-900 shadow-2xl xl:block ${c.className}`}
          >
            <p className="flex items-center gap-2 text-sm font-semibold">
              <span className={`size-2 rounded-full ${c.dot}`} /> {c.title}
            </p>
            <p className="pl-4 text-xs text-slate-500">{c.sub}</p>
          </motion.div>
        ))}
      </section>

      {/* Form */}
      <section className="flex items-center justify-center px-5 py-12">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="flex w-full max-w-sm flex-col gap-7">
          <div className="flex flex-col gap-3 lg:hidden">
            <LogoMark />
            <p className="text-sm text-muted">Your timetable, deadlines and study in one place.</p>
          </div>
          <div className="flex flex-col gap-2">
            <h2 className="text-3xl font-semibold tracking-tight">{TITLES[mode]}</h2>
            <p className="text-sm text-muted">{SUBTITLES[mode]}</p>
          </div>

          {mode !== 'reset' && (
          <Segmented
            className="w-full [&>button]:flex-1 [&>button]:justify-center"
            value={mode}
            onChange={switchTo}
            options={[
              { value: 'signin', label: 'Sign in' },
              { value: 'signup', label: 'Create account' },
            ]}
          />
          )}

          <form className="flex flex-col gap-4" onSubmit={submit}>
            <Field label="Email" hint={mode === 'signup' ? 'Any email works: personal or university.' : undefined}>
              <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" placeholder="you@example.com" />
            </Field>
            {mode !== 'reset' && (
              <Field label="Password" hint={mode === 'signup' ? `At least ${MIN_PASSWORD} characters. A short sentence works well.` : undefined}>
                <PasswordInput
                  required
                  minLength={mode === 'signup' ? MIN_PASSWORD : 6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                />
              </Field>
            )}
            {mode === 'signup' && password && <StrengthMeter password={password} email={email} />}
            {mode === 'signin' && (
              <button type="button" onClick={() => switchTo('reset')} className="-mt-2 w-fit text-sm font-medium text-indigo-700 hover:underline dark:text-indigo-300">
                Forgot password?
              </button>
            )}
            {message && (
              <p
                className={
                  message.kind === 'error'
                    ? 'rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300'
                    : 'rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300'
                }
              >
                {message.text}
              </p>
            )}
            <Button variant="primary" size="lg" disabled={busy} className="w-full">
              {busy ? 'Please wait…' : SUBMIT[mode]} {!busy && <ArrowRight />}
            </Button>
            {mode === 'signup' && (
              <p className="text-xs text-muted">
                By creating an account you agree to the{' '}
                <a href="#/terms" className="font-medium text-fg underline">
                  Terms
                </a>{' '}
                and confirm you have read the{' '}
                <a href="#/privacy" className="font-medium text-fg underline">
                  Privacy policy
                </a>
                .
              </p>
            )}
            {mode === 'reset' && (
              <button type="button" onClick={() => switchTo('signin')} className="w-fit text-sm font-medium text-indigo-700 hover:underline dark:text-indigo-300">
                Back to sign in
              </button>
            )}
          </form>

          <div className="flex items-center gap-3 text-xs text-muted">
            <span className="h-px flex-1 bg-line" /> or <span className="h-px flex-1 bg-line" />
          </div>
          <Button variant="secondary" onClick={onGuest} className="w-full">
            Try it without an account
          </Button>
          <p className="flex justify-center gap-4 text-xs text-muted">
            <a href="#/privacy" className="hover:text-fg">
              Privacy
            </a>
            <a href="#/terms" className="hover:text-fg">
              Terms
            </a>
          </p>
        </motion.div>
      </section>
    </div>
  );
}
