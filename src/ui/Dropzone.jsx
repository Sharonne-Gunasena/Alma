import { useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Upload } from 'lucide-react';
import { cn } from './cn.js';

// Click or drag-and-drop a single file.
export function Dropzone({ accept, onFile, icon: Icon = Upload, title, subtitle, selected, className }) {
  const input = useRef();
  const [over, setOver] = useState(false);

  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.99 }}
      onClick={() => input.current.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const file = e.dataTransfer.files[0];
        if (file) onFile(file);
      }}
      className={cn(
        'flex w-full flex-col items-center gap-3 rounded-2xl border-2 border-dashed px-6 py-8 text-center transition-all',
        over ? 'scale-[1.01] border-indigo-400 bg-soft' : 'border-line hover:border-indigo-300 hover:bg-subtle/60 dark:hover:border-indigo-500/50',
        className,
      )}
    >
      <span className={cn('grid size-12 place-items-center rounded-2xl transition-colors', over || selected ? 'bg-indigo-600 text-white' : 'bg-soft text-indigo-600 dark:text-indigo-300')}>
        <Icon className="size-6" />
      </span>
      <span className="flex flex-col gap-0.5">
        <span className="text-sm font-semibold">{selected ?? title}</span>
        <span className="text-xs text-muted">{selected ? 'Click to choose a different file' : subtitle}</span>
      </span>
      <input
        ref={input}
        type="file"
        accept={accept}
        hidden
        onChange={(e) => {
          const file = e.target.files[0];
          e.target.value = '';
          if (file) onFile(file);
        }}
      />
    </motion.button>
  );
}
