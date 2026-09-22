import { Bike, ChefHat, Maximize, Minimize, ShoppingBag, Store } from 'lucide-react';
import { useEffect, useState } from 'react';
import { cx, ErrorState, PageLoader } from '../../components/ui';
import { api } from '../../lib/api';
import { minutesSince, time } from '../../lib/format';
import { useApi, useTick } from '../../lib/hooks';
import { useToast } from '../../lib/toast';
import { useAuth } from '../auth';
import { useLiveOrders } from '../live';

const COLUMNS = [
  { status: 'confirmed', title: 'To cook', accent: 'bg-sky-400' },
  { status: 'preparing', title: 'On the grill', accent: 'bg-ember-500' },
  { status: 'ready', title: 'Ready', accent: 'bg-emerald-400' },
];
const TYPE_ICON = { dine_in: Store, pickup: ShoppingBag, delivery: Bike };
const TYPE_LABEL = { dine_in: 'Dine-in', pickup: 'Takeaway', delivery: 'Delivery' };

function Ticket({ order, onMove, busy }) {
  const { can } = useAuth();
  const mins = minutesSince(order.created_at);
  const late = mins >= 25 ? 'bg-rose-500 text-white' : mins >= 15 ? 'bg-amber-400 text-coal-950' : 'bg-white/10 text-stone-200';
  const Icon = TYPE_ICON[order.type];
  let action = null;
  if (order.status === 'confirmed') action = { to: 'preparing', label: 'Start cooking', cls: 'bg-ember-500 hover:bg-ember-600' };
  if (order.status === 'preparing') action = { to: 'ready', label: 'Mark ready', cls: 'bg-emerald-600 hover:bg-emerald-700' };
  if (order.status === 'ready' && can('orders.update')) {
    action = order.type === 'delivery'
      ? { to: 'out_for_delivery', label: 'Hand to rider', cls: 'bg-indigo-600 hover:bg-indigo-700' }
      : { to: 'completed', label: order.type === 'dine_in' ? 'Served' : 'Picked up', cls: 'bg-stone-600 hover:bg-stone-500' };
  }

  return (
    <article className="animate-pop overflow-hidden rounded-2xl bg-coal-800 ring-1 ring-white/10">
      <header className="flex items-center justify-between gap-2 border-b border-white/5 px-4 py-3">
        <div>
          <p className="font-display text-2xl leading-none font-extrabold text-white">#{order.order_number}</p>
          <p className="mt-1 flex items-center gap-1.5 text-xs text-stone-400">
            <Icon className="size-3.5" /> {TYPE_LABEL[order.type]}
            {order.table_number && ` · Table ${order.table_number}`}
            {order.customer_name && ` · ${order.customer_name}`}
          </p>
        </div>
        <span className={cx('rounded-lg px-2 py-1 text-sm font-bold tabular-nums', late)} title={`Ordered at ${time(order.created_at)}`}>
          {mins}m
        </span>
      </header>
      <ul className="space-y-1.5 px-4 py-3">
        {order.items.map((i, idx) => (
          <li key={idx} className="text-[15px] leading-snug text-stone-100">
            <span className="mr-2 inline-grid min-w-7 place-items-center rounded-md bg-white/10 px-1.5 font-bold text-white">{i.quantity}</span>
            {i.name}
            {i.notes && <span className="mt-0.5 block pl-9 text-sm font-semibold text-amber-300">→ {i.notes}</span>}
          </li>
        ))}
      </ul>
      {order.notes && <p className="mx-4 mb-3 rounded-lg bg-amber-400/10 px-3 py-2 text-sm text-amber-200">{order.notes}</p>}
      {action && (
        <button
          onClick={() => onMove(order, action.to)}
          disabled={busy}
          className={cx('w-full py-3.5 text-base font-bold text-white transition disabled:opacity-60', action.cls)}
        >
          {busy ? 'Saving…' : action.label}
        </button>
      )}
    </article>
  );
}

export default function KitchenPage() {
  const toast = useToast();
  const { data, error, loading, reload, setData } = useApi('/api/admin/kitchen');
  const [busyId, setBusyId] = useState(null);
  const [full, setFull] = useState(false);
  useTick(30000);
  useLiveOrders(() => reload());

  useEffect(() => {
    const t = setInterval(reload, 60000);
    const onFs = () => setFull(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFs);
    return () => {
      clearInterval(t);
      document.removeEventListener('fullscreenchange', onFs);
    };
  }, [reload]);

  async function move(order, status) {
    setBusyId(order.id);
    try {
      await api.post(`/api/admin/orders/${order.id}/status`, { status });
      setData((d) => ({
        ...d,
        orders: d.orders
          .map((o) => (o.id === order.id ? { ...o, status } : o))
          .filter((o) => ['confirmed', 'preparing', 'ready'].includes(o.status)),
      }));
    } catch (err) {
      toast.error(err.message);
      reload();
    } finally {
      setBusyId(null);
    }
  }

  const toggleFull = () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.());

  if (loading && !data) return <PageLoader />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  return (
    <div className="-mx-4 -my-6 min-h-[calc(100dvh-3.5rem)] bg-coal-950 p-4 sm:-mx-6 sm:p-6 lg:-mx-8">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 font-display text-xl font-extrabold text-white">
          <ChefHat className="size-6 text-ember-400" /> Kitchen
        </h1>
        <button onClick={toggleFull} className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2 text-sm font-semibold text-white hover:bg-white/15">
          {full ? <Minimize className="size-4" /> : <Maximize className="size-4" />}
          {full ? 'Exit full screen' : 'Full screen'}
        </button>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        {COLUMNS.map((col) => {
          const orders = data.orders.filter((o) => o.status === col.status);
          return (
            <section key={col.status} className="min-w-0">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-bold tracking-wider text-stone-300 uppercase">
                <span className={cx('size-2.5 rounded-full', col.accent)} />
                {col.title}
                <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-white">{orders.length}</span>
              </h2>
              <div className="space-y-3">
                {orders.length === 0 ? (
                  <p className="rounded-2xl border border-dashed border-white/10 px-4 py-10 text-center text-sm text-stone-500">Nothing here</p>
                ) : (
                  orders.map((o) => <Ticket key={o.id} order={o} busy={busyId === o.id} onMove={move} />)
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
