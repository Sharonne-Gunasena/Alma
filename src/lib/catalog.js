// The shared catalogue: universities, courses and their modules.
// Catalogue data is public, so it's read straight from Supabase even in guest
// mode; only signed-in users can add to it.
import { supabase } from '../supabase.js';
import { MODULE_COLORS } from './data.js';

// Mirrors the seed in supabase/migrations/003_shared_catalogue.sql, so onboarding
// still works before that migration has been run.
export const UNIVERSITIES = [
  { id: 'ucd', name: 'University College Dublin', short_name: 'UCD', domains: ['ucd.ie'], code_pattern: '[A-Z]{4}\\d{5}[A-Z]?' },
  { id: 'tcd', name: 'Trinity College Dublin', short_name: 'TCD', domains: ['tcd.ie'], code_pattern: '[A-Z]{3}\\d{5}' },
  { id: 'dcu', name: 'Dublin City University', short_name: 'DCU', domains: ['dcu.ie'], code_pattern: '[A-Z]{2,4}\\d{3}' },
  { id: 'ucc', name: 'University College Cork', short_name: 'UCC', domains: ['ucc.ie'], code_pattern: '[A-Z]{2}\\d{4}' },
  { id: 'galway', name: 'University of Galway', short_name: 'Galway', domains: ['universityofgalway.ie', 'nuigalway.ie'], code_pattern: '[A-Z]{2}\\d{3,4}' },
  { id: 'maynooth', name: 'Maynooth University', short_name: 'MU', domains: ['maynoothuniversity.ie'], code_pattern: '[A-Z]{2}\\d{3}' },
  { id: 'ul', name: 'University of Limerick', short_name: 'UL', domains: ['ul.ie'], code_pattern: '[A-Z]{2}\\d{4}' },
  { id: 'tudublin', name: 'Technological University Dublin', short_name: 'TU Dublin', domains: ['tudublin.ie'], code_pattern: null },
  { id: 'ncirl', name: 'National College of Ireland', short_name: 'NCI', domains: ['ncirl.ie'], code_pattern: null },
  { id: 'rcsi', name: 'RCSI University of Medicine and Health Sciences', short_name: 'RCSI', domains: ['rcsi.com', 'rcsi.ie'], code_pattern: null },
  { id: 'atu', name: 'Atlantic Technological University', short_name: 'ATU', domains: ['atu.ie'], code_pattern: null },
  { id: 'mtu', name: 'Munster Technological University', short_name: 'MTU', domains: ['mtu.ie'], code_pattern: null },
  { id: 'setu', name: 'South East Technological University', short_name: 'SETU', domains: ['setu.ie'], code_pattern: null },
  { id: 'tus', name: 'Technological University of the Shannon', short_name: 'TUS', domains: ['tus.ie'], code_pattern: null },
  { id: 'dkit', name: 'Dundalk Institute of Technology', short_name: 'DkIT', domains: ['dkit.ie'], code_pattern: null },
  { id: 'iadt', name: 'IADT Dún Laoghaire', short_name: 'IADT', domains: ['iadt.ie'], code_pattern: null },
  { id: 'other', name: 'Other university or college', short_name: 'Other', domains: [], code_pattern: null },
];

// Fallback for universities without a known format: 2–5 capitals, then 3–6 digits.
export const GENERIC_CODE = '[A-Z]{2,5} ?\\d{3,6}[A-Z]?';

export const normalizeCode = (code) => code.replace(/\s+/g, '').toUpperCase();

function codeRegex(university) {
  return new RegExp(`(?<![A-Za-z0-9])(${university?.code_pattern || GENERIC_CODE})(?![A-Za-z0-9])`, 'g');
}

// Strips separators and credit/semester noise from the text around a code.
function cleanName(raw) {
  return raw
    .replace(/^[\s:\-–—|·•,.()]+/, '')
    .replace(/\(?\b\d+(\.\d+)?\s*(ects|credits?)\b\)?/gi, '')
    .replace(/\b(semester|trimester|sem|core|option(al)?|elective|stage|level)\s*\d*\b.*$/i, '')
    .replace(/[\s:\-–—|·•,]+$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// Finds module codes and names in text (a course page, a module list, a timetable).
// A name is whatever follows the code on its line, or the next line if that's empty.
export function extractModules(text, university) {
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  const found = new Map();
  const re = codeRegex(university);

  lines.forEach((line, i) => {
    for (const m of line.matchAll(re)) {
      const code = normalizeCode(m[1]);
      // Skip things that look like years or room numbers rather than modules.
      if (/^[A-Z]{2,5}(19|20)\d{2}$/.test(code) && !university?.code_pattern) continue;
      let name = cleanName(line.slice(m.index + m[0].length));
      // A further code on the same line belongs to another module.
      name = name.split(codeRegex(university))[0].trim();
      if (name.length < 3 && lines[i + 1] && !codeRegex(university).test(lines[i + 1])) name = cleanName(lines[i + 1]);
      if (name.length > 90) name = name.slice(0, 90).replace(/\s+\S*$/, '') + '…';
      const existing = found.get(code);
      if (!existing || (name && (!existing.name || existing.name.length < 3))) found.set(code, { code, name });
    }
  });

  return [...found.values()].map((m) => ({ ...m, name: m.name && m.name.length >= 3 ? m.name : m.code }));
}

// ---------- Reading the shared catalogue ----------

export async function listUniversities() {
  const { data, error } = await supabase.from('universities').select('*').order('sort');
  if (error || !data?.length) return UNIVERSITIES;
  return data;
}

export async function listCourses(universityId) {
  const { data, error } = await supabase.from('courses').select('id, name, page_url').eq('university_id', universityId).order('name');
  return error ? [] : data;
}

export async function suggestModules(courseId, year) {
  if (!courseId) return [];
  const { data, error } = await supabase.rpc('suggest_course_modules', { p_course: courseId, p_year: year ?? null });
  return error ? [] : data;
}

// ---------- Adding to it (signed-in users only) ----------

export async function findOrCreateCourse(universityId, name, pageUrl) {
  const clean = name.trim();
  const { data: existing } = await supabase.from('courses').select('id, name, page_url').eq('university_id', universityId).ilike('name', clean).maybeSingle();
  if (existing) return existing;
  const { data, error } = await supabase.from('courses').insert({ university_id: universityId, name: clean, page_url: pageUrl || null }).select('id, name, page_url').single();
  if (error) throw new Error(error.message);
  return data;
}

// Makes sure each module exists in the catalogue and returns catalogue rows by code.
export async function ensureCatalogModules(universityId, modules) {
  if (!modules.length) return new Map();
  const rows = modules.map((m) => ({ university_id: universityId, code: normalizeCode(m.code), name: m.name || m.code }));
  await supabase.from('catalog_modules').upsert(rows, { onConflict: 'university_id,code', ignoreDuplicates: true });
  const { data, error } = await supabase
    .from('catalog_modules')
    .select('id, code, name')
    .eq('university_id', universityId)
    .in(
      'code',
      rows.map((r) => r.code),
    );
  if (error) throw new Error(error.message);
  return new Map(data.map((m) => [m.code, m]));
}

// Records which modules this student takes, so classmates get them suggested.
export async function reportCourseModules({ courseId, year, catalogIds, source }) {
  if (!courseId || !year || !catalogIds.length) return;
  await supabase.from('course_module_reports').upsert(
    catalogIds.map((module_id) => ({ course_id: courseId, year, module_id, source })),
    { onConflict: 'user_id,course_id,year,module_id', ignoreDuplicates: true },
  );
}

// Shares a student's modules with the catalogue and their course, quietly
// skipping when signed out or before the catalogue migration has been run.
export async function contributeModules(db, profile, modules, source) {
  if (db.kind !== 'cloud' || !profile?.university_id || !modules.length) return null;
  try {
    const catalog = await ensureCatalogModules(profile.university_id, modules);
    for (const m of modules) {
      const entry = catalog.get(normalizeCode(m.code));
      if (entry && m.id && !m.catalog_module_id) await db.update('modules', m.id, { catalog_module_id: entry.id });
    }
    await reportCourseModules({ courseId: profile.course_id, year: profile.year, catalogIds: [...catalog.values()].map((c) => c.id), source });
    return catalog;
  } catch {
    return null;
  }
}

// Adds chosen modules to the student's own module list, skipping codes they already have.
export async function addModulesToProfile(db, chosen, existing) {
  const have = new Set(existing.filter((m) => m.code).map((m) => normalizeCode(m.code)));
  const rows = chosen
    .filter((m) => !have.has(normalizeCode(m.code)))
    .map((m, i) => ({ code: normalizeCode(m.code), name: m.name || m.code, color: MODULE_COLORS[(existing.length + i) % MODULE_COLORS.length] }));
  return rows.length ? db.insert('modules', rows) : [];
}

// ---------- Reading a course page on the university website ----------

// The browser can't fetch other websites directly, so a Supabase Edge Function
// fetches the page (only from known university domains) and returns its text.
export async function readCoursePage(url) {
  const { data, error } = await supabase.functions.invoke('read-course-page', { body: { url } });
  if (error) {
    let detail = '';
    try {
      detail = (await error.context?.json())?.error ?? '';
    } catch {
      /* no body */
    }
    if (/not found|404|Failed to send/i.test(`${error.message} ${detail}`) && !detail)
      throw new Error("The course page reader isn't set up yet. It needs deploying to Supabase once (see the README).");
    throw new Error(detail || error.message);
  }
  return data;
}

export function universityForUrl(url, universities) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    return universities.find((u) => u.domains.some((d) => host === d || host.endsWith(`.${d}`))) ?? null;
  } catch {
    return null;
  }
}

// A web search scoped to the university's site, to help students find their course page.
export function courseSearchLink(university, courseName) {
  const site = university?.domains?.[0];
  const q = `${site ? `site:${site} ` : ''}${courseName || 'course'} modules`;
  return `https://www.google.com/search?q=${encodeURIComponent(q)}`;
}

// When the code pattern finds little (unusual page layouts), an AI model can read
// the page instead, if the student has added a key.
export async function extractModulesWithAI(ai, text, universityName) {
  const [{ z }, { generateJSON }] = await Promise.all([import('zod'), import('../ai/providers.js')]);
  const schema = z.object({ modules: z.array(z.object({ code: z.string(), name: z.string() })) });
  const result = await generateJSON(ai, {
    system: 'You extract the list of modules (courses/subjects) from a university course web page. Return each module code and its full name. Only include modules actually listed on the page. If a module has no code, leave code empty.',
    parts: [{ text: `University: ${universityName}\n\nPage text:\n${text.slice(0, 30000)}` }],
    schema,
    maxTokens: 4000,
  });
  return result.modules
    .filter((m) => m.name)
    .map((m) => ({ code: m.code ? normalizeCode(m.code) : m.name.slice(0, 12).toUpperCase().replace(/\s+/g, ''), name: m.name.trim() }));
}
