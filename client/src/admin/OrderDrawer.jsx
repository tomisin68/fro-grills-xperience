import { Ban, CircleAlert, MapPin, Phone, Printer, RotateCcw, Wallet } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { Badge, Button, cx, Drawer, Modal, PageLoader, Segmented, Textarea } from '../components/ui';
import { api } from '../lib/api';
import { NEXT_ACTION, nextStatuses, ORDER_STATUS, ORDER_TYPE, PAYMENT_METHOD } from '../lib/constants';
import { dateTime, money, time, toMajor, toMinor } from '../lib/format';
import { useApi } from '../lib/hooks';
import { useToast } from '../lib/toast';
import { useAuth } from './auth';
import { MoneyInput, PaymentBadge, StatusBadge } from './components';
import { useLiveOrders } from './live';

const METHOD_OPTIONS = [
  { value: 'cash', label: 'Cash' },
  { value: 'card', label: 'Card / POS' },
  { value: 'transfer', label: 'Transfer' },
];

export function PaymentModal({ order, open, onClose, onDone }) {
  const { shift } = useAuth();
  const toast = useToast();
  const [method, setMethod] = useState('cash');
  const [amount, setAmount] = useState(toMajor(order.balance_due));
  const [tendered, setTendered] = useState('');
  const [reference, setReference] = useState('');
  const [busy, setBusy] = useState(false);
  const due = order.balance_due;
  const paying = Math.min(toMinor(amount), due);
  const change = method === 'cash' && tendered ? toMinor(tendered) - paying : 0;

  async function submit() {
    setBusy(true);
    try {
      const { order: updated } = await api.post(`/api/admin/orders/${order.id}/payments`, { method, amount: paying, reference });
      toast.success(`${money(paying)} recorded on order #${order.order_number}`);
      onDone(updated);
      onClose();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Take payment · #${order.order_number}`}
      description={`${money(due)} left to pay`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="success" loading={busy} disabled={paying <= 0 || (method === 'cash' && !shift)} onClick={submit}>
            Record {money(paying)}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Segmented value={method} onChange={setMethod} options={METHOD_OPTIONS} className="w-full" />
        {method === 'cash' && !shift && (
          <p className="flex gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200">
            <CircleAlert className="mt-0.5 size-4 shrink-0" />
            <span>
              Open your cash shift before taking cash, so the drawer can be balanced at the end of the day.{' '}
              <Link to="/admin/shifts" className="font-semibold underline">
                Open shift
              </Link>
            </span>
          </p>
        )}
        <MoneyInput label="Amount being paid" value={amount} onChange={(e) => setAmount(e.target.value)} hint={paying < due ? 'Part payment: the rest stays on the order as unpaid.' : null} />
        {method === 'cash' && (
          <div className="grid grid-cols-2 items-end gap-3">
            <MoneyInput label="Cash handed over" value={tendered} onChange={(e) => setTendered(e.target.value)} />
            <div className={cx('rounded-xl px-4 py-2.5', change < 0 ? 'bg-rose-50 text-rose-800' : 'bg-emerald-50 text-emerald-800')}>
              <p className="text-xs">{change < 0 ? 'Short by' : 'Change to give'}</p>
              <p className="font-display text-lg font-bold">{money(Math.abs(change))}</p>
            </div>
          </div>
        )}
        {method !== 'cash' && (
          <label className="block text-sm">
            <span className="font-medium">Reference (optional)</span>
            <input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder={method === 'card' ? 'Terminal receipt number' : 'Sender name or transfer reference'}
              className="mt-1.5 h-11 w-full rounded-xl border-0 px-3.5 ring-1 ring-stone-300 focus:ring-2 focus:ring-ember-500 focus:outline-none"
            />
          </label>
        )}
      </div>
    </Modal>
  );
}

function RefundModal({ order, open, onClose, onDone }) {
  const toast = useToast();
  const [method, setMethod] = useState(order.payments.find((p) => p.kind === 'payment')?.method === 'cash' ? 'cash' : 'transfer');
  const [amount, setAmount] = useState(toMajor(order.amount_paid));
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      const { order: updated } = await api.post(`/api/admin/orders/${order.id}/refunds`, { method, amount: toMinor(amount), reason });
      toast.success('Refund recorded');
      onDone(updated);
      onClose();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Refund · #${order.order_number}`}
      description={`${money(order.amount_paid)} has been paid on this order`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Back
          </Button>
          <Button variant="danger" loading={busy} disabled={reason.trim().length < 3 || toMinor(amount) <= 0} onClick={submit}>
            Refund {money(toMinor(amount))}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Segmented value={method} onChange={setMethod} options={METHOD_OPTIONS} className="w-full" />
        <MoneyInput label="Amount to refund" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <Textarea label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why is this money going back?" hint="Refunds show in reports and the activity log with your name." />
      </div>
    </Modal>
  );
}

const CANCEL_REASONS = ['Customer changed their mind', 'Could not reach customer', 'Item unavailable', 'Duplicate order', 'Payment not received'];

function CancelModal({ order, open, onClose, onDone }) {
  const toast = useToast();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit() {
    setBusy(true);
    try {
      const { order: updated } = await api.post(`/api/admin/orders/${order.id}/cancel`, { reason });
      toast.success(`Order #${order.order_number} cancelled`);
      onDone(updated);
      onClose();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Cancel order #${order.order_number}?`}
      description="Cancelled orders stay on record with the reason and your name."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Keep order
          </Button>
          <Button variant="danger" loading={busy} disabled={reason.trim().length < 3} onClick={submit}>
            Cancel order
          </Button>
        </>
      }
    >
      <div className="flex flex-wrap gap-2">
        {CANCEL_REASONS.map((r) => (
          <button key={r} onClick={() => setReason(r)} className={cx('rounded-full px-3 py-1.5 text-sm ring-1', reason === r ? 'bg-coal-950 text-white ring-coal-950' : 'ring-stone-300 hover:bg-stone-50')}>
            {r}
          </button>
        ))}
      </div>
      <Textarea className="mt-4" label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} />
      {['preparing', 'ready', 'out_for_delivery'].includes(order.status) && (
        <p className="mt-3 text-sm text-amber-800">This order was already being cooked, so its ingredients are not returned to stock.</p>
      )}
    </Modal>
  );
}

export default function OrderDrawer({ orderId, onClose, onChanged }) {
  const { can } = useAuth();
  const toast = useToast();
  const { data, loading, setData, reload } = useApi(orderId ? `/api/admin/orders/${orderId}` : null);
  const [modal, setModal] = useState(null);
  const [moving, setMoving] = useState(null);
  const order = data?.order;

  useLiveOrders((_type, o) => {
    if (o.id === orderId) reload();
  });

  const update = (next) => {
    setData({ order: next });
    onChanged?.(next);
  };

  async function move(status) {
    setMoving(status);
    try {
      const { order: next } = await api.post(`/api/admin/orders/${order.id}/status`, { status });
      update(next);
      toast.success(`#${next.order_number}: ${ORDER_STATUS[status].label}`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setMoving(null);
    }
  }

  const final = order && ['completed', 'cancelled'].includes(order.status);
  const next = order ? nextStatuses(order) : [];
  const canMove = can('orders.update');
  const canCancel = order && !final && (can('orders.cancel') || (order.status === 'pending' && can('orders.update')));

  return (
    <Drawer
      open={Boolean(orderId)}
      onClose={onClose}
      width="max-w-xl"
      title={
        order ? (
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-xl font-bold">#{order.order_number}</h2>
            <StatusBadge status={order.status} />
            <PaymentBadge status={order.payment_status} />
          </div>
        ) : (
          'Order'
        )
      }
      footer={
        order &&
        !final && (
          <div className="flex flex-wrap gap-2">
            {canMove &&
              next.slice(0, 2).map((s, i) => (
                <Button key={s} variant={i === 0 ? 'primary' : 'secondary'} loading={moving === s} onClick={() => move(s)} className={i === 0 ? 'flex-1' : ''}>
                  {NEXT_ACTION[s]}
                </Button>
              ))}
            {canCancel && (
              <Button variant="danger-ghost" onClick={() => setModal('cancel')}>
                <Ban className="size-4" /> Cancel
              </Button>
            )}
          </div>
        )
      }
    >
      {loading && !order ? (
        <PageLoader />
      ) : order ? (
        <div className="space-y-6 px-5 py-5">
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-stone-600">
            <span>{dateTime(order.created_at)}</span>
            <span>{ORDER_TYPE[order.type]}</span>
            <span>{order.channel === 'online' ? 'Online order' : `Counter · ${order.created_by_name ?? ''}`}</span>
          </div>

          {order.status === 'pending' && order.payment_method === 'online' && order.payment_status === 'unpaid' && (
            <p className="flex gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200">
              <CircleAlert className="mt-0.5 size-4 shrink-0" /> The customer chose to pay online but the payment has not come through yet.
            </p>
          )}
          {order.payment_method === 'transfer' && ['unpaid', 'partial'].includes(order.payment_status) && !final && (
            <p className="flex gap-2 rounded-xl bg-sky-50 p-3 text-sm text-sky-900 ring-1 ring-sky-200">
              <CircleAlert className="mt-0.5 size-4 shrink-0" /> Customer will pay by transfer. Check the bank app for “Order {order.order_number}” before the food leaves.
            </p>
          )}
          {order.status === 'completed' && ['unpaid', 'partial'].includes(order.payment_status) && (
            <p className="flex gap-2 rounded-xl bg-rose-50 p-3 text-sm text-rose-900 ring-1 ring-rose-200">
              <CircleAlert className="mt-0.5 size-4 shrink-0" /> This order was served but {money(order.balance_due)} has not been paid.
            </p>
          )}

          {(order.customer_name || order.customer_phone || order.delivery_address || order.table_number) && (
            <section className="rounded-2xl bg-stone-50 p-4 text-sm">
              {order.customer_name && <p className="font-semibold">{order.customer_name}</p>}
              {order.customer_phone && (
                <a href={`tel:${order.customer_phone}`} className="mt-1 flex items-center gap-2 text-ember-700">
                  <Phone className="size-4" /> {order.customer_phone}
                </a>
              )}
              {order.delivery_address && (
                <p className="mt-1 flex gap-2">
                  <MapPin className="mt-0.5 size-4 shrink-0 text-stone-500" /> {order.delivery_address}
                </p>
              )}
              {order.table_number && <p className="mt-1">Table {order.table_number}</p>}
              {order.customer_email && <p className="mt-1 text-stone-500">{order.customer_email}</p>}
            </section>
          )}

          <section>
            <h3 className="text-xs font-semibold tracking-wider text-stone-500 uppercase">Items</h3>
            <ul className="mt-2 divide-y divide-stone-100">
              {order.items.map((i) => (
                <li key={i.id} className="flex justify-between gap-3 py-2 text-sm">
                  <span>
                    <span className="font-semibold">{i.quantity}×</span> {i.name}
                    {i.notes && <span className="block text-xs text-amber-700">“{i.notes}”</span>}
                  </span>
                  <span className="tabular-nums">{money(i.line_total)}</span>
                </li>
              ))}
            </ul>
            {order.notes && <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">Note: {order.notes}</p>}
            <dl className="mt-3 space-y-1 border-t border-stone-100 pt-3 text-sm">
              <Row label="Subtotal" value={money(order.subtotal)} />
              {order.discount > 0 && <Row label={`Discount (${order.discount_reason})`} value={`−${money(order.discount)}`} />}
              {order.delivery_fee > 0 && <Row label="Delivery" value={money(order.delivery_fee)} />}
              {order.tax > 0 && <Row label="Tax" value={money(order.tax)} />}
              <Row label="Total" value={money(order.total)} strong />
            </dl>
          </section>

          <section>
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-xs font-semibold tracking-wider text-stone-500 uppercase">Payments</h3>
              <div className="flex gap-1">
                {can('payments.record') && order.status !== 'cancelled' && order.balance_due > 0 && (
                  <Button size="sm" variant="success" onClick={() => setModal('pay')}>
                    <Wallet className="size-4" /> Take payment
                  </Button>
                )}
                {can('payments.refund') && order.amount_paid > 0 && (
                  <Button size="sm" variant="ghost" onClick={() => setModal('refund')}>
                    <RotateCcw className="size-4" /> Refund
                  </Button>
                )}
              </div>
            </div>
            <p className="mt-1 text-sm text-stone-600">
              Customer chose: {PAYMENT_METHOD[order.payment_method]} · Paid {money(order.amount_paid)}
              {order.balance_due > 0 && order.status !== 'cancelled' && <span className="font-semibold text-rose-700"> · {money(order.balance_due)} due</span>}
            </p>
            {order.payments.length > 0 && (
              <ul className="mt-2 space-y-1.5">
                {order.payments.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 rounded-xl bg-stone-50 px-3 py-2 text-sm">
                    <span>
                      <Badge tone={p.kind === 'refund' ? 'rose' : 'emerald'}>{p.kind === 'refund' ? 'Refund' : 'Paid'}</Badge>{' '}
                      {PAYMENT_METHOD[p.method]} · {time(p.created_at)} · {p.user_name ?? 'Paystack'}
                      {(p.reference || p.note) && <span className="block text-xs text-stone-500">{p.note || p.reference}</span>}
                    </span>
                    <span className={cx('font-semibold tabular-nums', p.kind === 'refund' && 'text-rose-700')}>
                      {p.kind === 'refund' ? '−' : ''}
                      {money(p.amount)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h3 className="text-xs font-semibold tracking-wider text-stone-500 uppercase">History</h3>
            <ol className="mt-2 space-y-2 border-l-2 border-stone-200 pl-4">
              {order.events.map((e) => (
                <li key={e.id} className="relative text-sm">
                  <span className="absolute top-1.5 -left-[21px] size-2.5 rounded-full bg-stone-300 ring-2 ring-white" />
                  <span className="font-medium">{ORDER_STATUS[e.status]?.label ?? e.status}</span>
                  <span className="text-stone-500">
                    {' '}
                    · {time(e.created_at)}
                    {e.user_name ? ` · ${e.user_name}` : ''}
                  </span>
                  {e.note && <span className="block text-xs text-stone-500">{e.note}</span>}
                </li>
              ))}
            </ol>
          </section>

          <Link
            to={`/admin/orders/${order.id}/receipt`}
            target="_blank"
            className="inline-flex items-center gap-2 text-sm font-semibold text-stone-600 hover:text-coal-950"
          >
            <Printer className="size-4" /> Print receipt
          </Link>

          {modal === 'pay' && <PaymentModal open order={order} onClose={() => setModal(null)} onDone={update} />}
          {modal === 'refund' && <RefundModal open order={order} onClose={() => setModal(null)} onDone={update} />}
          {modal === 'cancel' && <CancelModal open order={order} onClose={() => setModal(null)} onDone={update} />}
        </div>
      ) : null}
    </Drawer>
  );
}

function Row({ label, value, strong }) {
  return (
    <div className={cx('flex justify-between gap-3', strong && 'pt-1 text-base font-bold')}>
      <dt className={strong ? '' : 'text-stone-600'}>{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}
