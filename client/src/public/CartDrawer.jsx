import { ShoppingBag, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router';
import { FoodImage } from '../components/FoodImage';
import { Button, Drawer, EmptyState, QuantityStepper } from '../components/ui';
import { useCart } from '../lib/cart';
import { money } from '../lib/format';
import { useSettings } from '../lib/settings';

export default function CartDrawer() {
  const cart = useCart();
  const { settings } = useSettings();
  const navigate = useNavigate();
  const close = () => cart.setOpen(false);
  const canOrder = settings.status.isOpen && settings.ordering.acceptingOrders;

  return (
    <Drawer
      open={cart.open}
      onClose={close}
      title={
        <div>
          <h2 className="font-display text-lg font-bold">Your order</h2>
          <p className="text-xs text-stone-500">
            {cart.count} item{cart.count === 1 ? '' : 's'}
          </p>
        </div>
      }
      footer={
        cart.count > 0 && (
          <div className="space-y-3">
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-stone-600">Subtotal</span>
              <span className="font-display text-xl font-bold">{money(cart.subtotal)}</span>
            </div>
            <p className="text-xs text-stone-500">Delivery fee and any tax are added at checkout.</p>
            {!canOrder && (
              <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900 ring-1 ring-amber-200">
                {settings.ordering.acceptingOrders ? settings.status.message : 'Online ordering is paused right now.'} You can keep your cart and order when we open.
              </p>
            )}
            <Button
              size="lg"
              className="w-full"
              disabled={!canOrder}
              onClick={() => {
                close();
                navigate('/checkout');
              }}
            >
              Go to checkout
            </Button>
          </div>
        )
      }
    >
      {cart.count === 0 ? (
        <EmptyState
          icon={ShoppingBag}
          title="Your cart is empty"
          action={
            <Button
              onClick={() => {
                close();
                navigate('/menu');
              }}
            >
              Browse the menu
            </Button>
          }
        >
          Add something off the grill and it will show up here.
        </EmptyState>
      ) : (
        <ul className="divide-y divide-stone-100">
          {cart.lines.map((line) => (
            <li key={line.key} className="flex gap-3 px-5 py-4">
              <div className="size-16 shrink-0">
                <FoodImage src={line.image_url} name={line.name} category={line.category} rounded="rounded-xl" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold leading-snug">{line.name}</p>
                  <p className="font-semibold tabular-nums">{money(line.price * line.quantity)}</p>
                </div>
                {line.notes && <p className="mt-0.5 text-xs text-stone-500">“{line.notes}”</p>}
                <div className="mt-2 flex items-center justify-between">
                  <QuantityStepper size="sm" value={line.quantity} min={1} onChange={(q) => cart.setQuantity(line.key, q)} />
                  <button
                    onClick={() => cart.setQuantity(line.key, 0)}
                    className="rounded-lg p-1.5 text-stone-400 hover:bg-rose-50 hover:text-rose-600"
                    aria-label={`Remove ${line.name}`}
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Drawer>
  );
}
