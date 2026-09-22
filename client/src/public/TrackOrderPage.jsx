import { Check, ChefHat, CircleX, ClipboardCheck, Flame, Landmark, PackageCheck, Phone, Printer, Receipt, Truck } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import Seo from '../components/Seo';
import { Badge, Button, cx, ErrorState, PageLoader } from '../components/ui';
import { api } from '../lib/api';
import { ORDER_TYPE, PAYMENT_STATUS } from '../lib/constants';
import { money, time } from '../lib/format';
import { useApi, useEventStream } from '../lib/hooks';
import { useSettings } from '../lib/settings';
import { useToast } from '../lib/toast';
import { whatsappLink } from './shared';

function steps(order) {
  const readyLabel = order.type === 'delivery' ? 'Packed and ready' : order.type === 'pickup' ? 'Ready for pickup' : 'Ready to serve';
  return [
    { status: 'pending', label: 'Order received', icon: Receipt },
    { status: 'confirmed', label: 'Accepted', icon: ClipboardCheck },
    { status: 'preparing', label: 'On the grill', icon: Flame },
    { status: 'ready', label: readyLabel, icon: ChefHat },
    ...(order.type === 'delivery' ? [{ status: 'out_for_delivery', label: 'On the way', icon: Truck }] : []),
    { status: 'completed', label: order.type === 'delivery' ? 'Delivered' : 'Completed', icon: PackageCheck },
  ];
}

const CUSTOMER_METHOD = {
  cash: 'Pay when you get your food',
  card: 'Card',
  transfer: 'Bank transfer',
  online: 'Online payment',
};

const HEADLINES = {
  pending: 'We have your order',
  confirmed: 'Your order is accepted',
  preparing: 'Your food is on the grill',
  ready: 'Your order is ready',
  out_for_delivery: 'Your rider is on the way',
  completed: 'Enjoy your meal!',
  cancelled: 'This order was cancelled',
};

export default function TrackOrderPage() {
  const { number } = useParams();
  const [params] = useSearchParams();
  const token = params.get('t');
  const { settings } = useSettings();
  const toast = useToast();
  const { data: order, error, loading, reload, setData } = useApi(`/api/public/orders/${number}`, { token });
  const [paying, setPaying] = useState(false);
  const live = useEventStream(
    order && !['completed', 'cancelled'].includes(order.status) ? `/api/public/orders/${number}/stream?token=${encodeURIComponent(token)}` : null,
    ['order'],
    (_type, next) => setData(next),
  );

  if (loading && !order) return <PageLoader />;
  if (error) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16">
        <Seo title="Track your order" noindex />
        <ErrorState error={error.status === 404 ? { message: 'We could not find that order. Check the link you were given.' } : error} onRetry={reload} />
      </div>
    );
  }

  const r = settings.restaurant;
  const flow = steps(order);
  const reachedAt = Object.fromEntries(order.events.map((e) => [e.status, e.created_at]));
  const currentIdx = flow.findIndex((s) => s.status === order.status);
  const cancelled = order.status === 'cancelled';
  const unpaid = ['unpaid', 'partial'].includes(order.payment_status) && !cancelled;

  async function payNow() {
    setPaying(true);
    try {
      const { payment_url } = await api.post(`/api/public/orders/${number}/pay`, { token });
      window.location.assign(payment_url);
    } catch (err) {
      toast.error(err.message);
      setPaying(false);
    }
  }

  return (
    <>
      <Seo title={`Order #${order.order_number}`} noindex />
      <section className="ember-glow text-white">
        <div className="mx-auto max-w-3xl px-4 pt-10 pb-24 sm:px-6">
          {params.get('new') && !cancelled && (
            <p className="mb-5 inline-flex items-center gap-2 rounded-full bg-emerald-500/15 px-3 py-1 text-sm font-semibold text-emerald-300 ring-1 ring-emerald-400/30">
              <Check className="size-4" /> Thank you, {order.customer_name?.split(' ')[0]}! Your order has been sent to the kitchen.
            </p>
          )}
          {params.get('paid') && order.payment_status === 'paid' && (
            <p className="mb-5 inline-flex items-center gap-2 rounded-full bg-emerald-500/15 px-3 py-1 text-sm font-semibold text-emerald-300 ring-1 ring-emerald-400/30">
              <Check className="size-4" /> Payment received. Thank you!
            </p>
          )}
          <p className="text-sm font-semibold tracking-wider text-ember-300 uppercase">
            Order #{order.order_number} · {ORDER_TYPE[order.type]}
          </p>
          <h1 className="mt-2 font-display text-4xl font-extrabold tracking-tight sm:text-5xl">{HEADLINES[order.status]}</h1>
          <p className="mt-3 flex flex-wrap items-center gap-3 text-stone-300">
            <span>Placed at {time(order.created_at)}</span>
            {!cancelled && order.status !== 'completed' && (
              <span className="inline-flex items-center gap-1.5 text-sm">
                <span className={cx('size-2 rounded-full', live ? 'animate-pulse bg-emerald-400' : 'bg-stone-500')} />
                {live ? 'Live updates on' : 'Connecting…'}
              </span>
            )}
          </p>
        </div>
      </section>

      <div className="mx-auto -mt-16 max-w-3xl space-y-5 px-4 pb-20 sm:px-6">
        <div className="rounded-3xl bg-white p-5 shadow-xl shadow-coal-900/5 ring-1 ring-stone-200 sm:p-7">
          {cancelled ? (
            <div className="flex gap-4">
              <CircleX className="size-10 shrink-0 text-rose-500" />
              <div>
                <p className="font-semibold">{r.name} cancelled this order.</p>
                {order.cancel_reason && <p className="mt-1 text-sm text-stone-600">Reason: {order.cancel_reason}</p>}
                <p className="mt-2 text-sm text-stone-600">If you paid, we will refund you. Call us on {r.phone} with any questions.</p>
              </div>
            </div>
          ) : (
            <ol className="relative">
              {flow.map((s, i) => {
                const done = i <= currentIdx;
                const current = i === currentIdx;
                return (
                  <li key={s.status} className="relative flex gap-4 pb-6 last:pb-0">
                    {i < flow.length - 1 && (
                      <span className={cx('absolute top-10 left-5 h-[calc(100%-2.5rem)] w-0.5 -translate-x-1/2', i < currentIdx ? 'bg-ember-500' : 'bg-stone-200')} />
                    )}
                    <span
                      className={cx(
                        'relative grid size-10 shrink-0 place-items-center rounded-full transition',
                        current ? 'bg-ember-500 text-white ring-4 ring-ember-100' : done ? 'bg-ember-500 text-white' : 'bg-stone-100 text-stone-400',
                      )}
                    >
                      <s.icon className="size-5" />
                    </span>
                    <div className="pt-2">
                      <p className={cx('font-semibold', done ? 'text-coal-950' : 'text-stone-400')}>{s.label}</p>
                      {reachedAt[s.status] && done && <p className="text-sm text-stone-500">{time(reachedAt[s.status])}</p>}
                      {current && order.status !== 'completed' && (
                        <p className="text-sm text-ember-700">
                          {order.status === 'pending' ? `Waiting for ${r.name} to accept…` : `Usually about ${order.estimated_minutes} minutes from order to ${order.type === 'delivery' ? 'your door' : 'ready'}.`}
                        </p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </div>

        <div className="rounded-3xl bg-white p-5 ring-1 ring-stone-200 sm:p-7">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-display text-lg font-bold">Payment</h2>
            <Badge tone={PAYMENT_STATUS[order.payment_status].tone}>{PAYMENT_STATUS[order.payment_status].label}</Badge>
          </div>
          <p className="mt-1 text-sm text-stone-600">
            {CUSTOMER_METHOD[order.payment_method]} · {money(order.total)}
          </p>
          {unpaid && order.payment_method === 'transfer' && settings.payments.accountNumber && (
            <div className="mt-4 rounded-2xl bg-stone-50 p-4 ring-1 ring-stone-200">
              <p className="flex items-center gap-2 font-semibold">
                <Landmark className="size-4 text-ember-600" /> Transfer {money(order.balance_due)} to
              </p>
              <dl className="mt-3 grid gap-1 text-sm sm:grid-cols-[auto_1fr] sm:gap-x-6">
                <dt className="text-stone-500">Bank</dt>
                <dd className="font-medium">{settings.payments.bankName}</dd>
                <dt className="text-stone-500">Account name</dt>
                <dd className="font-medium">{settings.payments.accountName}</dd>
                <dt className="text-stone-500">Account number</dt>
                <dd className="font-display text-lg font-bold tracking-wider">{settings.payments.accountNumber}</dd>
              </dl>
              <p className="mt-3 text-xs text-stone-500">Use “Order {order.order_number}” as the narration. We confirm transfers before sending your food out.</p>
            </div>
          )}
          {unpaid && order.payment_method === 'online' && settings.payments.online && (
            <Button className="mt-4" loading={paying} onClick={payNow}>
              Pay {money(order.balance_due)} now
            </Button>
          )}
        </div>

        <div className="rounded-3xl bg-white p-5 ring-1 ring-stone-200 sm:p-7">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-display text-lg font-bold">Your order</h2>
            <button onClick={() => window.print()} className="no-print inline-flex items-center gap-1.5 text-sm font-medium text-stone-500 hover:text-coal-950">
              <Printer className="size-4" /> Print
            </button>
          </div>
          <ul className="mt-3 divide-y divide-stone-100 text-sm">
            {order.items.map((item, i) => (
              <li key={i} className="flex justify-between gap-3 py-2.5">
                <span>
                  <span className="text-stone-500">{item.quantity}×</span> {item.name}
                  {item.notes && <span className="block text-xs text-stone-500">“{item.notes}”</span>}
                </span>
                <span className="tabular-nums">{money(item.line_total)}</span>
              </li>
            ))}
          </ul>
          <dl className="space-y-1.5 border-t border-stone-100 pt-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-stone-600">Subtotal</dt>
              <dd>{money(order.subtotal)}</dd>
            </div>
            {order.discount > 0 && (
              <div className="flex justify-between">
                <dt className="text-stone-600">Discount</dt>
                <dd>−{money(order.discount)}</dd>
              </div>
            )}
            {order.delivery_fee > 0 && (
              <div className="flex justify-between">
                <dt className="text-stone-600">Delivery</dt>
                <dd>{money(order.delivery_fee)}</dd>
              </div>
            )}
            {order.tax > 0 && (
              <div className="flex justify-between">
                <dt className="text-stone-600">Tax</dt>
                <dd>{money(order.tax)}</dd>
              </div>
            )}
            <div className="flex justify-between pt-1 text-base font-bold">
              <dt>Total</dt>
              <dd>{money(order.total)}</dd>
            </div>
          </dl>
          {order.delivery_address && <p className="mt-4 text-sm text-stone-600">Delivering to: {order.delivery_address}</p>}
          {order.table_number && <p className="mt-4 text-sm text-stone-600">Table {order.table_number}</p>}
        </div>

        <div className="no-print flex flex-wrap gap-3">
          {r.phone && (
            <a href={`tel:${r.phone.replace(/\s/g, '')}`} className="inline-flex h-11 items-center gap-2 rounded-full bg-coal-950 px-5 text-sm font-semibold text-white">
              <Phone className="size-4" /> Call {r.name}
            </a>
          )}
          {r.whatsapp && (
            <a
              href={whatsappLink(r.whatsapp, `Hi, I have a question about order #${order.order_number}`)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-11 items-center gap-2 rounded-full bg-emerald-600 px-5 text-sm font-semibold text-white"
            >
              WhatsApp about this order
            </a>
          )}
          <Link to="/menu" className="inline-flex h-11 items-center rounded-full px-5 text-sm font-semibold ring-1 ring-stone-300 hover:bg-white">
            Order something else
          </Link>
        </div>
        <p className="text-center text-xs text-stone-500">Bookmark this page to check on your order later. Only people with this link can see it.</p>
      </div>
    </>
  );
}
