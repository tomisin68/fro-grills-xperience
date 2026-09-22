import { ArrowLeft, Banknote, Bike, CircleAlert, CreditCard, Landmark, ShoppingBag, Store } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { FoodImage } from '../components/FoodImage';
import Seo from '../components/Seo';
import { Button, cx, EmptyState, Input, Textarea } from '../components/ui';
import { api } from '../lib/api';
import { useCart } from '../lib/cart';
import { money } from '../lib/format';
import { useLocalStorage } from '../lib/hooks';
import { useSettings } from '../lib/settings';
import { useToast } from '../lib/toast';
import { rememberOrder } from './shared';

function ChoiceCard({ active, onClick, icon: Icon, title, body }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cx(
        'flex w-full items-start gap-3 rounded-2xl p-4 text-left ring-1 transition',
        active ? 'bg-ember-50 ring-2 ring-ember-500' : 'bg-white ring-stone-200 hover:ring-stone-300',
      )}
    >
      <span className={cx('grid size-10 shrink-0 place-items-center rounded-xl', active ? 'bg-ember-500 text-white' : 'bg-stone-100 text-stone-600')}>
        <Icon className="size-5" />
      </span>
      <span>
        <span className="block font-semibold">{title}</span>
        {body && <span className="mt-0.5 block text-sm text-stone-500">{body}</span>}
      </span>
    </button>
  );
}

export default function CheckoutPage() {
  const { settings } = useSettings();
  const cart = useCart();
  const toast = useToast();
  const navigate = useNavigate();
  const o = settings.ordering;
  const p = settings.payments;

  const types = [
    o.delivery && { value: 'delivery', icon: Bike, title: 'Delivery', body: o.deliveryNote || 'Brought to your door' },
    o.pickup && { value: 'pickup', icon: ShoppingBag, title: 'Pickup', body: `Ready in about ${o.estimatedMinutes} min` },
    o.dineIn && { value: 'dine_in', icon: Store, title: 'Dine-in', body: 'Order from your table' },
  ].filter(Boolean);

  const [saved, setSaved] = useLocalStorage('fgx-customer', { name: '', phone: '', email: '', address: '' });
  const [type, setType] = useState(types[0]?.value ?? 'pickup');
  const [form, setForm] = useState({ ...saved, table: '', notes: '' });
  const payOnArrival = { delivery: 'Pay on delivery', pickup: 'Pay at pickup', dine_in: 'Pay at the counter' }[type];
  const methods = [
    p.online && { value: 'online', icon: CreditCard, title: 'Pay online now', body: 'Card, bank transfer or USSD, secured by Paystack' },
    p.transfer && { value: 'transfer', icon: Landmark, title: 'Bank transfer', body: 'We show our account details after you order' },
    p.cash && { value: 'cash', icon: Banknote, title: payOnArrival, body: 'Cash or card (POS) when you get your food' },
  ].filter(Boolean);
  const [method, setMethod] = useState(methods[0]?.value ?? 'cash');
  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const deliveryFee = type === 'delivery' ? o.deliveryFee : 0;
  const tax = Math.round((cart.subtotal * (o.taxRate || 0)) / 100);
  const total = cart.subtotal + deliveryFee + tax;
  const belowMinimum = o.minOrder > 0 && cart.subtotal < o.minOrder;
  const closed = !settings.status.isOpen || !o.acceptingOrders;

  if (cart.count === 0) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16">
        <Seo title="Checkout" noindex />
        <EmptyState
          icon={ShoppingBag}
          title="Your cart is empty"
          action={
            <Link to="/menu" className="inline-flex h-11 items-center rounded-xl bg-ember-500 px-5 text-sm font-semibold text-white">
              Browse the menu
            </Link>
          }
        >
          Add a few things from the menu and come back here to order.
        </EmptyState>
      </div>
    );
  }

  function validate() {
    const e = {};
    if (form.name.trim().length < 2) e.name = 'Enter your name';
    if (!/^[+\d][\d\s-]{6,19}$/.test(form.phone.trim())) e.phone = 'Enter a phone number we can call';
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) e.email = 'Check this email address';
    if (method === 'online' && !form.email.trim()) e.email = 'Paystack needs an email for your receipt';
    if (type === 'delivery' && form.address.trim().length < 5) e.address = 'Enter the full delivery address';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function submit(e) {
    e.preventDefault();
    setSubmitError('');
    if (!validate()) return;
    setSubmitting(true);
    try {
      const res = await api.post('/api/public/orders', {
        type,
        customer: { name: form.name.trim(), phone: form.phone.trim(), email: form.email.trim() },
        deliveryAddress: type === 'delivery' ? form.address.trim() : '',
        tableNumber: type === 'dine_in' ? form.table.trim() : '',
        notes: form.notes.trim(),
        paymentMethod: method,
        items: cart.lines.map((l) => ({ menuItemId: l.menuItemId, quantity: l.quantity, notes: l.notes })),
      });
      setSaved({ name: form.name.trim(), phone: form.phone.trim(), email: form.email.trim(), address: form.address.trim() });
      rememberOrder(res.order_number, res.token);
      cart.clear();
      if (res.payment_url) {
        window.location.assign(res.payment_url);
        return;
      }
      if (res.payment_error) toast.error(`Your order is in, but online payment could not start: ${res.payment_error}`);
      navigate(`/track/${res.order_number}?t=${res.token}&new=1`);
    } catch (err) {
      setSubmitError(err.message);
      setSubmitting(false);
    }
  }

  return (
    <>
      <Seo title="Checkout" noindex />
      <div className="mx-auto max-w-6xl px-4 pt-6 pb-20 sm:px-6">
        <Link to="/menu" className="inline-flex items-center gap-1 text-sm font-medium text-stone-500 hover:text-coal-950">
          <ArrowLeft className="size-4" /> Keep browsing
        </Link>
        <h1 className="mt-3 font-display text-3xl font-extrabold tracking-tight sm:text-4xl">Checkout</h1>

        {closed && (
          <div className="mt-6 flex gap-3 rounded-2xl bg-amber-50 p-4 text-amber-900 ring-1 ring-amber-200">
            <CircleAlert className="mt-0.5 size-5 shrink-0" />
            <p className="text-sm">
              {o.acceptingOrders ? `${settings.status.message}.` : 'Online ordering is paused right now.'} Your cart is saved, so you can place the order when we are open.
            </p>
          </div>
        )}

        <form onSubmit={submit} noValidate className="mt-8 grid gap-8 lg:grid-cols-[1fr_380px]">
          <div className="space-y-8">
            {types.length > 1 && (
              <fieldset>
                <legend className="font-display text-lg font-bold">How would you like it?</legend>
                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  {types.map((t) => (
                    <ChoiceCard key={t.value} active={type === t.value} onClick={() => setType(t.value)} icon={t.icon} title={t.title} body={t.body} />
                  ))}
                </div>
              </fieldset>
            )}

            <fieldset className="space-y-4">
              <legend className="font-display text-lg font-bold">Your details</legend>
              <div className="grid gap-4 sm:grid-cols-2">
                <Input label="Name" autoComplete="name" value={form.name} onChange={set('name')} error={errors.name} />
                <Input label="Phone number" type="tel" autoComplete="tel" inputMode="tel" value={form.phone} onChange={set('phone')} error={errors.phone} hint="We call this number if anything changes." />
              </div>
              <Input
                label={method === 'online' ? 'Email' : 'Email (optional)'}
                type="email"
                autoComplete="email"
                value={form.email}
                onChange={set('email')}
                error={errors.email}
              />
              {type === 'delivery' && (
                <Textarea label="Delivery address" autoComplete="street-address" rows={2} value={form.address} onChange={set('address')} error={errors.address} hint="House number, street, area and a landmark help our rider find you." />
              )}
              {type === 'dine_in' && <Input label="Table number (optional)" value={form.table} onChange={set('table')} />}
              <Textarea label="Notes for the kitchen (optional)" rows={2} value={form.notes} onChange={set('notes')} placeholder="Allergies, gate code, extra pepper…" />
            </fieldset>

            <fieldset>
              <legend className="font-display text-lg font-bold">Payment</legend>
              <div className="mt-3 grid gap-3">
                {methods.map((m) => (
                  <ChoiceCard key={m.value} active={method === m.value} onClick={() => setMethod(m.value)} icon={m.icon} title={m.title} body={m.body} />
                ))}
              </div>
            </fieldset>
          </div>

          <aside className="lg:sticky lg:top-24 lg:self-start">
            <div className="rounded-3xl bg-white p-5 ring-1 ring-stone-200 sm:p-6">
              <h2 className="font-display text-lg font-bold">Order summary</h2>
              <ul className="mt-4 divide-y divide-stone-100">
                {cart.lines.map((l) => (
                  <li key={l.key} className="flex gap-3 py-3">
                    <div className="size-12 shrink-0">
                      <FoodImage src={l.image_url} name={l.name} category={l.category} rounded="rounded-xl" />
                    </div>
                    <div className="min-w-0 flex-1 text-sm">
                      <p className="font-medium">
                        <span className="text-stone-500">{l.quantity}×</span> {l.name}
                      </p>
                      {l.notes && <p className="text-xs text-stone-500">“{l.notes}”</p>}
                    </div>
                    <p className="text-sm font-semibold tabular-nums">{money(l.price * l.quantity)}</p>
                  </li>
                ))}
              </ul>
              <dl className="mt-2 space-y-2 border-t border-stone-100 pt-4 text-sm">
                <div className="flex justify-between">
                  <dt className="text-stone-600">Subtotal</dt>
                  <dd className="tabular-nums">{money(cart.subtotal)}</dd>
                </div>
                {type === 'delivery' && (
                  <div className="flex justify-between">
                    <dt className="text-stone-600">Delivery</dt>
                    <dd className="tabular-nums">{deliveryFee ? money(deliveryFee) : 'Free'}</dd>
                  </div>
                )}
                {tax > 0 && (
                  <div className="flex justify-between">
                    <dt className="text-stone-600">Tax ({o.taxRate}%)</dt>
                    <dd className="tabular-nums">{money(tax)}</dd>
                  </div>
                )}
                <div className="flex items-baseline justify-between border-t border-stone-100 pt-3">
                  <dt className="font-semibold">Total</dt>
                  <dd className="font-display text-2xl font-bold tabular-nums">{money(total)}</dd>
                </div>
              </dl>
              {belowMinimum && (
                <p className="mt-4 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  The minimum order is {money(o.minOrder)}. Add {money(o.minOrder - cart.subtotal)} more.
                </p>
              )}
              {submitError && (
                <p role="alert" className="mt-4 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-800 ring-1 ring-rose-200">
                  {submitError}
                </p>
              )}
              <Button type="submit" size="lg" className="mt-5 w-full" loading={submitting} disabled={closed || belowMinimum || !methods.length}>
                {method === 'online' ? `Pay ${money(total)}` : `Place order · ${money(total)}`}
              </Button>
              <p className="mt-3 text-center text-xs text-stone-500">Final prices are confirmed by {settings.restaurant.name} when you order.</p>
            </div>
          </aside>
        </form>
      </div>
    </>
  );
}
