// Turns an uploaded file into pages of text, entirely in the browser.
// PDFs keep their real page numbers so cards can point back to the slide;
// the pdf.js document is kept so pages can also be rendered as images.

export const ACCEPTED_TYPES = '.pdf,.docx,.txt,.md,.markdown,.csv';

export async function extractDocument(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith('.pdf')) return extractPdf(file);
  if (name.endsWith('.docx')) return { pages: splitIntoPages(await extractDocx(file)), pdf: null };
  if (/\.(txt|md|markdown|csv)$/.test(name) || file.type.startsWith('text/'))
    return { pages: splitIntoPages(await file.text()), pdf: null };
  throw new Error('Unsupported file type. Use PDF, Word (.docx), text or Markdown.');
}

async function loadPdfjs() {
  const pdfjs = await import('pdfjs-dist');
  const { default: workerUrl } = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  return pdfjs;
}

async function extractPdf(file) {
  const pdfjs = await loadPdfjs();
  const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const pages = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const content = await (await pdf.getPage(i)).getTextContent();
    const text = content.items.map((item) => item.str + (item.hasEOL ? '\n' : ' ')).join('').trim();
    pages.push({ page: i, text });
  }
  return { pages, pdf };
}

async function extractDocx(file) {
  const { default: mammoth } = await import('mammoth');
  return (await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })).value;
}

// Non-PDF text has no pages, so split it into ~3000 character sections on
// paragraph boundaries and number those instead.
export function splitIntoPages(text, size = 3000) {
  const paragraphs = text.split(/\n\s*\n/);
  const pages = [];
  let current = '';
  for (const p of paragraphs) {
    if (current && current.length + p.length > size) {
      pages.push(current.trim());
      current = '';
    }
    current += p + '\n\n';
  }
  if (current.trim()) pages.push(current.trim());
  return pages.map((t, i) => ({ page: i + 1, text: t }));
}

// Renders one PDF page to a JPEG for vision-capable models, so diagrams,
// equations and code screenshots on slides aren't lost.
export async function renderPageImage(pdf, pageNumber, maxWidth = 1100) {
  const page = await pdf.getPage(pageNumber);
  const base = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: Math.min(2, maxWidth / base.width) });
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  await page.render({ canvas, canvasContext: canvas.getContext('2d'), viewport }).promise;
  return { mime: 'image/jpeg', data: canvas.toDataURL('image/jpeg', 0.7).split(',')[1] };
}
