// Money arrives from the API as integer minor units (kobo for NGN).
let locale = 'en-NG';
let timeZone = 'Africa/Lagos';
let moneyFmt = makeMoney('NGN');

function makeMoney(currency) {
  return new Intl.NumberFormat(locale, { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

export function configureLocale(settings) {
  if (!settings) return;
  locale = settings.locale || locale;
  timeZone = settings.timezone || timeZone;
  moneyFmt = makeMoney(settings.currency || 'NGN');
}

export const money = (minor) => moneyFmt.format((minor ?? 0) / 100);

/** Compact form for chart axes: ₦1.2M */
export const moneyShort = (minor) =>
  new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: moneyFmt.resolvedOptions().currency,
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format((minor ?? 0) / 100);

export const currencySymbol = () =>
  moneyFmt.formatToParts(0).find((p) => p.type === 'currency')?.value ?? '';

/** Parses what a person typed ("2,500", "2500.50") into minor units. */
export function toMinor(value) {
  const n = Number(String(value ?? '').replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

export const toMajor = (minor) => (minor ? String(minor / 100) : '');

export const number = (n, digits = 0) =>
  new Intl.NumberFormat(locale, { maximumFractionDigits: digits }).format(n ?? 0);

export const dateTime = (iso) =>
  iso ? new Date(iso).toLocaleString(locale, { timeZone, day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '';

export const time = (iso) => (iso ? new Date(iso).toLocaleTimeString(locale, { timeZone, hour: 'numeric', minute: '2-digit' }) : '');

/** YYYY-MM-DD to "Mon 21 Sep". */
export const dayLabel = (ymd, opts = { weekday: 'short', day: 'numeric', month: 'short' }) =>
  new Date(`${ymd}T12:00:00Z`).toLocaleDateString(locale, { ...opts, timeZone: 'UTC' });

export function timeAgo(iso) {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ${mins % 60}m ago`;
  return dateTime(iso);
}

export const minutesSince = (iso) => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));

/** Today's date in the restaurant's timezone, as YYYY-MM-DD. */
export const today = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

export function addDays(ymd, n) {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export const pct = (n) => `${number(n, 1)}%`;
