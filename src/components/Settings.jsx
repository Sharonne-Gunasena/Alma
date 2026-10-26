import { useState } from 'react';
import { PROVIDERS, listModels } from '../ai/providers.js';
import { prefs } from '../lib/prefs.js';
import { useApp } from '../context.js';

export default function Settings() {
  const { db, profile, reloadProfile, user } = useApp();
  const [provider, setProvider] = useState(prefs.getProvider());

  async function resetOnboarding() {
    await db.saveProfile({ onboarded: false });
    reloadProfile();
  }

  return (
    <div className="stack narrow">
      <header className="page-head">
        <h1>Settings</h1>
      </header>

      <section className="card stack">
        <strong>AI provider</strong>
        <p className="muted small">
          CampusLoop uses your own key. Gemini and Groq give free keys. Keys are stored only in this browser and are sent only to that
          provider, never to CampusLoop's database.
        </p>
        <div className="provider-list">
          {Object.entries(PROVIDERS).map(([id, p]) => (
            <label key={id} className={`provider ${provider === id ? 'active' : ''}`}>
              <input
                type="radio"
                name="provider"
                checked={provider === id}
                onChange={() => {
                  setProvider(id);
                  prefs.setProvider(id);
                }}
              />
              <span>
                <b>{p.label}</b> {p.free ? <span className="pill ok-pill">Free</span> : <span className="pill">Paid</span>}
                {p.vision && <span className="pill">Reads slide images</span>}
                {prefs.getKey(id) && <span className="ok small"> ✓ key saved</span>}
              </span>
            </label>
          ))}
        </div>
        <ProviderKey key={provider} provider={provider} />
      </section>

      <section className="card stack tight">
        <strong>Account</strong>
        <p className="small muted">
          {user ? `Signed in as ${user.email}.` : 'Guest mode: data is stored in this browser only.'} {profile?.university}
          {profile?.course ? ` · ${profile.course}` : ''}
          {profile?.year ? ` · Year ${profile.year}` : ''}
        </p>
        <div>
          <button onClick={resetOnboarding}>Redo setup (profile, timetable, study hours)</button>
        </div>
      </section>
    </div>
  );
}

function ProviderKey({ provider }) {
  const info = PROVIDERS[provider];
  const [key, setKey] = useState(prefs.getKey(provider));
  const [models, setModels] = useState(null);
  const [model, setModel] = useState(prefs.getModel(provider) || info.defaultModel);
  const [status, setStatus] = useState(null);

  async function saveAndTest(e) {
    e.preventDefault();
    prefs.setKey(provider, key);
    if (!key.trim()) return setStatus({ kind: 'ok', text: 'Key removed.' });
    setStatus({ kind: 'muted', text: 'Checking your key…' });
    try {
      const list = await listModels(provider, key.trim());
      setModels(list);
      prefs.setModels(provider, list);
      if (!list.includes(model)) {
        setModel(list[0]);
        prefs.setModel(provider, list[0]);
      }
      setStatus({ kind: 'ok', text: '✓ Key works. You can now generate flashcards with AI.' });
    } catch (err) {
      setStatus({ kind: 'error', text: err.message });
    }
  }

  return (
    <form className="stack" onSubmit={saveAndTest}>
      <ol className="small">
        <li>
          Get a key at{' '}
          <a href={info.keyUrl} target="_blank" rel="noreferrer">
            {new URL(info.keyUrl).hostname}
          </a>
          . {info.keyHelp}
        </li>
        <li>Paste it below and click Save &amp; test.</li>
      </ol>
      <label>
        {info.label} API key
        <input type="password" value={key} onChange={(e) => setKey(e.target.value)} autoComplete="off" placeholder="Paste your key" />
      </label>
      <label>
        Model
        <select
          value={model}
          onChange={(e) => {
            setModel(e.target.value);
            prefs.setModel(provider, e.target.value);
          }}
        >
          {(models ?? info.models ?? [model]).map((m) => (
            <option key={m}>{m}</option>
          ))}
        </select>
      </label>
      {status && <p className={status.kind}>{status.text}</p>}
      <div>
        <button className="primary">Save &amp; test</button>
      </div>
    </form>
  );
}
