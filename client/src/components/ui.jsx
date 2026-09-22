import { LoaderCircle, X } from 'lucide-react';
import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';

export const cx = (...classes) => classes.filter(Boolean).join(' ');

const BUTTON_VARIANTS = {
  primary: 'bg-ember-500 text-white hover:bg-ember-600 shadow-sm shadow-ember-900/20',
  dark: 'bg-coal-900 text-white hover:bg-coal-800',
  secondary: 'bg-white text-coal-900 ring-1 ring-stone-300 hover:bg-stone-50',
  ghost: 'text-coal-800 hover:bg-stone-100',
  danger: 'bg-rose-600 text-white hover:bg-rose-700',
  'danger-ghost': 'text-rose-700 hover:bg-rose-50',
  success: 'bg-emerald-600 text-white hover:bg-emerald-700',
  light: 'bg-white/10 text-white ring-1 ring-white/20 hover:bg-white/15',
};
const BUTTON_SIZES = {
  xs: 'h-7 px-2.5 text-xs gap-1 rounded-lg',
  sm: 'h-9 px-3 text-sm gap-1.5 rounded-xl',
  md: 'h-11 px-4 text-sm gap-2 rounded-xl',
  lg: 'h-13 px-6 text-base gap-2 rounded-2xl',
  icon: 'size-9 rounded-xl',
};

export function Button({ variant = 'primary', size = 'md', loading, disabled, className, children, ...props }) {
  return (
    <button
      disabled={disabled || loading}
      className={cx(
        'inline-flex shrink-0 items-center justify-center font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        BUTTON_VARIANTS[variant],
        BUTTON_SIZES[size],
        className,
      )}
      {...props}
    >
      {loading && <LoaderCircle className="size-4 animate-spin" />}
      {children}
    </button>
  );
}

export function Field({ label, hint, error, children, className, htmlFor }) {
  return (
    <div className={cx('flex flex-col gap-1.5', className)}>
      {label && (
        <label htmlFor={htmlFor} className="text-sm font-medium text-coal-800">
          {label}
        </label>
      )}
      {children}
      {error ? <p className="text-xs text-rose-600">{error}</p> : hint && <p className="text-xs text-stone-500">{hint}</p>}
    </div>
  );
}

const inputBase =
  'w-full rounded-xl border-0 bg-white px-3.5 text-sm text-coal-900 ring-1 ring-stone-300 placeholder:text-stone-400 focus:ring-2 focus:ring-ember-500 focus:outline-none disabled:bg-stone-100';

export function Input({ label, hint, error, className, prefix, ...props }) {
  const id = useId();
  const input = (
    <input
      id={id}
      className={cx(inputBase, 'h-11', prefix && 'pl-9', error && 'ring-rose-400')}
      {...props}
    />
  );
  return (
    <Field label={label} hint={hint} error={error} className={className} htmlFor={id}>
      {prefix ? (
        <div className="relative">
          <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-sm text-stone-500">{prefix}</span>
          {input}
        </div>
      ) : (
        input
      )}
    </Field>
  );
}

export function Textarea({ label, hint, error, className, rows = 3, ...props }) {
  const id = useId();
  return (
    <Field label={label} hint={hint} error={error} className={className} htmlFor={id}>
      <textarea id={id} rows={rows} className={cx(inputBase, 'py-2.5')} {...props} />
    </Field>
  );
}

export function Select({ label, hint, error, className, children, ...props }) {
  const id = useId();
  return (
    <Field label={label} hint={hint} error={error} className={className} htmlFor={id}>
      <select id={id} className={cx(inputBase, 'h-11 pr-8')} {...props}>
        {children}
      </select>
    </Field>
  );
}

export function Switch({ checked, onChange, label, description, disabled }) {
  return (
    <label className={cx('flex items-start justify-between gap-4', disabled ? 'opacity-50' : 'cursor-pointer')}>
      {(label || description) && (
        <span className="flex flex-col">
          {label && <span className="text-sm font-medium text-coal-900">{label}</span>}
          {description && <span className="text-xs text-stone-500">{description}</span>}
        </span>
      )}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cx(
          'relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors',
          checked ? 'bg-ember-500' : 'bg-stone-300',
        )}
      >
        <span
          className={cx(
            'absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition-transform',
            checked && 'translate-x-5',
          )}
        />
      </button>
    </label>
  );
}

const TONES = {
  amber: 'bg-amber-100 text-amber-800 ring-amber-200',
  sky: 'bg-sky-100 text-sky-800 ring-sky-200',
  violet: 'bg-violet-100 text-violet-800 ring-violet-200',
  emerald: 'bg-emerald-100 text-emerald-800 ring-emerald-200',
  indigo: 'bg-indigo-100 text-indigo-800 ring-indigo-200',
  stone: 'bg-stone-100 text-stone-700 ring-stone-200',
  rose: 'bg-rose-100 text-rose-800 ring-rose-200',
  ember: 'bg-ember-100 text-ember-800 ring-ember-200',
  dark: 'bg-coal-900 text-white ring-coal-900',
};

export function Badge({ tone = 'stone', children, className }) {
  return (
    <span className={cx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset whitespace-nowrap', TONES[tone], className)}>
      {children}
    </span>
  );
}

export function Card({ className, children, ...props }) {
  return (
    <div className={cx('rounded-2xl bg-white ring-1 ring-stone-200/80', className)} {...props}>
      {children}
    </div>
  );
}

export function Spinner({ className }) {
  return <LoaderCircle className={cx('size-6 animate-spin text-ember-500', className)} aria-label="Loading" />;
}

export function PageLoader() {
  return (
    <div className="grid min-h-[40vh] place-items-center">
      <Spinner />
    </div>
  );
}

export function ErrorState({ error, onRetry }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl bg-rose-50 px-6 py-10 text-center ring-1 ring-rose-200">
      <p className="font-semibold text-rose-900">Something went wrong</p>
      <p className="text-sm text-rose-800">{error?.message}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, children, action }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
      {Icon && (
        <div className="mb-1 grid size-12 place-items-center rounded-2xl bg-stone-100 text-stone-500">
          <Icon className="size-6" />
        </div>
      )}
      <p className="font-semibold text-coal-900">{title}</p>
      {children && <p className="max-w-sm text-sm text-stone-500">{children}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

function useEscape(onClose, active) {
  const ref = useRef(onClose);
  ref.current = onClose;
  useEffect(() => {
    if (!active) return undefined;
    const onKey = (e) => e.key === 'Escape' && ref.current?.();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [active]);
}

export function Modal({ open, onClose, title, description, children, footer, size = 'md' }) {
  useEscape(onClose, open);
  if (!open) return null;
  const width = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' }[size];
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 animate-fade-in bg-coal-950/60 backdrop-blur-[2px]" onClick={onClose} />
      <div className={cx('relative flex max-h-[92dvh] w-full animate-pop flex-col rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl', width)}>
        <div className="flex items-start justify-between gap-4 border-b border-stone-100 px-5 py-4 sm:px-6">
          <div>
            <h2 className="font-display text-lg font-bold text-coal-950">{title}</h2>
            {description && <p className="mt-0.5 text-sm text-stone-500">{description}</p>}
          </div>
          <button onClick={onClose} className="-mr-2 rounded-lg p-2 text-stone-500 hover:bg-stone-100" aria-label="Close">
            <X className="size-5" />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-5 sm:px-6">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-stone-100 px-5 py-4 sm:px-6">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function Drawer({ open, onClose, title, children, footer, width = 'max-w-md', dark }) {
  useEscape(onClose, open);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true">
      <div className="absolute inset-0 animate-fade-in bg-coal-950/60 backdrop-blur-[2px]" onClick={onClose} />
      <aside className={cx('relative flex h-full w-full animate-slide-in flex-col shadow-2xl', width, dark ? 'bg-coal-950 text-white' : 'bg-white')}>
        <div className={cx('flex items-center justify-between gap-4 border-b px-5 py-4', dark ? 'border-white/10' : 'border-stone-100')}>
          <div className="min-w-0 flex-1">{typeof title === 'string' ? <h2 className="font-display text-lg font-bold">{title}</h2> : title}</div>
          <button onClick={onClose} className={cx('-mr-2 rounded-lg p-2', dark ? 'text-stone-400 hover:bg-white/10' : 'text-stone-500 hover:bg-stone-100')} aria-label="Close">
            <X className="size-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">{children}</div>
        {footer && <div className={cx('border-t px-5 py-4', dark ? 'border-white/10' : 'border-stone-100')}>{footer}</div>}
      </aside>
    </div>,
    document.body,
  );
}

/** Pill-style single choice. options: [{ value, label, icon? }] */
export function Segmented({ value, onChange, options, className, dark }) {
  return (
    <div className={cx('inline-flex rounded-2xl p-1', dark ? 'bg-white/10' : 'bg-stone-100', className)}>
      {options.map((o) => {
        const active = o.value === value;
        const Icon = o.icon;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={cx(
              'inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold whitespace-nowrap transition',
              active
                ? dark
                  ? 'bg-white text-coal-950'
                  : 'bg-white text-coal-950 shadow-sm'
                : dark
                  ? 'text-stone-300 hover:text-white'
                  : 'text-stone-600 hover:text-coal-900',
            )}
          >
            {Icon && <Icon className="size-4" />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function QuantityStepper({ value, onChange, min = 0, max = 50, size = 'md', dark }) {
  const btn = cx(
    'grid place-items-center rounded-full font-bold transition disabled:opacity-40',
    size === 'sm' ? 'size-7 text-sm' : 'size-9 text-lg',
    dark ? 'bg-white/10 text-white hover:bg-white/20' : 'bg-stone-100 text-coal-900 hover:bg-stone-200',
  );
  return (
    <div className="inline-flex items-center gap-2">
      <button type="button" className={btn} onClick={() => onChange(value - 1)} disabled={value <= min} aria-label="Decrease">
        −
      </button>
      <span className={cx('min-w-6 text-center font-semibold tabular-nums', size === 'sm' ? 'text-sm' : 'text-base')}>{value}</span>
      <button type="button" className={btn} onClick={() => onChange(value + 1)} disabled={value >= max} aria-label="Increase">
        +
      </button>
    </div>
  );
}
