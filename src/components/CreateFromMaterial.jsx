import { useEffect, useState } from 'react';
import { ACCEPTED_TYPES, extractText } from '../lib/extract.js';
import { generateFromRules } from '../lib/rules.js';
import { prefs } from '../lib/prefs.js';
import { MAX_UPLOAD_BYTES } from '../config.js';

export default function CreateFromMaterial({ store, go, initialDeckId }) {
  const [name, setName] = useState('');
  const [file, setFile] = useState(null);
  const [text, setText] = useState('');
  const [materials, setMaterials] = useState([]);
  const [saveUpload, setSaveUpload] = useState(true);

  const [method, setMethod] = useState(prefs.getApiKey() ? 'ai' : 'rules');
  const [count, setCount] = useState('auto');
  const [focus, setFocus] = useState('');

  const [candidates, setCandidates] = useState(null);
  const [decks, setDecks] = useState([]);
  const [target, setTarget] = useState(initialDeckId || 'new');
  const [newTitle, setNewTitle] = useState('');

  const [status, setStatus] = useState(null);
  const [error, setError] = useState(null);
  const [warning, setWarning] = useState(null);

  useEffect(() => {
    store.listMaterials().then(setMaterials).catch(() => {});
    store.listDecks().then(setDecks).catch(() => {});
  }, [store]);

  async function onFile(e) {
    const f = e.target.files[0];
    if (!f) return;
    setError(null);
    if (f.size > MAX_UPLOAD_BYTES) {
      setError('That file is larger than 20 MB. Split it into smaller files.');
      return;
    }
    setStatus('Reading file…');
    try {
      const extracted = await extractText(f);
      setFile(f);
      setName(f.name);
      setNewTitle(f.name.replace(/\.[^.]+$/, ''));
      setText(extracted);
    } catch (err) {
      setError(err.message);
    } finally {
      setStatus(null);
    }
  }

  async function loadMaterial(m) {
    setError(null);
    setStatus('Loading material…');
    try {
      setText(await store.getMaterialText(m.id));
      setName(m.name);
      setFile(null);
      setNewTitle(m.name.replace(/\.[^.]+$/, ''));
    } catch (err) {
      setError(err.message);
    } finally {
      setStatus(null);
    }
  }

  async function openOriginal(m) {
    const url = await store.materialUrl(m.storage_path);
    if (url) window.open(url, '_blank', 'noopener');
  }

  async function deleteMaterial(m) {
    if (!confirm(`Delete "${m.name}" from your uploaded materials?`)) return;
    await store.deleteMaterial(m);
    setMaterials(await store.listMaterials());
  }

  async function generate() {
    setError(null);
    setWarning(null);
    setCandidates(null);
    if (!text.trim()) {
      setError('Upload a file or paste some text first.');
      return;
    }
    try {
      if (saveUpload && (file || name === '')) {
        setStatus('Saving material…');
        const materialName = name || `Pasted notes ${new Date().toLocaleDateString()}`;
        // Saving the upload is a convenience, so a failure here shouldn't stop card generation.
        try {
          await store.saveMaterial({ name: materialName, file, text });
          setMaterials(await store.listMaterials());
          // Clearing the file and setting a name stops a second "Generate" from saving it again.
          setFile(null);
          setName(materialName);
        } catch (err) {
          setWarning(`Couldn't save this material to your uploads (${err.message}). Cards will still be generated.`);
        }
      }
      let cards;
      if (method === 'ai') {
        setStatus('Generating flashcards with AI… this can take up to a minute.');
        // The Anthropic SDK is large, so it loads only when someone uses AI generation.
        const { generateWithAI } = await import('../lib/generate.js');
        cards = await generateWithAI({ text, apiKey: prefs.getApiKey(), model: prefs.getModel(), count, focus });
      } else {
        cards = generateFromRules(text);
        if (!cards.length)
          throw new Error(
            'No "term: definition" lines or headings found. Try AI generation, or add cards by hand from the deck page.',
          );
      }
      setCandidates(cards.map((c) => ({ ...c, keep: true })));
      if (!newTitle) setNewTitle(name.replace(/\.[^.]+$/, '') || 'New deck');
    } catch (err) {
      setError(err.message);
    } finally {
      setStatus(null);
    }
  }

  function updateCandidate(i, patch) {
    setCandidates(candidates.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  }

  async function saveCards() {
    const chosen = candidates.filter((c) => c.keep && c.front.trim() && c.back.trim());
    if (!chosen.length) return setError('Select at least one card to save.');
    setStatus('Saving cards…');
    try {
      const deckId = target === 'new' ? (await store.createDeck(newTitle.trim() || 'New deck')).id : target;
      await store.addCards(
        deckId,
        chosen.map(({ front, back }) => ({ front: front.trim(), back: back.trim() })),
      );
      go('deck', { deckId });
    } catch (err) {
      setError(err.message);
      setStatus(null);
    }
  }

  const hasKey = !!prefs.getApiKey();
  const kept = candidates?.filter((c) => c.keep).length ?? 0;

  return (
    <div className="stack">
      <button className="link back" onClick={() => go('decks')}>
        ← All decks
      </button>
      <h1>Make flashcards from material</h1>

      <section className="card stack">
        <strong>1. Add your material</strong>
        <label className="drop">
          <input type="file" accept={ACCEPTED_TYPES} onChange={onFile} />
          <span>{file ? `📄 ${file.name}` : 'Choose a PDF, Word (.docx), text or Markdown file'}</span>
        </label>
        <label>
          Or paste / edit the text
          <textarea
            className="material"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste lecture notes, a textbook section, anything you want to learn…"
          />
        </label>
        <p className="muted small">{text ? `${text.length.toLocaleString()} characters` : ''}</p>
        <label className="check">
          <input type="checkbox" checked={saveUpload} onChange={(e) => setSaveUpload(e.target.checked)} />
          Save this material to my uploads{store.kind === 'local' ? ' (text only in guest mode)' : ''}
        </label>

        {materials.length > 0 && (
          <details>
            <summary>Your uploaded materials ({materials.length})</summary>
            <ul className="materials">
              {materials.map((m) => (
                <li key={m.id}>
                  <span>{m.name}</span>
                  <span className="row">
                    <button className="link" onClick={() => loadMaterial(m)}>
                      Use
                    </button>
                    {m.storage_path && (
                      <button className="link" onClick={() => openOriginal(m)}>
                        Open file
                      </button>
                    )}
                    <button className="link danger" onClick={() => deleteMaterial(m)}>
                      Delete
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      <section className="card stack">
        <strong>2. Generate cards</strong>
        <div className="row wrap">
          <label className="check">
            <input type="radio" checked={method === 'ai'} onChange={() => setMethod('ai')} />
            AI (Claude)
          </label>
          <label className="check">
            <input type="radio" checked={method === 'rules'} onChange={() => setMethod('rules')} />
            Quick, free: from "term: definition" lines and headings
          </label>
        </div>
        {method === 'ai' && (
          <>
            {!hasKey && (
              <p className="warn">
                AI generation needs your own Anthropic API key.{' '}
                <button className="link" onClick={() => go('settings')}>
                  Add it in Settings
                </button>
              </p>
            )}
            <div className="row wrap">
              <label>
                Number of cards
                <select value={count} onChange={(e) => setCount(e.target.value)}>
                  <option value="auto">Automatic</option>
                  {[5, 10, 15, 20, 30, 40, 50].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grow">
                Focus (optional)
                <input
                  value={focus}
                  onChange={(e) => setFocus(e.target.value)}
                  placeholder="e.g. definitions only, exam-style questions, chapter 3"
                />
              </label>
            </div>
          </>
        )}
        <div>
          <button className="primary" onClick={generate} disabled={!!status || (method === 'ai' && !hasKey)}>
            Generate flashcards
          </button>
        </div>
      </section>

      {status && <p className="muted">{status}</p>}
      {warning && <p className="warn">{warning}</p>}
      {error && <p className="error">{error}</p>}

      {candidates && (
        <section className="card stack">
          <strong>3. Review and save ({kept} selected)</strong>
          {candidates.map((c, i) => (
            <div key={i} className={`candidate ${c.keep ? '' : 'off'}`}>
              <input type="checkbox" checked={c.keep} onChange={(e) => updateCandidate(i, { keep: e.target.checked })} />
              <div className="two grow">
                <textarea value={c.front} onChange={(e) => updateCandidate(i, { front: e.target.value })} />
                <textarea value={c.back} onChange={(e) => updateCandidate(i, { back: e.target.value })} />
              </div>
            </div>
          ))}
          <div className="row wrap">
            <label>
              Save to
              <select value={target} onChange={(e) => setTarget(e.target.value)}>
                <option value="new">A new deck</option>
                {decks.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.title}
                  </option>
                ))}
              </select>
            </label>
            {target === 'new' && (
              <label className="grow">
                Deck name
                <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} />
              </label>
            )}
          </div>
          <div>
            <button className="primary" onClick={saveCards} disabled={!!status}>
              Save {kept} card{kept === 1 ? '' : 's'}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
