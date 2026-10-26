import { useState } from 'react';
import { supabase } from '../supabase.js';

export default function Auth({ onGuest }) {
  const [mode, setMode] = useState('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    const { data, error } =
      mode === 'signin'
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({
            email,
            password,
            options: { emailRedirectTo: window.location.origin + window.location.pathname },
          });
    setBusy(false);
    if (error) setMessage({ kind: 'error', text: error.message });
    else if (mode === 'signup' && !data.session)
      setMessage({ kind: 'ok', text: 'Check your email for a confirmation link, then sign in.' });
  }

  return (
    <div className="auth">
      <h1>🗂️ Flashcard Study</h1>
      <p className="muted">Upload your notes, turn them into flashcards, and study with spaced repetition.</p>

      <form className="card stack" onSubmit={submit}>
        <div className="tabs">
          <button type="button" className={mode === 'signin' ? 'active' : ''} onClick={() => setMode('signin')}>
            Sign in
          </button>
          <button type="button" className={mode === 'signup' ? 'active' : ''} onClick={() => setMode('signup')}>
            Create account
          </button>
        </div>
        <label>
          Email
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        </label>
        <label>
          Password
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
          />
        </label>
        {message && <p className={message.kind}>{message.text}</p>}
        <button className="primary" disabled={busy}>
          {busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}
        </button>
      </form>

      <button className="link" onClick={onGuest}>
        Try it without an account →
      </button>
    </div>
  );
}
