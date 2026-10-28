// Study guides are stored as Tiptap/ProseMirror JSON documents. These helpers
// build documents (templates, conversions from AI lecture guides) and read
// them back (sections, plain text, Markdown) without needing an editor.

// ---------- Building blocks ----------

const text = (t, marks) => (t ? [{ type: 'text', text: t, ...(marks ? { marks } : {}) }] : undefined);
export const p = (t) => ({ type: 'paragraph', ...(t ? { content: text(t) } : {}) });
export const h = (level, t) => ({ type: 'heading', attrs: { level }, content: text(t) });
export const callout = (tone, ...children) => ({ type: 'callout', attrs: { tone }, content: children.length ? children : [p()] });
export const bullets = (...items) => ({ type: 'bulletList', content: (items.length ? items : ['']).map((i) => ({ type: 'listItem', content: [p(i)] })) });
const term = (t, def) => ({ type: 'paragraph', content: [...text(t, [{ type: 'bold' }]), ...(def ? text(` — ${def}`) : [])] });
export const doc = (...content) => ({ type: 'doc', content });

export const CALLOUTS = {
  keyterm: { label: 'Key term', emoji: '🔑' },
  info: { label: 'Note', emoji: '💡' },
  tip: { label: 'Tip', emoji: '✅' },
  warning: { label: 'Watch out', emoji: '⚠️' },
  question: { label: 'Question', emoji: '❓' },
};

// ---------- Templates ----------

export const TEMPLATES = {
  blank: { label: 'Blank page', description: 'Start from nothing.', build: () => doc(p()) },
  summary: {
    label: 'Lecture summary',
    description: 'Big picture, key ideas, terms and open questions.',
    build: () =>
      doc(
        h(2, 'The big picture'),
        p('What was this lecture about, in two or three sentences?'),
        h(2, 'Key ideas'),
        bullets('', ''),
        h(2, 'Key terms'),
        callout('keyterm', term('Term', 'definition')),
        h(2, 'Questions I still have'),
        callout('question', p()),
      ),
  },
  cornell: {
    label: 'Cornell notes',
    description: 'Cue questions, notes, then a summary in your own words.',
    build: () =>
      doc(
        h(2, 'Cues & questions'),
        callout('question', p('Write questions that the notes below answer. Cover the notes and test yourself with these.')),
        h(2, 'Notes'),
        bullets(''),
        h(2, 'Summary'),
        callout('info', p('Summarise the whole page in your own words.')),
      ),
  },
  cheatsheet: {
    label: 'Exam cheat sheet',
    description: 'One page: formulas, definitions, pitfalls.',
    build: () =>
      doc(
        h(2, 'Must-know definitions'),
        callout('keyterm', term('Term', 'definition')),
        h(2, 'Formulas & rules'),
        { type: 'blockMath', attrs: { latex: 'a^2 + b^2 = c^2' } },
        h(2, 'Worked example'),
        p(),
        h(2, 'Common mistakes'),
        callout('warning', p()),
      ),
  },
};

// ---------- Conversions ----------

// The AI lecture guide ({ sections: [{ topic, summary, key_terms, pages }] }) as an editable document.
export function fromLectureGuide(guide) {
  const content = [];
  for (const s of guide?.sections ?? []) {
    content.push(h(2, s.topic));
    if (s.summary) content.push(p(s.summary));
    if (s.key_terms?.length) content.push(callout('keyterm', ...s.key_terms.map((t) => term(t.term, t.definition))));
  }
  return doc(...(content.length ? content : [p()]));
}

// ---------- Reading documents ----------

export function slugify(s) {
  return (
    String(s ?? '')
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^\w\s-]/g, '')
      .trim()
      .replace(/[\s_]+/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 60) || 'section'
  );
}

export function nodeText(node) {
  if (!node) return '';
  if (node.type === 'text') return node.text ?? '';
  if (node.type === 'blockMath' || node.type === 'inlineMath') return node.attrs?.latex ?? '';
  if (node.type === 'hardBreak') return '\n';
  const inner = (node.content ?? []).map(nodeText);
  // Text inside one line joins directly; blocks inside containers go on separate lines.
  if (['paragraph', 'heading', 'codeBlock'].includes(node.type)) return inner.join('');
  return inner.filter((t) => t !== '').join('\n');
}

// Splits a guide into sections at its headings: [{ heading, anchor, level, text }].
// Text before the first heading becomes an "Introduction" section.
export function sections(document) {
  const out = [];
  let current = { heading: 'Introduction', anchor: 'introduction', level: 0, nodes: [] };
  const seen = new Map();
  for (const node of document?.content ?? []) {
    if (node.type === 'heading') {
      if (current.nodes.length || current.level) out.push(current);
      const heading = nodeText(node).trim() || 'Untitled section';
      let anchor = slugify(heading);
      const n = seen.get(anchor) ?? 0;
      seen.set(anchor, n + 1);
      if (n) anchor = `${anchor}-${n + 1}`;
      current = { heading, anchor, level: node.attrs?.level ?? 2, nodes: [] };
    } else current.nodes.push(node);
  }
  if (current.nodes.length || current.level) out.push(current);
  return out.map(({ nodes, ...s }) => ({ ...s, text: nodes.map(nodeText).join('\n').trim() }));
}

export const plainText = (document) => nodeText(document).trim();

// ---------- Markdown export ----------

function marksToMd(node) {
  let t = node.text ?? '';
  for (const m of node.marks ?? []) {
    if (m.type === 'bold') t = `**${t}**`;
    else if (m.type === 'italic') t = `*${t}*`;
    else if (m.type === 'strike') t = `~~${t}~~`;
    else if (m.type === 'code') t = `\`${t}\``;
    else if (m.type === 'highlight') t = `==${t}==`;
    else if (m.type === 'underline') t = `<u>${t}</u>`;
    else if (m.type === 'link') t = `[${t}](${m.attrs?.href ?? ''})`;
  }
  return t;
}

function inlineMd(nodes = []) {
  return nodes
    .map((n) => (n.type === 'text' ? marksToMd(n) : n.type === 'inlineMath' ? `$${n.attrs?.latex ?? ''}$` : n.type === 'hardBreak' ? '  \n' : ''))
    .join('');
}

function blockMd(node, depth = 0) {
  const indent = '  '.repeat(depth);
  switch (node.type) {
    case 'paragraph':
      return inlineMd(node.content);
    case 'heading':
      return `${'#'.repeat(node.attrs?.level ?? 2)} ${inlineMd(node.content)}`;
    case 'bulletList':
    case 'orderedList':
    case 'taskList':
      return (node.content ?? [])
        .map((item, i) => {
          const marker = node.type === 'orderedList' ? `${i + 1}.` : node.type === 'taskList' ? `- [${item.attrs?.checked ? 'x' : ' '}]` : '-';
          const [first, ...rest] = item.content ?? [];
          const lines = [`${indent}${marker} ${first ? blockMd(first, depth + 1) : ''}`];
          for (const child of rest) lines.push(blockMd(child, depth + 1));
          return lines.join('\n');
        })
        .join('\n');
    case 'blockquote':
      return (node.content ?? []).map((c) => blockMd(c).replace(/^/gm, '> ')).join('\n>\n');
    case 'callout': {
      const c = CALLOUTS[node.attrs?.tone] ?? CALLOUTS.info;
      const body = (node.content ?? []).map((n) => blockMd(n)).join('\n\n');
      return `> ${c.emoji} **${c.label}**\n>\n${body.replace(/^/gm, '> ')}`;
    }
    case 'codeBlock':
      return `\`\`\`${node.attrs?.language ?? ''}\n${nodeText(node)}\n\`\`\``;
    case 'blockMath':
      return `$$\n${node.attrs?.latex ?? ''}\n$$`;
    case 'horizontalRule':
      return '---';
    case 'image':
      return `![${node.attrs?.alt ?? ''}](${node.attrs?.src ?? ''})`;
    default:
      return (node.content ?? []).map((n) => blockMd(n, depth)).join('\n\n');
  }
}

export function toMarkdown(document, title) {
  const body = (document?.content ?? []).map((n) => blockMd(n)).filter((s) => s !== undefined).join('\n\n');
  return `${title ? `# ${title}\n\n` : ''}${body}`.replace(/\n{3,}/g, '\n\n').trim() + '\n';
}
