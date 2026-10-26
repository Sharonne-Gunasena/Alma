// Turns an uploaded file into plain text, entirely in the browser.
// The PDF and Word parsers are large, so they load only when needed.

export const ACCEPTED_TYPES = '.pdf,.docx,.txt,.md,.markdown,.csv';

export async function extractText(file) {
  const name = file.name.toLowerCase();

  if (name.endsWith('.pdf')) return extractPdf(file);
  if (name.endsWith('.docx')) return extractDocx(file);
  if (/\.(txt|md|markdown|csv)$/.test(name) || file.type.startsWith('text/')) return file.text();

  throw new Error('Unsupported file type. Use PDF, Word (.docx), text or Markdown.');
}

async function extractPdf(file) {
  const pdfjs = await import('pdfjs-dist');
  const { default: workerUrl } = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

  const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const pages = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    pages.push(content.items.map((item) => item.str + (item.hasEOL ? '\n' : ' ')).join(''));
  }
  const text = pages.join('\n\n').trim();
  if (!text) throw new Error('No text found in this PDF. It may be a scanned image.');
  return text;
}

async function extractDocx(file) {
  const { default: mammoth } = await import('mammoth');
  const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
  return result.value.trim();
}
