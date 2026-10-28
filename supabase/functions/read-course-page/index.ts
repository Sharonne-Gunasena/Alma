// Supabase Edge Function: fetches a university course page and returns its text,
// so the app can find the course's modules. Browsers can't fetch other websites
// directly, which is why this runs server-side.
//
// Only pages on domains listed in the `universities` table are fetched, so this
// can't be used as a general-purpose proxy.
//
// Deploy: npx supabase functions deploy read-course-page --project-ref <ref>
import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const MAX_BYTES = 3_000_000;
const MAX_TEXT = 200_000;
const TIMEOUT_MS = 12_000;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

// Turns HTML into readable text, keeping line breaks where blocks and table cells end
// so "code   name" pairs stay on one line.
function htmlToText(html: string): { title: string; text: string } {
  const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '').trim();
  const text = html
    .replace(/<(script|style|noscript|svg|head)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\/(p|div|li|tr|h[1-6]|section|article|dd|dt|ul|ol|table|thead|tbody)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/t[dh]>/gi, '  ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&rsquo;|&lsquo;/g, "'")
    .replace(/&ndash;|&mdash;/g, '-')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return { title, text: text.slice(0, MAX_TEXT) };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);

  let url: URL;
  try {
    const body = await req.json();
    url = new URL(String(body.url ?? ''));
  } catch {
    return json({ error: 'Send a valid course page link.' }, 400);
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return json({ error: 'Only web links are supported.' }, 400);

  // Allow only known university websites.
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!);
  const { data: universities, error } = await supabase.from('universities').select('id, domains');
  if (error) return json({ error: 'Could not load the list of universities.' }, 500);
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  const university = universities?.find((u: { domains: string[] }) => u.domains.some((d) => host === d || host.endsWith(`.${d}`)));
  if (!university) return json({ error: "That link isn't on a supported university website." }, 400);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'User-Agent': 'CampusLoopBot/1.0 (student study planner; reads public course pages)', Accept: 'text/html,text/plain' },
    });
    if (!res.ok) return json({ error: `The university website returned an error (${res.status}).` }, 502);
    const type = res.headers.get('content-type') ?? '';
    if (!/text\/html|text\/plain/.test(type)) return json({ error: 'That link is not a web page.' }, 415);
    // Redirects must stay on the university's own domains.
    const finalHost = new URL(res.url).hostname.toLowerCase().replace(/^www\./, '');
    if (!university.domains.some((d: string) => finalHost === d || finalHost.endsWith(`.${d}`)))
      return json({ error: 'That page redirected away from the university website.' }, 400);

    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.byteLength > MAX_BYTES) return json({ error: 'That page is too large to read.' }, 413);
    const html = new TextDecoder().decode(buf);
    return json({ university_id: university.id, url: res.url, ...(type.includes('html') ? htmlToText(html) : { title: '', text: html.slice(0, MAX_TEXT) }) });
  } catch (err) {
    const timedOut = err instanceof DOMException && err.name === 'AbortError';
    return json({ error: timedOut ? 'The university website took too long to respond.' : 'Could not reach the university website.' }, 502);
  } finally {
    clearTimeout(timer);
  }
});
