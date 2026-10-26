// Per-browser preferences. API keys live here and never in the database.
// Storage can be unavailable (private mode, blocked site data), so every
// access is guarded and falls back to defaults.

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
  getProvider: () => get('cl_provider', 'gemini'),
  setProvider: (v) => set('cl_provider', v),
  getKey: (provider) => get(`cl_key_${provider}`, provider === 'anthropic' ? get('sf_anthropic_key') : ''),
  setKey: (provider, v) => set(`cl_key_${provider}`, v.trim()),
  getModel: (provider) => get(`cl_model_${provider}`),
  setModel: (provider, v) => set(`cl_model_${provider}`, v),
  // The models a key can use, as listed by "Save & test" in Settings.
  getModels: (provider) => {
    try {
      return JSON.parse(get(`cl_models_${provider}`, '[]'));
    } catch {
      return [];
    }
  },
  setModels: (provider, list) => set(`cl_models_${provider}`, JSON.stringify(list)),
  isGuest: () => get('sf_guest') === '1',
  setGuest: (on) => set('sf_guest', on ? '1' : ''),
};
