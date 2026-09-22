import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useCart } from '../lib/cart';
import { cx } from '../components/ui';

/** The public menu, shared by the menu page, home page and item page. Keeps the cart's prices in sync. */
let cache = null;
export function useMenu() {
  const [state, setState] = useState({ categories: cache, error: null, loading: !cache });
  const { sync } = useCart();
  useEffect(() => {
    let alive = true;
    api
      .get('/api/public/menu')
      .then((data) => {
        cache = data.categories;
        if (!alive) return;
        setState({ categories: data.categories, error: null, loading: false });
        sync(
          data.categories.flatMap((c) => c.items.map((i) => ({ ...i, category_name: c.name }))),
        );
      })
      .catch((error) => alive && setState((s) => ({ ...s, error, loading: false })));
    return () => {
      alive = false;
    };
  }, [sync]);
  return state;
}

export function Logo({ name, className, light = true }) {
  const words = name.trim().split(/\s+/);
  const last = words.length > 1 ? words.pop() : null;
  return (
    <span className={cx('inline-flex items-center gap-2.5', className)}>
      <FlameMark className="size-9 shrink-0" />
      <span className={cx('font-display text-lg leading-none font-extrabold tracking-tight', light ? 'text-white' : 'text-coal-950')}>
        {words.join(' ')} {last && <span className="text-ember-500">{last}</span>}
      </span>
    </span>
  );
}

export function FlameMark({ className }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <rect width="64" height="64" rx="16" fill="#f95d16" />
      <path
        d="M33.5 10c1.6 7.4-3.6 10.9-6.8 15.2-2.6 3.5-3.5 7.3-1.4 11.3-3.9-1.3-6-4.6-6.2-8.2C14.9 33 13 38 13.8 43.2 15.3 52 23 56 32 56c10.2 0 18-6.6 18-16.7 0-9-5.9-13.4-9.3-19.4-.9 3.6-2.6 6-5.2 7.5 2.2-7.2 1.2-13.2-2-17.4z"
        fill="#14110f"
      />
      <path
        d="M32.6 33.5c.7 3.6-1.8 5.4-3.3 7.5-1.6 2.2-1.6 4.8.4 7 1.3 1.4 3.1 2.1 5 2 4.6-.3 7.3-4.3 6.3-8.8-.6-2.6-2.3-4.4-3.8-6.3-.4 1.5-1.2 2.6-2.4 3.2.6-1.9.1-3.6-2.2-4.6z"
        fill="#ffcaa8"
      />
    </svg>
  );
}

export function OpenPill({ status, className }) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold',
        status.isOpen ? 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-400/30' : 'bg-white/10 text-stone-300 ring-1 ring-white/15',
        className,
      )}
    >
      <span className={cx('size-2 rounded-full', status.isOpen ? 'animate-pulse bg-emerald-400' : 'bg-stone-400')} />
      {status.message}
    </span>
  );
}

/** Orders placed on this device, so customers can find their tracking page again. */
export function rememberOrder(number, token) {
  try {
    const list = JSON.parse(localStorage.getItem('fgx-orders') || '[]').filter((o) => o.number !== number);
    list.unshift({ number, token, at: new Date().toISOString() });
    localStorage.setItem('fgx-orders', JSON.stringify(list.slice(0, 5)));
  } catch {
    // Storage unavailable; the confirmation page still shows the tracking link.
  }
}

export function recentOrders() {
  try {
    return JSON.parse(localStorage.getItem('fgx-orders') || '[]');
  } catch {
    return [];
  }
}

const SOCIAL_PATHS = {
  instagram: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="5" fill="none" stroke="currentColor" strokeWidth="2" />
      <circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" strokeWidth="2" />
      <circle cx="17.5" cy="6.5" r="1.2" fill="currentColor" />
    </>
  ),
  facebook: <path d="M14 8h3V4h-3c-2.8 0-4.5 1.8-4.5 4.6V11H7v4h2.5v7h4v-7h3l.5-4h-3.5V9c0-.6.4-1 1-1z" fill="currentColor" />,
  x: <path d="M4 4l16 16M20 4L4 20" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />,
  tiktok: (
    <path
      d="M16 3c.3 2.4 1.9 4.2 4.5 4.5v3.3c-1.7 0-3.2-.5-4.5-1.4v6.1A5.5 5.5 0 1 1 10.5 10v3.4a2.2 2.2 0 1 0 2.2 2.2V3H16z"
      fill="currentColor"
    />
  ),
};

export function SocialLinks({ social, className }) {
  const entries = Object.entries(social || {}).filter(([k, v]) => v && SOCIAL_PATHS[k]);
  if (!entries.length) return null;
  return (
    <div className={cx('flex gap-2', className)}>
      {entries.map(([key, url]) => (
        <a
          key={key}
          href={url}
          target="_blank"
          rel="noreferrer"
          aria-label={key}
          className="grid size-10 place-items-center rounded-full bg-white/5 text-stone-300 ring-1 ring-white/10 transition hover:bg-ember-500 hover:text-white"
        >
          <svg viewBox="0 0 24 24" className="size-[18px]">
            {SOCIAL_PATHS[key]}
          </svg>
        </a>
      ))}
    </div>
  );
}

export const mapsLink = (r) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([r.name, r.address, r.city, r.state].filter(Boolean).join(', '))}`;

export const whatsappLink = (number, text = '') =>
  `https://wa.me/${String(number).replace(/[^\d]/g, '')}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
