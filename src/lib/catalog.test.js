import { describe, expect, it, vi } from 'vitest';

vi.mock('../supabase.js', () => ({ supabase: {} }));
const { extractModules, normalizeCode, universityForUrl, UNIVERSITIES, courseSearchLink } = await import('./catalog.js');

const ucd = UNIVERSITIES.find((u) => u.id === 'ucd');
const ucc = UNIVERSITIES.find((u) => u.id === 'ucc');

describe('extractModules', () => {
  it('reads UCD-style codes and names from a course page', () => {
    const page = `Stage 1 Core Modules
COMP10110 Computer Programming I 5 credits Semester 1
COMP10040 - Introduction to Computer Architecture (5 ECTS)
MATH10200 | Matrix Algebra
Contact: 01 716 7777`;
    expect(extractModules(page, ucd)).toEqual([
      { code: 'COMP10110', name: 'Computer Programming I' },
      { code: 'COMP10040', name: 'Introduction to Computer Architecture' },
      { code: 'MATH10200', name: 'Matrix Algebra' },
    ]);
  });

  it('takes the name from the next line when the code stands alone', () => {
    const page = 'CS1101\nIntroduction to Programming\nCS1105\nDiscrete Mathematics';
    expect(extractModules(page, ucc)).toEqual([
      { code: 'CS1101', name: 'Introduction to Programming' },
      { code: 'CS1105', name: 'Discrete Mathematics' },
    ]);
  });

  it('falls back to a generic pattern and ignores years', () => {
    const page = 'Modules for 2026\nHDCS 101 Web Design\nPROG2023 should be skipped? no: COMP 2023 is a year-like code';
    const found = extractModules(page, { code_pattern: null });
    expect(found[0]).toEqual({ code: 'HDCS101', name: 'Web Design' });
    expect(found.some((m) => m.code === 'COMP2023')).toBe(false);
  });

  it('splits two modules on one line and keeps the first good name', () => {
    const page = 'COMP10110 Programming I COMP10300 Functional Programming\nCOMP10110';
    expect(extractModules(page, ucd)).toEqual([
      { code: 'COMP10110', name: 'Programming I' },
      { code: 'COMP10300', name: 'Functional Programming' },
    ]);
  });
});

describe('helpers', () => {
  it('normalises codes', () => {
    expect(normalizeCode(' comp 10110 ')).toBe('COMP10110');
  });

  it('matches course pages to universities by domain', () => {
    expect(universityForUrl('https://hub.ucd.ie/some/course', UNIVERSITIES)?.id).toBe('ucd');
    expect(universityForUrl('https://www.universityofgalway.ie/courses/x', UNIVERSITIES)?.id).toBe('galway');
    expect(universityForUrl('https://evil-ucd.ie.example.com/', UNIVERSITIES)).toBeNull();
  });

  it('builds a site-scoped search link', () => {
    expect(courseSearchLink(ucd, 'Computer Science')).toContain(encodeURIComponent('site:ucd.ie Computer Science modules'));
  });
});
