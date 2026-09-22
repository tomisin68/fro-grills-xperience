import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from './api';
import { BRAND_NAME } from './brand';
import { configureLocale } from './format';

const SettingsContext = createContext(null);

function readBootSettings() {
  try {
    const el = document.getElementById('boot-settings');
    return el ? JSON.parse(el.textContent) : null;
  } catch {
    return null;
  }
}

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(() => {
    const boot = readBootSettings();
    if (boot) configureLocale(boot.locale);
    return boot;
  });
  const [error, setError] = useState(null);

  const reload = useCallback(async () => {
    try {
      const next = await api.get('/api/public/settings');
      configureLocale(next.locale);
      setSettings(next);
      setError(null);
    } catch (err) {
      setError(err);
    }
  }, []);

  useEffect(() => {
    // Boot data is good for first paint; refresh so open/closed status stays current.
    reload();
    const t = setInterval(reload, 5 * 60 * 1000);
    return () => clearInterval(t);
  }, [reload]);

  if (!settings) {
    return (
      <div className="grid min-h-dvh place-items-center bg-coal-950 text-stone-300">
        {error ? (
          <div className="px-6 text-center">
            <p className="font-display text-xl font-bold text-white">{BRAND_NAME} is not loading right now</p>
            <p className="mt-2 text-sm">Our ordering system could not be reached. Please try again in a moment.</p>
            <p className="mt-1 text-xs text-stone-500">{error.message}</p>
            <button onClick={reload} className="mt-5 rounded-full bg-ember-500 px-5 py-2.5 text-sm font-semibold text-white">
              Try again
            </button>
          </div>
        ) : (
          <div className="size-8 animate-spin rounded-full border-2 border-ember-500 border-t-transparent" aria-label="Loading" />
        )}
      </div>
    );
  }

  return <SettingsContext.Provider value={{ settings, reload }}>{children}</SettingsContext.Provider>;
}

export const useSettings = () => useContext(SettingsContext);
