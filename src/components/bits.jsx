// Small shared UI pieces.
import { useApp } from '../context.js';

export function ModuleTag({ moduleId }) {
  const { moduleById } = useApp();
  const m = moduleById(moduleId);
  if (!m) return null;
  return (
    <span className="tag" style={{ '--c': m.color }}>
      {m.code || m.name}
    </span>
  );
}

export function ModuleSelect({ value, onChange, allowNone = true, label = 'Module' }) {
  const { modules } = useApp();
  return (
    <label>
      {label}
      <select value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}>
        {allowNone && <option value="">No module</option>}
        {modules.map((m) => (
          <option key={m.id} value={m.id}>
            {m.code ? `${m.code} · ${m.name}` : m.name}
          </option>
        ))}
      </select>
    </label>
  );
}

export function Empty({ title, children }) {
  return (
    <div className="card empty">
      <p>
        <strong>{title}</strong>
      </p>
      {children}
    </div>
  );
}

export function SchemaHint({ error }) {
  if (!error) return null;
  const missing = /schema cache|does not exist|column/.test(error);
  return (
    <p className="error">
      {missing
        ? 'The database needs updating: run supabase/migrations/002_campusloop.sql in the Supabase SQL Editor, then reload.'
        : error}
    </p>
  );
}

export { timeOf } from '../lib/time.js';
