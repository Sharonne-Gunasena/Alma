// Animated modal dialogs and side sheets (Radix for accessibility, Motion for
// animation), plus app-wide confirm() and prompt() replacements.
import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Dialog, DropdownMenu } from 'radix-ui';
import { X } from 'lucide-react';
import { Button } from './Button.jsx';
import { Input } from './form.jsx';
import { cn } from './cn.js';

const ease = [0.22, 1, 0.36, 1];

export function Modal({ open, onOpenChange, title, description, side, children, footer, className }) {
  const sheet = side === 'right';
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild forceMount>
              <motion.div
                className="fixed inset-0 z-50 bg-ink/40 backdrop-blur-[2px]"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              />
            </Dialog.Overlay>
            <Dialog.Content asChild forceMount>
              <motion.div
                className={cn(
                  'fixed z-50 flex flex-col border border-line bg-card shadow-2xl outline-none',
                  sheet
                    ? 'inset-y-0 right-0 w-full max-w-md rounded-l-3xl max-sm:top-auto max-sm:max-h-[92vh] max-sm:rounded-t-3xl max-sm:rounded-l-none'
                    : // Centring offsets are animated by Motion (x/y), not Tailwind classes.
                      'top-1/2 left-1/2 max-h-[90vh] w-[calc(100vw-2rem)] max-w-lg rounded-3xl',
                  className,
                )}
                initial={sheet ? { x: '100%' } : { opacity: 0, scale: 0.96, y: '-46%', x: '-50%' }}
                animate={sheet ? { x: 0 } : { opacity: 1, scale: 1, y: '-50%', x: '-50%' }}
                exit={sheet ? { x: '100%' } : { opacity: 0, scale: 0.97, y: '-48%', x: '-50%' }}
                transition={{ duration: 0.32, ease }}
              >
                <div className="flex items-start justify-between gap-4 px-6 pt-6 pb-2">
                  <div className="flex flex-col gap-1">
                    <Dialog.Title className="text-lg font-semibold tracking-tight">{title}</Dialog.Title>
                    {description ? (
                      <Dialog.Description className="text-sm text-muted">{description}</Dialog.Description>
                    ) : (
                      <Dialog.Description className="sr-only">{title}</Dialog.Description>
                    )}
                  </div>
                  <Dialog.Close className="-mt-1 -mr-2 rounded-full p-2 text-muted transition-colors hover:bg-subtle hover:text-fg" aria-label="Close">
                    <X className="size-4" />
                  </Dialog.Close>
                </div>
                <div className="flex-1 overflow-y-auto px-6 py-4">{children}</div>
                {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line px-6 py-4">{footer}</div>}
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
}

// ---------- confirm() / prompt() ----------

const DialogsContext = createContext(null);
export const useDialogs = () => useContext(DialogsContext);

export function DialogsProvider({ children }) {
  const [state, setState] = useState(null);
  const [value, setValue] = useState('');
  const resolver = useRef(null);

  const open = useCallback((opts) => {
    setValue(opts.defaultValue ?? '');
    setState(opts);
    return new Promise((resolve) => (resolver.current = resolve));
  }, []);

  const close = (result) => {
    resolver.current?.(result);
    resolver.current = null;
    setState(null);
  };

  const api = {
    confirm: (opts) => open({ ...opts, kind: 'confirm' }),
    prompt: (opts) => open({ ...opts, kind: 'prompt' }),
  };

  const cancel = () => close(state?.kind === 'prompt' ? null : false);
  const ok = () => close(state?.kind === 'prompt' ? value.trim() || null : true);

  return (
    <DialogsContext.Provider value={api}>
      {children}
      <Modal
        open={!!state}
        onOpenChange={(o) => !o && cancel()}
        title={state?.title}
        description={state?.description}
        footer={
          <>
            <Button variant="ghost" onClick={cancel}>
              Cancel
            </Button>
            <Button variant={state?.danger ? 'secondary' : 'primary'} className={state?.danger ? 'border-rose-200 text-rose-600 hover:border-rose-400 dark:border-rose-500/30 dark:text-rose-400' : ''} onClick={ok}>
              {state?.confirmLabel ?? 'OK'}
            </Button>
          </>
        }
      >
        {state?.kind === 'prompt' && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              ok();
            }}
          >
            <Input autoFocus value={value} onChange={(e) => setValue(e.target.value)} placeholder={state.placeholder} />
          </form>
        )}
      </Modal>
    </DialogsContext.Provider>
  );
}

// ---------- Dropdown menu ----------

export function Menu({ trigger, items, align = 'end' }) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>{trigger}</DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align={align}
          sideOffset={6}
          className="z-50 min-w-48 rounded-2xl border border-line bg-card p-1.5 shadow-lift data-[state=open]:animate-[menu-in_160ms_ease-out]"
        >
          {items.filter(Boolean).map((item, i) =>
            item === '-' ? (
              <DropdownMenu.Separator key={i} className="my-1 h-px bg-line" />
            ) : (
              <DropdownMenu.Item
                key={item.label}
                onSelect={item.onSelect}
                className={cn(
                  'flex cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2 text-sm outline-none select-none data-[highlighted]:bg-subtle [&_svg]:size-4 [&_svg]:text-muted',
                  item.danger && 'text-rose-600 dark:text-rose-400 [&_svg]:text-current',
                )}
              >
                {item.icon && <item.icon />}
                {item.label}
              </DropdownMenu.Item>
            ),
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
