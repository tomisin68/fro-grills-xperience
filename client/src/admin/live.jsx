import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useEventStream, useLocalStorage } from '../lib/hooks';

const LiveContext = createContext(null);

/** Two short rising tones, generated so no audio file is needed. */
function chime() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [880, 1320].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      osc.type = 'sine';
      const start = ctx.currentTime + i * 0.18;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.25, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.35);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.4);
    });
    setTimeout(() => ctx.close(), 1000);
  } catch {
    // Audio is a nice-to-have.
  }
}

/**
 * One event stream per browser tab, shared by every admin screen.
 * Screens subscribe with useLiveOrders(); the layout shows alerts.
 */
export function LiveProvider({ enabled, children }) {
  const listeners = useRef(new Set());
  const [soundOn, setSoundOn] = useLocalStorage('fgx-sound', true);
  const [lastNew, setLastNew] = useState(null);

  const connected = useEventStream(enabled ? '/api/admin/events' : null, ['order.created', 'order.updated'], (type, order) => {
    for (const fn of listeners.current) fn(type, order);
    if (type === 'order.created' && order.channel === 'online') {
      setLastNew({ ...order, at: Date.now() });
      if (soundOn) chime();
    }
  });

  const subscribe = useCallback((fn) => {
    listeners.current.add(fn);
    return () => listeners.current.delete(fn);
  }, []);

  return (
    <LiveContext.Provider value={{ connected, subscribe, soundOn, setSoundOn, lastNew, testSound: chime }}>
      {children}
    </LiveContext.Provider>
  );
}

export const useLive = () => useContext(LiveContext);

export function useLiveOrders(handler) {
  const { subscribe } = useLive();
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => subscribe((type, order) => ref.current(type, order)), [subscribe]);
}
