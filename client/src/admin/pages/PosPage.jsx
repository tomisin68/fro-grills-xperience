import { Bike, CircleAlert, CircleCheck, Printer, Search, ShoppingBag, Store, Trash2, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { FoodImage } from '../../components/FoodImage';
import { Button, cx, ErrorState, Input, Modal, PageLoader, QuantityStepper, Segmented } from '../../components/ui';
import { api } from '../../lib/api';
import { money, toMinor } from '../../lib/format';
import { useApi } from '../../lib/hooks';
import { useSettings } from '../../lib/settings';
import { useToast } from '../../lib/toast';
import { useAuth } from '../auth';
import { MoneyInput } from '../components';

const TYPES = [
  { value: 'dine_in', label: 'Dine-in', icon: Store },
  { value: 'pickup', label: 'Takeaway', icon: ShoppingBag },
  { value: 'delivery', label: 'Delivery', icon: Bike },
];
const METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'card', label: 'Card / POS' },
  { value: 'transfer', label: 'Transfer' },
];

function quickCash(total) {
  const naira = total / 100;
  const steps = [500, 1000, 5000, 10000];
  const options = new Set([naira]);
  for (const s of steps) options.add(Math.ceil(naira / s) * s);
  return [...options].filter((n) => n >= naira).sort((a, b) => a - b).slice(0, 4);
}

function ChargeModal({ open, onClose, total, onSubmit, busy }) {
  const { shift } = useAuth();
  const [method, setMethod] = useState('cash');
  const [tendered, setTendered] = useState('');
  const [reference, setReference] = useState('');
  const given = toMinor(tendered);
  const change = given - total;
  const cashBlocked = method === 'cash' && !shift;
  const cashShort = method === 'cash' && given > 0 && given < total;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Take payment"
      footer={
        <>
          <Button variant="secondary" onClick={() => onSubmit({ payLater: true, method })} loading={busy === 'later'} disabled={Boolean(busy)}>
            Pay later (open tab)
          </Button>
          <Button
            variant="success"
            size="lg"
            onClick={() => onSubmit({ method, reference })}
            loading={busy === 'pay'}
            disabled={Boolean(busy) || cashBlocked || cashShort}
          >
            Paid {money(total)}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="rounded-2xl bg-coal-950 p-5 text-center text-white">
          <p className="text-sm text-stone-400">Amount due</p>
          <p className="font-display text-4xl font-extrabold tabular-nums">{money(total)}</p>
        </div>
        <Segmented value={method} onChange={setMethod} options={METHODS} className="w-full" />
        {cashBlocked && (
          <p className="flex gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200">
            <CircleAlert className="mt-0.5 size-4 shrink-0" />
            <span>
              Open your cash shift first so this cash is counted in your drawer.{' '}
              <Link to="/admin/shifts" className="font-semibold underline">
                Open shift
              </Link>
            </span>
          </p>
        )}
        {method === 'cash' && !cashBlocked && (
          <>
            <div className="flex flex-wrap gap-2">
              {quickCash(total).map((n) => (
                <button key={n} onClick={() => setTendered(String(n))} className="rounded-xl bg-stone-100 px-3 py-2 text-sm font-semibold hover:bg-stone-200">
                  {money(n * 100)}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 items-end gap-3">
              <MoneyInput label="Cash received" value={tendered} onChange={(e) => setTendered(e.target.value)} autoFocus />
              <div className={cx('rounded-xl px-4 py-2', cashShort ? 'bg-rose-50 text-rose-800' : 'bg-emerald-50 text-emerald-800')}>
                <p className="text-xs">{cashShort ? 'Still short by' : 'Change'}</p>
                <p className="font-display text-xl font-bold tabular-nums">{money(given ? Math.abs(change) : 0)}</p>
              </div>
            </div>
          </>
        )}
        {method !== 'cash' && (
          <Input
            label="Reference (optional)"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder={method === 'card' ? 'Terminal receipt number' : 'Sender name / reference'}
          />
        )}
      </div>
    </Modal>
  );
}

export default function PosPage() {
  const { settings } = useSettings();
  const { can } = useAuth();
  const toast = useToast();
  const { data, error, loading, reload } = useApi('/api/public/menu');
  const [category, setCategory] = useState('all');
  const [q, setQ] = useState('');
  const [lines, setLines] = useState([]);
  const [type, setType] = useState('dine_in');
  const [details, setDetails] = useState({ table: '', name: '', phone: '', address: '', notes: '' });
  const [discount, setDiscount] = useState('');
  const [discountReason, setDiscountReason] = useState('');
  const [charging, setCharging] = useState(false);
  const [busy, setBusy] = useState(null);
  const [done, setDone] = useState(null);
  const [ticketOpen, setTicketOpen] = useState(false);

  const categories = data?.categories ?? [];
  const items = useMemo(() => {
    const all = categories.flatMap((c) => c.items.map((i) => ({ ...i, category_name: c.name, category_id: c.id })));
    const s = q.trim().toLowerCase();
    return all.filter((i) => (category === 'all' || i.category_id === category) && (!s || i.name.toLowerCase().includes(s)));
  }, [categories, category, q]);

  const subtotal = lines.reduce((s, l) => s + l.price * l.quantity, 0);
  const discountMinor = Math.min(toMinor(discount), subtotal);
  const deliveryFee = type === 'delivery' ? settings.ordering.deliveryFee : 0;
  const tax = Math.round(((subtotal - discountMinor) * (settings.ordering.taxRate || 0)) / 100);
  const total = subtotal - discountMinor + deliveryFee + tax;
  const count = lines.reduce((s, l) => s + l.quantity, 0);

  const add = (item) =>
    setLines((prev) => {
      const found = prev.find((l) => l.menuItemId === item.id && !l.notes);
      if (found) return prev.map((l) => (l === found ? { ...l, quantity: l.quantity + 1 } : l));
      return [...prev, { key: `${item.id}-${Date.now()}`, menuItemId: item.id, name: item.name, price: item.price, quantity: 1, notes: '' }];
    });
  const setQty = (key, quantity) => setLines((prev) => (quantity <= 0 ? prev.filter((l) => l.key !== key) : prev.map((l) => (l.key === key ? { ...l, quantity } : l))));
  const setNote = (key, notes) => setLines((prev) => prev.map((l) => (l.key === key ? { ...l, notes } : l)));

  function reset() {
    setLines([]);
    setDetails({ table: '', name: '', phone: '', address: '', notes: '' });
    setDiscount('');
    setDiscountReason('');
    setType('dine_in');
  }

  async function submit({ payLater, method, reference }) {
    if (type === 'delivery' && !details.address.trim()) {
      toast.error('Add the delivery address first');
      setCharging(false);
      return;
    }
    setBusy(payLater ? 'later' : 'pay');
    try {
      const { order } = await api.post('/api/admin/orders', {
        type,
        customer: { name: details.name.trim(), phone: details.phone.trim() },
        tableNumber: details.table.trim(),
        deliveryAddress: details.address.trim(),
        notes: details.notes.trim(),
        items: lines.map((l) => ({ menuItemId: l.menuItemId, quantity: l.quantity, notes: l.notes.trim() })),
        paymentMethod: method,
        discount: discountMinor,
        discountReason: discountReason.trim(),
        payment: payLater ? undefined : { method, reference },
      });
      setDone(order);
      setCharging(false);
      setTicketOpen(false);
      reset();
      reload();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(null);
    }
  }

  const ticket = (
    <div className="flex h-full flex-col">
      <div className="space-y-3 border-b border-stone-100 p-4">
        <Segmented value={type} onChange={setType} options={TYPES} className="w-full" />
        <div className="grid grid-cols-2 gap-2">
          {type === 'dine_in' && (
            <input value={details.table} onChange={(e) => setDetails({ ...details, table: e.target.value })} placeholder="Table no." className="h-10 rounded-xl px-3 text-sm ring-1 ring-stone-200 focus:ring-2 focus:ring-ember-500 focus:outline-none" />
          )}
          <input value={details.name} onChange={(e) => setDetails({ ...details, name: e.target.value })} placeholder="Customer name" className="h-10 rounded-xl px-3 text-sm ring-1 ring-stone-200 focus:ring-2 focus:ring-ember-500 focus:outline-none" />
          {type !== 'dine_in' && (
            <input value={details.phone} onChange={(e) => setDetails({ ...details, phone: e.target.value })} placeholder="Phone" className="h-10 rounded-xl px-3 text-sm ring-1 ring-stone-200 focus:ring-2 focus:ring-ember-500 focus:outline-none" />
          )}
          {type === 'delivery' && (
            <input value={details.address} onChange={(e) => setDetails({ ...details, address: e.target.value })} placeholder="Delivery address" className="col-span-2 h-10 rounded-xl px-3 text-sm ring-1 ring-stone-200 focus:ring-2 focus:ring-ember-500 focus:outline-none" />
          )}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {lines.length === 0 ? (
          <p className="px-6 py-12 text-center text-sm text-stone-500">Tap dishes on the left to start a ticket.</p>
        ) : (
          <ul className="divide-y divide-stone-100">
            {lines.map((l) => (
              <li key={l.key} className="px-4 py-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm leading-snug font-semibold">{l.name}</p>
                  <p className="text-sm font-semibold tabular-nums">{money(l.price * l.quantity)}</p>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <QuantityStepper size="sm" value={l.quantity} onChange={(n) => setQty(l.key, n)} />
                  <input
                    value={l.notes}
                    onChange={(e) => setNote(l.key, e.target.value)}
                    placeholder="Note"
                    className="h-8 min-w-0 flex-1 rounded-lg bg-stone-50 px-2.5 text-xs ring-1 ring-stone-200 focus:ring-2 focus:ring-ember-500 focus:outline-none"
                  />
                  <button onClick={() => setQty(l.key, 0)} className="rounded-lg p-1.5 text-stone-400 hover:bg-rose-50 hover:text-rose-600" aria-label="Remove">
                    <Trash2 className="size-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="space-y-2 border-t border-stone-200 bg-stone-50 p-4">
        <input
          value={details.notes}
          onChange={(e) => setDetails({ ...details, notes: e.target.value })}
          placeholder="Order note for the kitchen"
          className="h-9 w-full rounded-lg bg-white px-3 text-sm ring-1 ring-stone-200 focus:ring-2 focus:ring-ember-500 focus:outline-none"
        />
        {can('orders.discount') && lines.length > 0 && (
          <div className="grid grid-cols-[110px_1fr] gap-2">
            <input value={discount} onChange={(e) => setDiscount(e.target.value)} inputMode="decimal" placeholder="Discount" className="h-9 rounded-lg bg-white px-3 text-sm ring-1 ring-stone-200 focus:ring-2 focus:ring-ember-500 focus:outline-none" />
            <input value={discountReason} onChange={(e) => setDiscountReason(e.target.value)} placeholder="Reason for discount" className="h-9 rounded-lg bg-white px-3 text-sm ring-1 ring-stone-200 focus:ring-2 focus:ring-ember-500 focus:outline-none" />
          </div>
        )}
        <dl className="space-y-1 pt-1 text-sm">
          <div className="flex justify-between">
            <dt className="text-stone-600">Subtotal ({count})</dt>
            <dd className="tabular-nums">{money(subtotal)}</dd>
          </div>
          {discountMinor > 0 && (
            <div className="flex justify-between text-emerald-700">
              <dt>Discount</dt>
              <dd className="tabular-nums">−{money(discountMinor)}</dd>
            </div>
          )}
          {deliveryFee > 0 && (
            <div className="flex justify-between">
              <dt className="text-stone-600">Delivery</dt>
              <dd className="tabular-nums">{money(deliveryFee)}</dd>
            </div>
          )}
          {tax > 0 && (
            <div className="flex justify-between">
              <dt className="text-stone-600">Tax</dt>
              <dd className="tabular-nums">{money(tax)}</dd>
            </div>
          )}
        </dl>
        <div className="flex gap-2 pt-1">
          <Button variant="secondary" onClick={reset} disabled={!lines.length} aria-label="Clear ticket">
            <X className="size-4" />
          </Button>
          <Button
            size="lg"
            className="flex-1"
            disabled={!lines.length || (discountMinor > 0 && discountReason.trim().length < 2)}
            onClick={() => setCharging(true)}
          >
            Charge {money(total)}
          </Button>
        </div>
      </div>
    </div>
  );

  if (loading && !data) return <PageLoader />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  return (
    <div className="-mx-4 -my-6 grid min-h-[calc(100dvh-3.5rem)] sm:-mx-6 lg:-mx-8 lg:grid-cols-[1fr_380px]">
      <section className="min-w-0 p-4 sm:p-6">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-48 flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-stone-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Find a dish"
              className="h-11 w-full rounded-xl border-0 bg-white pr-3 pl-9 text-sm ring-1 ring-stone-200 focus:ring-2 focus:ring-ember-500 focus:outline-none"
            />
          </div>
        </div>
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1 scrollbar-none">
          {[{ id: 'all', name: 'All' }, ...categories].map((c) => (
            <button
              key={c.id}
              onClick={() => setCategory(c.id)}
              className={cx('shrink-0 rounded-full px-4 py-2 text-sm font-semibold', category === c.id ? 'bg-coal-950 text-white' : 'bg-white text-stone-600 ring-1 ring-stone-200')}
            >
              {c.name}
            </button>
          ))}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 pb-24 sm:grid-cols-3 xl:grid-cols-4 lg:pb-0">
          {items.map((item) => {
            const inTicket = lines.filter((l) => l.menuItemId === item.id).reduce((s, l) => s + l.quantity, 0);
            return (
              <button
                key={item.id}
                disabled={item.sold_out}
                onClick={() => add(item)}
                className={cx(
                  'group relative flex flex-col overflow-hidden rounded-2xl bg-white text-left ring-1 transition active:scale-[0.98] disabled:opacity-50',
                  inTicket ? 'ring-2 ring-ember-500' : 'ring-stone-200 hover:ring-stone-300',
                )}
              >
                <div className="aspect-[16/10]">
                  <FoodImage src={item.image_url} name={item.name} category={item.category_name} rounded="rounded-none" />
                </div>
                <div className="flex flex-1 flex-col p-3">
                  <p className="line-clamp-2 text-sm leading-snug font-semibold">{item.name}</p>
                  <p className="mt-auto pt-1 text-sm font-bold text-ember-700">{item.sold_out ? 'Sold out' : money(item.price)}</p>
                </div>
                {inTicket > 0 && (
                  <span className="absolute top-2 right-2 grid size-7 place-items-center rounded-full bg-ember-500 text-sm font-bold text-white shadow">{inTicket}</span>
                )}
              </button>
            );
          })}
        </div>
      </section>

      <aside className="sticky top-14 hidden h-[calc(100dvh-3.5rem)] border-l border-stone-200 bg-white lg:block">{ticket}</aside>

      {!ticketOpen && lines.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-20 p-3 lg:hidden">
          <Button size="lg" className="w-full justify-between" onClick={() => setTicketOpen(true)}>
            <span>Ticket · {count} items</span>
            <span>{money(total)}</span>
          </Button>
        </div>
      )}
      {ticketOpen && (
        <div className="fixed inset-0 z-40 flex flex-col bg-white lg:hidden">
          <div className="flex items-center justify-between border-b border-stone-100 px-4 py-3">
            <p className="font-display text-lg font-bold">Ticket</p>
            <button onClick={() => setTicketOpen(false)} className="rounded-lg p-2 text-stone-500" aria-label="Close ticket">
              <X className="size-5" />
            </button>
          </div>
          <div className="min-h-0 flex-1">{ticket}</div>
        </div>
      )}

      {charging && <ChargeModal open total={total} busy={busy} onClose={() => setCharging(false)} onSubmit={submit} />}

      <Modal
        open={Boolean(done)}
        onClose={() => setDone(null)}
        size="sm"
        title={done ? `Order #${done.order_number} sent to the kitchen` : ''}
        footer={
          done && (
            <>
              <Link to={`/admin/orders/${done.id}/receipt`} target="_blank">
                <Button variant="secondary">
                  <Printer className="size-4" /> Receipt
                </Button>
              </Link>
              <Button onClick={() => setDone(null)}>New sale</Button>
            </>
          )
        }
      >
        {done && (
          <div className="flex items-center gap-3">
            <CircleCheck className="size-10 shrink-0 text-emerald-500" />
            <div className="text-sm">
              <p className="font-semibold">{money(done.total)}</p>
              <p className="text-stone-500">{done.payment_status === 'paid' ? 'Paid in full' : 'Not paid yet: it is on the Unpaid tab in Orders'}</p>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
