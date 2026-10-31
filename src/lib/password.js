// Rates a new password so sign-up can guide people toward a safer one.
// Supabase still hashes and stores it; this only checks it before it's sent.

export const MIN_PASSWORD = 8;

// A few of the most common leaked passwords; length alone doesn't catch these.
const COMMON = new Set([
  'password', 'password1', 'password123', '12345678', '123456789', '1234567890', 'qwerty123', 'qwertyuiop',
  'iloveyou', 'abc12345', 'letmein1', 'welcome1', 'football', 'baseball', 'sunshine', 'princess', 'admin123', '11111111',
]);

// 0 = too weak (can't be used), 1 = weak, 2 = okay, 3 = strong.
export function passwordStrength(password, email = '') {
  const p = password ?? '';
  if (p.length < MIN_PASSWORD) return { score: 0, label: `Use at least ${MIN_PASSWORD} characters` };
  const lower = p.toLowerCase();
  const name = email.split('@')[0]?.toLowerCase();
  if (COMMON.has(lower) || /^(.)\1+$/.test(p) || (name && name.length >= 4 && lower.includes(name)))
    return { score: 0, label: 'Too easy to guess' };
  const kinds = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((re) => re.test(p)).length;
  if (p.length >= 14 || (p.length >= 12 && kinds >= 2) || kinds >= 4) return { score: 3, label: 'Strong' };
  if (p.length >= 10 || kinds >= 3) return { score: 2, label: 'Okay' };
  return { score: 1, label: 'Weak: add length or mix in numbers and symbols' };
}
