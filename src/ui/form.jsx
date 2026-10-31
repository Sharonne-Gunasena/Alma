import { forwardRef, useState } from 'react';
import { ChevronDown, Eye, EyeOff } from 'lucide-react';
import { cn } from './cn.js';
import { useApp } from '../context.js';

// 16px text on phones: iOS Safari zooms the page into any smaller input when it's tapped.
const field =
  'w-full rounded-xl border border-line bg-card px-3.5 py-2.5 text-base sm:text-sm text-fg shadow-[0_1px_0_rgb(15_23_42/0.02)] outline-none transition-colors placeholder:text-muted/70 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10 disabled:opacity-60';

export function Field({ label, hint, children, className }) {
  return (
    <label className={cn('flex flex-col gap-1.5', className)}>
      {label && <span className="text-[13px] font-medium text-fg">{label}</span>}
      {children}
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </label>
  );
}

export const Input = forwardRef(function Input({ className, ...props }, ref) {
  return <input ref={ref} className={cn(field, 'h-10 py-0', className)} {...props} />;
});

// A password field with a show/hide button inside it.
export function PasswordInput({ className, ...props }) {
  const [shown, setShown] = useState(false);
  return (
    <div className="relative">
      <input type={shown ? 'text' : 'password'} className={cn(field, 'h-10 py-0 pr-11', className)} {...props} />
      <button
        type="button"
        onClick={() => setShown((s) => !s)}
        aria-label={shown ? 'Hide password' : 'Show password'}
        aria-pressed={shown}
        className="absolute inset-y-0 right-0 grid w-11 place-items-center rounded-r-xl text-muted hover:text-fg"
      >
        {shown ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}

export const Textarea = forwardRef(function Textarea({ className, ...props }, ref) {
  return <textarea ref={ref} className={cn(field, 'min-h-24 resize-y leading-relaxed', className)} {...props} />;
});

export function Select({ className, children, ...props }) {
  return (
    <div className="relative">
      <select className={cn(field, 'h-10 appearance-none py-0 pr-9', className)} {...props}>
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted" />
    </div>
  );
}

export function ModuleSelect({ value, onChange, label = 'Module', allowNone = true }) {
  const { modules } = useApp();
  return (
    <Field label={label}>
      <Select value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}>
        {allowNone && <option value="">No module</option>}
        {modules.map((m) => (
          <option key={m.id} value={m.id}>
            {m.code ? `${m.code} · ${m.name}` : m.name}
          </option>
        ))}
      </Select>
    </Field>
  );
}

// An on/off switch with a label and optional description.
export function Toggle({ checked, onChange, label, description, disabled }) {
  return (
    <label className={cn('flex cursor-pointer items-start justify-between gap-4', disabled && 'cursor-not-allowed opacity-50')}>
      <span className="flex flex-col gap-0.5">
        <span className="text-sm font-medium">{label}</span>
        {description && <span className="text-xs text-muted">{description}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn('relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors', checked ? 'bg-indigo-600' : 'bg-line')}
      >
        <span className={cn('absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition-transform duration-200', checked && 'translate-x-5')} />
      </button>
    </label>
  );
}

export function Checkbox({ checked, onChange, className, ...props }) {
  return (
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      className={cn('size-[18px] shrink-0 cursor-pointer rounded-md accent-indigo-600', className)}
      {...props}
    />
  );
}

// A selectable card used like a radio button.
export function ChoiceCard({ selected, onSelect, icon: Icon, title, description, badge, disabled }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        'flex w-full items-start gap-3 rounded-2xl border p-4 text-left transition-all',
        selected ? 'border-indigo-400 bg-soft ring-4 ring-indigo-500/10' : 'border-line bg-card hover:border-indigo-200 dark:hover:border-indigo-500/40',
        disabled && 'cursor-not-allowed opacity-50',
      )}
    >
      {Icon && (
        <span className={cn('grid size-9 shrink-0 place-items-center rounded-xl', selected ? 'bg-indigo-700 text-white' : 'bg-subtle text-muted')}>
          <Icon className="size-[18px]" />
        </span>
      )}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex flex-wrap items-center gap-2 text-sm font-semibold">
          {title} {badge}
        </span>
        {description && <span className="text-xs text-muted">{description}</span>}
      </span>
      <span className={cn('mt-1 grid size-4 shrink-0 place-items-center rounded-full border-2', selected ? 'border-indigo-600' : 'border-line')}>
        {selected && <span className="size-2 rounded-full bg-indigo-600" />}
      </span>
    </button>
  );
}
