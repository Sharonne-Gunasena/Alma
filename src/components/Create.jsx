import { useState } from 'react';
import { useApp, useLoad, go } from '../context.js';
import { ACCEPTED_TYPES, extractDocument, splitIntoPages } from '../lib/extract.js';
import { addCards, deleteMaterial, listDecks, materialPages, saveMaterial } from '../lib/data.js';
import { generateFromRules } from '../lib/rules.js';
import { activeAI } from '../ai/providers.js';
import { CARD_TYPES } from '../ai/cardTypes.js';
import { MAX_UPLOAD_BYTES } from '../config.js';
import { ModuleSelect } from './bits.jsx';

export default function Create({ moduleId: initialModule, deckId: initialDeck }) {
  const { db } = useApp();
  const ai = activeAI();

  const [moduleId, setModuleId] = useState(initialModule);
  const [title, setTitle] = useState('');
  const [file, setFile] = useState(null);
  const [doc, setDoc] = useState(null); // { pages, pdf }
  const [pasted, setPasted] = useState('');

  const [method, setMethod] = useState(ai ? 'ai' : 'rules');
  const [useImages, setUseImages] = useState(true);
  const [thorough, setThorough] = useState(true);
  const [focus, setFocus] = useState('');

  const [progress, setProgress] = useState(null);
  const [result, setResult] = useState(null); // { cards, guide }
  const [target, setTarget] = useState(initialDeck || 'new');
  const [error, setError] = useState(null);
  const [warning, setWarning] = useState(null);

  const [library, reloadLibrary] = useLoad(async () => {
    const [materials, decks] = await Promise.all([db.list('materials', {}, 'id, name, module_id, page_count, storage_path, created_at'), listDecks(db)]);
    return { materials: materials.sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? '')), decks };
  }, [db]);

  async function onFile(e) {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    setError(null);
    if (f.size > MAX_UPLOAD_BYTES) return setError('That file is larger than 20 MB. Split it into smaller files.');
    setProgress({ label: 'Reading file…' });
    try {
      setDoc(await extractDocument(f));
      setFile(f);
      setPasted('');
      setTitle(f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' '));
      setResult(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setProgress(null);
    }
  }

  async function useSaved(m) {
    const full = await db.get('materials', m.id);
    setDoc({ pages: materialPages(full), pdf: null, materialId: m.id });
    setFile(null);
    setTitle(m.name);
    if (m.module_id) setModuleId(m.module_id);
    setResult(null);
  }

  async function removeSaved(m) {
    if (!confirm(`Delete "${m.name}" from your lectures? Cards made from it are kept.`)) return;
    await deleteMaterial(db, m);
    reloadLibrary();
  }

  const pages = doc?.pages ?? (pasted.trim() ? splitIntoPages(pasted) : []);

  async function generate() {
    setError(null);
    setWarning(null);
    setResult(null);
    if (!pages.length) return setError('Upload a lecture or paste some notes first.');
    try {
      if (method === 'rules') {
        const cards = generateFromRules(pages.map((p) => p.text).join('\n')).map((c) => ({ ...c, type: 'definition', flags: [] }));
        if (!cards.length) throw new Error('No "term: definition" lines or headings found. Try AI generation instead.');
        setResult({ cards: cards.map((c) => ({ ...c, keep: true })), guide: null });
      } else {
        const { buildStudySet } = await import('../ai/engine.js');
        const set = await buildStudySet({
          ai,
          title: title || 'Lecture',
          pages,
          pdf: doc?.pdf,
          focus,
          thorough,
          useImages,
          onProgress: setProgress,
        });
        if (!set.cards.length) throw new Error('No cards came back. Try another model or turn on "Read slide images".');
        setResult({ cards: set.cards.map((c) => ({ ...c, keep: c.flags.length === 0 || !c.flags.some((f) => f.startsWith('Answer not')) })), guide: set.guide });
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setProgress(null);
    }
  }

  const update = (i, patch) => setResult({ ...result, cards: result.cards.map((c, j) => (j === i ? { ...c, ...patch } : c)) });

  async function save() {
    const chosen = result.cards.filter((c) => c.keep && c.front.trim() && c.back.trim());
    if (!chosen.length) return setError('Select at least one card to save.');
    setProgress({ label: 'Saving…' });
    try {
      let materialId = doc?.materialId ?? null;
      if (!materialId) {
        const name = title || file?.name || `Notes ${new Date().toLocaleDateString()}`;
        try {
          materialId = (await saveMaterial(db, { name, file, pages, moduleId, guide: result.guide })).id;
        } catch (err) {
          // The original file is a convenience; keep the text and cards even if the upload fails.
          setWarning(`Couldn't store the original file (${err.message}); saved the text only.`);
          materialId = (await saveMaterial(db, { name, file: null, pages, moduleId, guide: result.guide })).id;
        }
      } else if (result.guide) {
        await db.update('materials', materialId, { guide: result.guide });
      }
      const deckId = target === 'new' ? (await db.insert('decks', { title: title || 'New deck', module_id: moduleId ?? null })).id : target;
      await addCards(
        db,
        deckId,
        chosen.map(({ front, back, type, topic, page }) => ({ front: front.trim(), back: back.trim(), type, topic, page, material_id: materialId })),
      );
      go(`/decks/${deckId}`);
    } catch (err) {
      setError(err.message);
      setProgress(null);
    }
  }

  const kept = result?.cards.filter((c) => c.keep).length ?? 0;
  const canSeeImages = ai?.info.vision && doc?.pdf;

  return (
    <div className="stack">
      <header className="page-head">
        <div>
          <h1>Lecture → flashcards</h1>
          <p className="muted">Upload slides or notes. CampusLoop works through them section by section and builds flashcards and a study guide.</p>
        </div>
      </header>

      <section className="card stack">
        <strong>1. Your lecture</strong>
        <label className="drop">
          <input type="file" accept={ACCEPTED_TYPES} onChange={onFile} />
          <span>{file ? `📄 ${file.name} · ${pages.length} pages` : doc?.materialId ? `📄 ${title} (saved)` : '📄 Choose a PDF, Word, text or Markdown file'}</span>
        </label>
        {!doc && (
          <label>
            …or paste notes
            <textarea className="material" value={pasted} onChange={(e) => setPasted(e.target.value)} placeholder="Paste lecture notes, a textbook section…" />
          </label>
        )}
        <div className="two">
          <label>
            Title
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Week 7: Eigenvalues" />
          </label>
          <ModuleSelect value={moduleId} onChange={setModuleId} />
        </div>
        {library?.materials.length > 0 && (
          <details>
            <summary>Your saved lectures ({library.materials.length})</summary>
            <ul className="plain list">
              {library.materials.map((m) => (
                <li key={m.id} className="row between">
                  <span>{m.name}</span>
                  <span className="row small">
                    <button className="link" onClick={() => useSaved(m)}>
                      Use
                    </button>
                    {m.storage_path && (
                      <button className="link" onClick={async () => window.open(await db.fileUrl(m.storage_path), '_blank', 'noopener')}>
                        Open file
                      </button>
                    )}
                    <button className="link danger" onClick={() => removeSaved(m)}>
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
        <strong>2. How to make cards</strong>
        <label className="check">
          <input type="radio" checked={method === 'ai'} onChange={() => setMethod('ai')} />
          AI {ai ? `(${ai.info.label} · ${ai.model})` : ''}
        </label>
        {method === 'ai' && !ai && (
          <p className="warn">
            Add a free Gemini or Groq key in <a href="#/settings">Settings</a> to use AI. It takes a minute and costs nothing.
          </p>
        )}
        {method === 'ai' && ai && (
          <div className="stack tight indent">
            <label className="check">
              <input type="checkbox" checked={thorough} onChange={(e) => setThorough(e.target.checked)} />
              Double-check cards (a second pass fixes vague or wrong cards; slower)
            </label>
            {canSeeImages && (
              <label className="check">
                <input type="checkbox" checked={useImages} onChange={(e) => setUseImages(e.target.checked)} />
                Read slide images (diagrams, equations, code screenshots)
              </label>
            )}
            <label>
              Focus (optional)
              <input value={focus} onChange={(e) => setFocus(e.target.value)} placeholder="e.g. exam-style questions, skip the history section" />
            </label>
          </div>
        )}
        <label className="check">
          <input type="radio" checked={method === 'rules'} onChange={() => setMethod('rules')} />
          Quick &amp; offline: from "term: definition" lines and headings
        </label>
        <div>
          <button className="primary" onClick={generate} disabled={!!progress || (method === 'ai' && !ai) || !pages.length}>
            Generate
          </button>
        </div>
      </section>

      {progress && (
        <div className="card stack tight">
          <span>{progress.label}</span>
          {progress.steps && (
            <div className="progress">
              <span style={{ width: `${Math.round((progress.step / progress.steps) * 100)}%` }} />
            </div>
          )}
        </div>
      )}
      {warning && <p className="warn">{warning}</p>}
      {error && <p className="error">{error}</p>}

      {result && (
        <>
          {result.guide && (
            <section className="card stack tight">
              <strong>Study guide preview</strong>
              {result.guide.sections.map((s, i) => (
                <div key={i}>
                  <b>{s.topic}</b> <small className="muted">p. {s.pages.join(', ')}</small>
                  <p className="small">{s.summary}</p>
                </div>
              ))}
              <p className="muted small">The full guide (with key terms) is saved with the lecture.</p>
            </section>
          )}

          <section className="card stack">
            <strong>3. Review cards ({kept} of {result.cards.length} selected)</strong>
            <p className="muted small">Untick anything you don't want. Cards flagged ⚠ were not clearly found in your notes, so they're unticked until you check them.</p>
            {result.cards.map((c, i) => (
              <div key={i} className={`candidate ${c.keep ? '' : 'off'}`}>
                <input type="checkbox" checked={c.keep} onChange={(e) => update(i, { keep: e.target.checked })} />
                <div className="grow stack tight">
                  <div className="row wrap small muted">
                    {c.type && <span className="type">{CARD_TYPES[c.type] ?? c.type}</span>}
                    {c.topic && <span>{c.topic}</span>}
                    {c.page && <span>p. {c.page}</span>}
                    {c.flags?.map((f) => (
                      <span key={f} className="flag">
                        ⚠ {f}
                      </span>
                    ))}
                  </div>
                  <div className="two">
                    <textarea value={c.front} onChange={(e) => update(i, { front: e.target.value })} />
                    <textarea value={c.back} onChange={(e) => update(i, { back: e.target.value })} />
                  </div>
                </div>
              </div>
            ))}
            <div className="row wrap">
              <label>
                Save to
                <select value={target} onChange={(e) => setTarget(e.target.value)}>
                  <option value="new">New deck: {title || 'New deck'}</option>
                  {library?.decks.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.title}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div>
              <button className="primary" onClick={save} disabled={!!progress}>
                Save {kept} card{kept === 1 ? '' : 's'}
                {result.guide ? ' + study guide' : ''}
              </button>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
