// Free, offline card generation: picks up "term: definition" style lines and
// Markdown headings followed by text.
export function generateFromRules(text) {
  const cards = [];
  const lines = text.split(/\r?\n/);

  const termLine = /^\s*(?:[-*•]\s*|\d+[.)]\s*)?(\*\*)?([^:\n]{2,80}?)\1?\s*(?::|—|–|\s-\s)\s*(.{3,})$/;
  const used = new Set();
  lines.forEach((line, i) => {
    if (/https?:\/\//.test(line) || /^\s*#/.test(line)) return;
    const m = line.match(termLine);
    if (m) {
      cards.push({ front: m[2].trim(), back: m[3].trim() });
      used.add(i);
    }
  });

  let heading = null;
  let body = [];
  const flush = () => {
    const back = body.join(' ').replace(/\s+/g, ' ').trim();
    if (heading && back) cards.push({ front: heading, back: back.length > 600 ? back.slice(0, 600) + '…' : back });
  };
  // Lines that already became term cards don't count as a heading's text.
  lines.forEach((line, i) => {
    const h = line.match(/^\s*#{1,6}\s+(.+)$/);
    if (h) {
      flush();
      heading = h[1].trim();
      body = [];
    } else if (line.trim() && !used.has(i)) {
      body.push(line.trim());
    }
  });
  flush();

  return cleanCards(cards);
}

export function cleanCards(cards) {
  const seen = new Set();
  return cards
    .map((c) => ({ front: c.front.trim(), back: c.back.trim() }))
    .filter((c) => {
      const key = c.front.toLowerCase();
      if (!c.front || !c.back || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}
