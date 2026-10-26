import { useState } from 'react';
import { MODELS } from '../config.js';
import { prefs } from '../lib/prefs.js';

export default function Settings({ go }) {
  const [key, setKey] = useState(prefs.getApiKey());
  const [model, setModel] = useState(prefs.getModel());
  const [saved, setSaved] = useState(false);

  function save(e) {
    e.preventDefault();
    prefs.setApiKey(key);
    prefs.setModel(model);
    setSaved(true);
  }

  return (
    <div className="stack narrow">
      <button className="link back" onClick={() => go('decks')}>
        ← All decks
      </button>
      <h1>Settings</h1>

      <form className="card stack" onSubmit={save}>
        <strong>AI flashcard generation</strong>
        <p className="muted small">
          Use your own Anthropic API key from{' '}
          <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer">
            console.anthropic.com
          </a>
          . It's stored only in this browser and sent only to Anthropic. It's never saved to your account. Usage is
          billed to your Anthropic account.
        </p>
        <label>
          API key
          <input
            type="password"
            value={key}
            onChange={(e) => {
              setKey(e.target.value);
              setSaved(false);
            }}
            placeholder="sk-ant-…"
            autoComplete="off"
          />
        </label>
        <label>
          Model
          <select
            value={model}
            onChange={(e) => {
              setModel(e.target.value);
              setSaved(false);
            }}
          >
            {MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        <div className="row">
          <button className="primary">Save</button>
          {key && (
            <button
              type="button"
              onClick={() => {
                setKey('');
                prefs.setApiKey('');
                setSaved(true);
              }}
            >
              Remove key
            </button>
          )}
          {saved && <span className="ok">Saved ✓</span>}
        </div>
      </form>
    </div>
  );
}
