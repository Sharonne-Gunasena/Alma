// Tiptap setup for study guides: the usual rich-text tools plus study blocks
// (callouts for key terms, notes, tips, warnings and questions) and maths.
import { Node, mergeAttributes } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Highlight from '@tiptap/extension-highlight';
import Image from '@tiptap/extension-image';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import { Placeholder } from '@tiptap/extensions';
import Mathematics from '@tiptap/extension-mathematics';
import Collaboration from '@tiptap/extension-collaboration';
import { CALLOUTS } from '../../lib/guides.js';

// A coloured box with a label ("🔑 Key term", "💡 Note", …) that holds any blocks.
export const Callout = Node.create({
  name: 'callout',
  group: 'block',
  content: 'block+',
  defining: true,

  addAttributes() {
    return {
      tone: {
        default: 'info',
        parseHTML: (el) => el.getAttribute('data-tone') || 'info',
        renderHTML: (attrs) => {
          const c = CALLOUTS[attrs.tone] ?? CALLOUTS.info;
          return { 'data-tone': attrs.tone, 'data-label': `${c.emoji} ${c.label}` };
        },
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-callout]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-callout': '' }), 0];
  },

  addCommands() {
    return {
      setCallout:
        (tone = 'info') =>
        ({ commands }) =>
          commands.wrapIn(this.name, { tone }),
      toggleCallout:
        (tone = 'info') =>
        ({ editor, commands }) =>
          editor.isActive(this.name) ? (editor.isActive(this.name, { tone }) ? commands.lift(this.name) : commands.updateAttributes(this.name, { tone })) : commands.wrapIn(this.name, { tone }),
    };
  },
});

// With `ydoc`, the document is shared live (Yjs); Yjs then provides undo, so StarterKit's is off.
export function buildExtensions({ onEditMath, placeholder = 'Start writing, or pick a block from the toolbar…', ydoc } = {}) {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      ...(ydoc ? { undoRedo: false } : {}),
      link: { openOnClick: false, autolink: true, defaultProtocol: 'https' },
    }),
    Highlight.configure({ multicolor: false }),
    Image.configure({ allowBase64: true }),
    TaskList,
    TaskItem.configure({ nested: true }),
    Placeholder.configure({ placeholder }),
    Callout,
    Mathematics.configure({
      katexOptions: { throwOnError: false },
      blockOptions: { onClick: (node, pos) => onEditMath?.('block', node, pos) },
      inlineOptions: { onClick: (node, pos) => onEditMath?.('inline', node, pos) },
    }),
    ...(ydoc ? [Collaboration.configure({ document: ydoc, field: 'notes' })] : []),
  ];
}

// Shrinks an image so a guide stays small enough to store and sync.
export function imageToDataUrl(file, maxWidth = 1200) {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, maxWidth / img.width);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL(file.type === 'image/png' ? 'image/png' : 'image/jpeg', 0.82));
    };
    img.onerror = () => reject(new Error('That file could not be read as an image.'));
    img.src = url;
  });
}
