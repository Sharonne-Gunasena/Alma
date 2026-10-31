// Shown after someone opens a password-reset link: Supabase signs them in for
// this one purpose, and they choose a new password before carrying on.
import { useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '../supabase.js';
import { LogoMark } from './Shell.jsx';
import { StrengthMeter } from './Auth.jsx';
import { Button } from '../ui/Button.jsx';
import { Field, PasswordInput } from '../ui/form.jsx';
import { MIN_PASSWORD, passwordStrength } from '../lib/password.js';

export default function SetPassword({ email, onDone }) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function save(e) {
    e.preventDefault();
    const strength = passwordStrength(password, email);
    if (strength.score === 0) return setError(`Choose a stronger password: ${strength.label.toLowerCase()}.`);
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) return setError(error.message);
    toast.success('Password updated');
    onDone();
  }

  return (
    <main id="main" className="grid min-h-screen place-items-center px-5 py-12">
      <form onSubmit={save} className="flex w-full max-w-sm flex-col gap-5">
        <LogoMark />
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold tracking-tight">Choose a new password</h1>
          <p className="text-sm text-muted">For {email}.</p>
        </div>
        <Field label="New password" hint={`At least ${MIN_PASSWORD} characters. A short sentence works well.`}>
          <PasswordInput required minLength={MIN_PASSWORD} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        {password && <StrengthMeter password={password} email={email} />}
        {error && <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}
        <Button variant="primary" size="lg" disabled={busy} className="w-full">
          {busy ? 'Saving…' : 'Save password'}
        </Button>
      </form>
    </main>
  );
}
