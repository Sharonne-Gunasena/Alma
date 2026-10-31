// Appearance: 'system' (follows the device), 'light' or 'dark'. The choice is
// stored per browser; index.html applies it before first paint to avoid a flash.
const KEY = 'cl_theme';
const media = () => window.matchMedia('(prefers-color-scheme: dark)');

export function getTheme() {
  try {
    return localStorage.getItem(KEY) || 'system';
  } catch {
    return 'system';
  }
}

export const isDark = () => document.documentElement.dataset.theme === 'dark';

function apply(choice) {
  const dark = choice === 'dark' || (choice === 'system' && media().matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}

export function setTheme(choice) {
  try {
    if (choice === 'system') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, choice);
  } catch {
    /* storage blocked: the choice lasts for this page only */
  }
  apply(choice);
}

// Keeps "Automatic" in step with the system setting while the app is open.
export function watchSystemTheme() {
  apply(getTheme());
  media().addEventListener('change', () => getTheme() === 'system' && apply('system'));
}
