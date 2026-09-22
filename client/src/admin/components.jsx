import { Badge, cx, Input, Segmented } from '../components/ui';
import { ORDER_STATUS, PAYMENT_STATUS } from '../lib/constants';
import { addDays, currencySymbol, today } from '../lib/format';

export function PageHeader({ title, description, actions }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-2xl font-extrabold tracking-tight text-coal-950 sm:text-3xl">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-stone-500">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function StatCard({ label, value, sub, tone, icon: Icon, className }) {
  const tones = {
    danger: 'text-rose-700',
    good: 'text-emerald-700',
    warn: 'text-amber-700',
  };
  return (
    <div className={cx('rounded-2xl bg-white p-4 ring-1 ring-stone-200/80 sm:p-5', className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-stone-500">{label}</p>
        {Icon && <Icon className="size-4 text-stone-400" />}
      </div>
      <p className={cx('mt-2 text-2xl font-semibold tracking-tight sm:text-[1.6rem]', tones[tone] ?? 'text-coal-950')}>{value}</p>
      {sub && <p className="mt-1 text-xs text-stone-500">{sub}</p>}
    </div>
  );
}

export const StatusBadge = ({ status }) => <Badge tone={ORDER_STATUS[status]?.tone}>{ORDER_STATUS[status]?.label ?? status}</Badge>;

export const PaymentBadge = ({ status }) => <Badge tone={PAYMENT_STATUS[status]?.tone}>{PAYMENT_STATUS[status]?.label ?? status}</Badge>;

export function presetRange(preset) {
  const t = today();
  switch (preset) {
    case 'yesterday':
      return { from: addDays(t, -1), to: addDays(t, -1) };
    case '7d':
      return { from: addDays(t, -6), to: t };
    case '30d':
      return { from: addDays(t, -29), to: t };
    case 'month':
      return { from: `${t.slice(0, 8)}01`, to: t };
    case 'last-month': {
      const firstThis = `${t.slice(0, 8)}01`;
      const lastPrev = addDays(firstThis, -1);
      return { from: `${lastPrev.slice(0, 8)}01`, to: lastPrev };
    }
    default:
      return { from: t, to: t };
  }
}

const PRESETS = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: '7d', label: '7 days' },
  { value: 'month', label: 'This month' },
  { value: 'last-month', label: 'Last month' },
];

/** range: { preset, from, to } */
export function DateRangePicker({ value, onChange, presets = PRESETS }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Segmented
        className="max-w-full overflow-x-auto scrollbar-none"
        value={value.preset}
        onChange={(preset) => onChange({ preset, ...presetRange(preset) })}
        options={presets}
      />
      <div className="flex items-center gap-1.5 rounded-2xl bg-white px-2 py-1 ring-1 ring-stone-200">
        <input
          type="date"
          value={value.from}
          max={value.to}
          onChange={(e) => e.target.value && onChange({ preset: 'custom', from: e.target.value, to: value.to })}
          className="h-8 rounded-lg border-0 bg-transparent px-1 text-sm focus:ring-2 focus:ring-ember-500 focus:outline-none"
          aria-label="From"
        />
        <span className="text-stone-400">–</span>
        <input
          type="date"
          value={value.to}
          min={value.from}
          max={today()}
          onChange={(e) => e.target.value && onChange({ preset: 'custom', from: value.from, to: e.target.value })}
          className="h-8 rounded-lg border-0 bg-transparent px-1 text-sm focus:ring-2 focus:ring-ember-500 focus:outline-none"
          aria-label="To"
        />
      </div>
    </div>
  );
}

/** Text input for amounts in major units (₦2,500). Parent converts with toMinor. */
export function MoneyInput(props) {
  return <Input inputMode="decimal" prefix={currencySymbol()} placeholder="0" {...props} />;
}

export function Table({ children, className }) {
  return (
    <div className={cx('overflow-x-auto', className)}>
      <table className="w-full text-left text-sm">{children}</table>
    </div>
  );
}

export function Th({ children, className, align }) {
  return (
    <th className={cx('border-b border-stone-200 px-4 py-3 text-xs font-semibold tracking-wide whitespace-nowrap text-stone-500 uppercase', align === 'right' && 'text-right', className)}>
      {children}
    </th>
  );
}

export function Td({ children, className, align }) {
  return <td className={cx('border-b border-stone-100 px-4 py-3 align-middle', align === 'right' && 'text-right tabular-nums', className)}>{children}</td>;
}

export function Pagination({ page, pageSize, count, onChange }) {
  const pages = Math.max(1, Math.ceil(count / pageSize));
  if (pages <= 1) return null;
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3 text-sm text-stone-500">
      <span>
        Page {page} of {pages} · {count} total
      </span>
      <div className="flex gap-2">
        <button disabled={page <= 1} onClick={() => onChange(page - 1)} className="rounded-lg px-3 py-1.5 ring-1 ring-stone-200 disabled:opacity-40">
          Previous
        </button>
        <button disabled={page >= pages} onClick={() => onChange(page + 1)} className="rounded-lg px-3 py-1.5 ring-1 ring-stone-200 disabled:opacity-40">
          Next
        </button>
      </div>
    </div>
  );
}
