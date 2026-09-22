import { db } from '../db/index.js';
import { paystackEnabled } from '../lib/paystack.js';
import { businessDate, localParts, toMinutes } from '../lib/time.js';

const week = (open, close) =>
  [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, closed: false, open, close }));

export const DEFAULT_SETTINGS = {
  restaurant: {
    name: 'Fro Grills Xperience',
    tagline: 'Flame-grilled, smoky and served hot',
    description:
      'Charcoal-grilled chicken, fish, suya and asun, with jollof, fried rice and chilled drinks on the side. Eat in, pick up, or have it delivered hot to your door.',
    phone: '+234 800 000 0000',
    email: 'hello@frogrillsxperience.com',
    whatsapp: '',
    address: '12 Admiralty Way',
    city: 'Lekki',
    state: 'Lagos',
    country: 'NG',
    postalCode: '',
    cuisine: ['Grill', 'Barbecue', 'Nigerian'],
    priceRange: '₦₦',
    logoUrl: '',
    heroImageUrl: '',
    mapEmbedUrl: '',
    social: { instagram: '', facebook: '', x: '', tiktok: '' },
  },
  hours: week('10:00', '22:00'),
  ordering: {
    acceptingOrders: true,
    delivery: true,
    pickup: true,
    dineIn: true,
    autoAccept: false,
    deliveryFee: 150000,
    minOrder: 0,
    taxRate: 0,
    estimatedMinutes: 35,
    deliveryNote: 'We deliver within 8km of the restaurant.',
  },
  payments: {
    cash: true,
    transfer: true,
    online: true,
    bankName: '',
    accountName: '',
    accountNumber: '',
  },
  locale: { currency: 'NGN', locale: 'en-NG', timezone: 'Africa/Lagos' },
  seo: {
    title: '',
    description: '',
    keywords: 'Fro Grills Xperience, grills, suya, asun, grilled chicken, grilled fish, barbecue, food delivery',
  },
};

const isPlainObject = (v) => v && typeof v === 'object' && !Array.isArray(v);

function merge(base, patch) {
  if (!isPlainObject(base) || !isPlainObject(patch)) return patch === undefined ? base : patch;
  const out = { ...base };
  for (const [k, v] of Object.entries(patch)) out[k] = merge(base[k], v);
  return out;
}

let cache = null;

export function getSettings() {
  if (cache) return cache;
  // The settings table also holds internal rows (the session secret); only real sections are read.
  const stored = Object.fromEntries(
    db
      .all('SELECT key, value FROM settings')
      .filter((r) => r.key in DEFAULT_SETTINGS)
      .map((r) => [r.key, JSON.parse(r.value)]),
  );
  cache = merge(DEFAULT_SETTINGS, stored);
  return cache;
}

/** Merges a partial settings object ({ section: { field: value } }) into storage. */
export function updateSettings(patch) {
  const current = getSettings();
  db.tx(() => {
    for (const [section, value] of Object.entries(patch)) {
      if (!(section in DEFAULT_SETTINGS) || value === undefined) continue;
      const next = merge(current[section], value);
      db.run(
        'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
        [section, JSON.stringify(next)],
      );
    }
  });
  cache = null;
  return getSettings();
}

export const timezone = () => getSettings().locale.timezone;
export const today = () => businessDate(timezone());

export function formatMoney(minor) {
  const { currency, locale } = getSettings().locale;
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(minor / 100);
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Whether the restaurant is open right now, plus a human-readable line for the storefront. */
export function openStatus(settings = getSettings(), date = new Date()) {
  const { weekday, minutes } = localParts(settings.locale.timezone, date);
  const hours = settings.hours;
  const byDay = (d) => hours.find((h) => h.day === ((d % 7) + 7) % 7);

  const today = byDay(weekday);
  const yesterday = byDay(weekday - 1);
  let isOpen = false;
  let closesAt = null;

  if (today && !today.closed) {
    const o = toMinutes(today.open);
    const c = toMinutes(today.close);
    if (c > o ? minutes >= o && minutes < c : minutes >= o) {
      isOpen = true;
      closesAt = today.close;
    }
  }
  // Late-night hours that run past midnight belong to the previous day.
  if (!isOpen && yesterday && !yesterday.closed) {
    const o = toMinutes(yesterday.open);
    const c = toMinutes(yesterday.close);
    if (c <= o && minutes < c) {
      isOpen = true;
      closesAt = yesterday.close;
    }
  }

  if (isOpen) return { isOpen, message: `Open now · until ${closesAt}` };

  for (let i = 0; i < 7; i++) {
    const day = byDay(weekday + i);
    if (!day || day.closed) continue;
    if (i === 0 && minutes >= toMinutes(day.open)) continue;
    const when = i === 0 ? 'today' : i === 1 ? 'tomorrow' : DAY_NAMES[day.day];
    return { isOpen, message: `Closed · opens ${when} at ${day.open}` };
  }
  return { isOpen, message: 'Closed' };
}

/** What the storefront is allowed to see. */
export function publicSettings() {
  const s = getSettings();
  const onlineReady = s.payments.online && paystackEnabled();
  return {
    restaurant: s.restaurant,
    hours: s.hours,
    ordering: s.ordering,
    payments: {
      cash: s.payments.cash,
      transfer: s.payments.transfer,
      online: onlineReady,
      bankName: s.payments.transfer ? s.payments.bankName : '',
      accountName: s.payments.transfer ? s.payments.accountName : '',
      accountNumber: s.payments.transfer ? s.payments.accountNumber : '',
    },
    locale: s.locale,
    seo: s.seo,
    status: openStatus(s),
  };
}
