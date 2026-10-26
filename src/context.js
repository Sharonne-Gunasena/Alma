import { createContext, useContext, useEffect, useState } from 'react';

export const AppContext = createContext(null);
export const useApp = () => useContext(AppContext);

// Minimal hash router: "#/decks/123" -> { path: '/decks/123', parts: ['decks', '123'] }.
// Hash routes work on GitHub Pages without server rewrites, and the back button works.
export function useHashRoute() {
  const read = () => {
    const path = window.location.hash.replace(/^#/, '') || '/';
    const [pathname, query = ''] = path.split('?');
    return { path: pathname, parts: pathname.split('/').filter(Boolean), query: new URLSearchParams(query) };
  };
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const onChange = () => {
      setRoute(read());
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

export const go = (path) => {
  window.location.hash = path;
};

// Loads async data and reloads on demand: const [data, reload, error] = useLoad(fn, deps)
export function useLoad(fn, deps) {
  const [state, setState] = useState({ data: null, error: null });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    fn()
      .then((data) => alive && setState({ data, error: null }))
      .catch((e) => alive && setState({ data: null, error: e.message }));
    return () => {
      alive = false;
    };
  }, [...deps, tick]);
  return [state.data, () => setTick((t) => t + 1), state.error];
}
