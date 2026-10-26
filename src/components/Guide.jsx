import { useApp, useLoad } from '../context.js';
import { ModuleTag } from './bits.jsx';

export default function Guide({ materialId }) {
  const { db } = useApp();
  const [material, , error] = useLoad(() => db.get('materials', materialId), [db, materialId]);

  if (error) return <p className="error">{error}</p>;
  if (!material) return <p className="muted">Loading…</p>;
  const guide = material.guide;

  return (
    <div className="stack guide">
      <a className="back" href={material.module_id ? `#/modules/${material.module_id}` : '#/decks'}>
        ← Back
      </a>
      <header className="page-head">
        <div>
          <ModuleTag moduleId={material.module_id} />
          <h1>{material.name}</h1>
          <p className="muted">Study guide{guide?.model ? ` · made with ${guide.model}` : ''}</p>
        </div>
        <button className="no-print" onClick={() => window.print()}>
          Print / PDF
        </button>
      </header>

      {!guide ? (
        <p className="muted">No study guide yet. Generate flashcards from this lecture with AI to create one.</p>
      ) : (
        <>
          <nav className="card toc no-print">
            <strong>Contents</strong>
            <ol>
              {guide.sections.map((s, i) => (
                <li key={i}>
                  <a href={`#/guides/${materialId}`} onClick={(e) => (e.preventDefault(), document.getElementById(`s${i}`)?.scrollIntoView({ behavior: 'smooth' }))}>
                    {s.topic}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
          {guide.sections.map((s, i) => (
            <section key={i} id={`s${i}`} className="card stack tight">
              <div className="row between">
                <h2>{s.topic}</h2>
                <small className="muted">p. {s.pages.length > 1 ? `${s.pages[0]}–${s.pages[s.pages.length - 1]}` : s.pages[0]}</small>
              </div>
              <p>{s.summary}</p>
              {s.key_terms?.length > 0 && (
                <dl className="terms">
                  {s.key_terms.map((t) => (
                    <div key={t.term}>
                      <dt>{t.term}</dt>
                      <dd>{t.definition}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </section>
          ))}
        </>
      )}
    </div>
  );
}
