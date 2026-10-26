// Per-browser preferences. Storage can be unavailable (private mode, blocked
// site data), so every access is guarded and falls back to defaults.
import { DEFAULT_MODEL } from '../config.js';

function get(key, fallback = '') {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

function set(key, value) {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

export const prefs = {
  getApiKey: () => get('sf_anthropic_key'),
  setApiKey: (v) => set('sf_anthropic_key', v.trim()),
  getModel: () => get('sf_model', DEFAULT_MODEL),
  setModel: (v) => set('sf_model', v),
  isGuest: () => get('sf_guest') === '1',
  setGuest: (on) => set('sf_guest', on ? '1' : ''),
};
