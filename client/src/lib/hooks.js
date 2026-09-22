import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';

/** GETs a URL and re-fetches whenever the URL or params change. Pass a null url to skip. */
export function useApi(url, params) {
  const key = url ? `${url}?${JSON.stringify(params ?? {})}` : null;
  const [state, setState] = useState({ data: null, error: null, loading: Boolean(url) });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!url) return undefined;
    const controller = new AbortController();
    setState((s) => ({ ...s, loading: true, error: null }));
    api
      .get(url, params, { signal: controller.signal })
      .then((data) => setState({ data, error: null, loading: false }))
      .catch((error) => {
        if (error.name !== 'AbortError') setState((s) => ({ ...s, error, loading: false }));
      });
    return () => controller.abort();
    // key captures url + params by value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  const setData = useCallback(
    (next) => setState((s) => ({ ...s, data: typeof next === 'function' ? next(s.data) : next })),
    [],
  );
  return { ...state, reload, setData };
}

/** Subscribes to a Server-Sent Events URL. onEvent(type, data) always sees the latest closure. */
export function useEventStream(url, types, onEvent) {
  const handler = useRef(onEvent);
  handler.current = onEvent;
  const [connected, setConnected] = useState(false);
  const typeKey = types.join(',');
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    if (!url || typeof EventSource === 'undefined') return undefined;
    const source = new EventSource(url);
    source.onopen = () => setConnected(true);
    source.onerror = () => setConnected(false);
    const listeners = typeKey.split(',').map((type) => {
      const fn = (e) => handler.current(type, JSON.parse(e.data));
      source.addEventListener(type, fn);
      return [type, fn];
    });
    // Release the connection when the page is hidden or back-cached (browsers allow
    // only ~6 connections per site), and reconnect if the page is restored.
    const onHide = () => {
      source.close();
      setConnected(false);
    };
    const onShow = (e) => e.persisted && setGeneration((g) => g + 1);
    window.addEventListener('pagehide', onHide);
    window.addEventListener('pageshow', onShow);
    return () => {
      window.removeEventListener('pagehide', onHide);
      window.removeEventListener('pageshow', onShow);
      for (const [type, fn] of listeners) source.removeEventListener(type, fn);
      source.close();
    };
  }, [url, typeKey, generation]);

  return connected;
}

/** Re-renders every `ms` milliseconds, for live timers. */
export function useTick(ms = 30000) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), ms);
    return () => clearInterval(t);
  }, [ms]);
}

export function useLocalStorage(key, initial) {
  const [value, setValue] = useState(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Storage can be unavailable (private mode); the app works without it.
    }
  }, [key, value]);
  return [value, setValue];
}
