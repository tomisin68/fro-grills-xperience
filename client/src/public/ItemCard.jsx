import { Flame, Leaf, Plus } from 'lucide-react';
import { Link } from 'react-router';
import { FoodImage } from '../components/FoodImage';
import { cx, QuantityStepper } from '../components/ui';
import { useCart } from '../lib/cart';
import { TAG_LABEL } from '../lib/constants';
import { money } from '../lib/format';

export function TagChips({ tags, dark, className }) {
  const shown = tags.filter((t) => t === 'spicy' || t === 'vegetarian' || t === 'gluten-free');
  if (!shown.length) return null;
  return (
    <div className={cx('flex flex-wrap gap-1.5', className)}>
      {shown.map((t) => (
        <span
          key={t}
          className={cx(
            'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold',
            t === 'spicy' ? (dark ? 'bg-red-500/15 text-red-300' : 'bg-red-50 text-red-700') : dark ? 'bg-emerald-500/15 text-emerald-300' : 'bg-emerald-50 text-emerald-700',
          )}
        >
          {t === 'spicy' ? <Flame className="size-3" /> : <Leaf className="size-3" />}
          {TAG_LABEL[t]}
        </span>
      ))}
    </div>
  );
}

export default function ItemCard({ item, categoryName }) {
  const cart = useCart();
  const plain = cart.lines.find((l) => l.key === `${item.id}|`);
  const inCart = cart.quantityOf(item.id);
  const ribbon = item.tags.includes('chef-special') ? "Chef's special" : item.tags.includes('popular') ? 'Popular' : item.tags.includes('new') ? 'New' : null;

  return (
    <article className="group flex flex-col overflow-hidden rounded-3xl bg-white ring-1 ring-stone-200/70 transition duration-300 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-coal-900/5">
      <Link to={`/menu/${item.slug}`} className="relative block aspect-[4/3] overflow-hidden" tabIndex={-1} aria-hidden="true">
        <FoodImage
          src={item.image_url}
          name={item.name}
          category={categoryName}
          rounded="rounded-none"
          className="transition duration-500 group-hover:scale-[1.04]"
        />
        {ribbon && (
          <span className="absolute top-3 left-3 rounded-full bg-coal-950/80 px-2.5 py-1 text-[11px] font-bold tracking-wide text-ember-300 uppercase backdrop-blur">
            {ribbon}
          </span>
        )}
        {item.sold_out && (
          <span className="absolute inset-0 grid place-items-center bg-coal-950/60 font-display text-lg font-bold text-white backdrop-blur-[1px]">
            Sold out
          </span>
        )}
      </Link>
      <div className="flex flex-1 flex-col p-4 sm:p-5">
        <h3 className="font-display text-[17px] leading-snug font-bold text-coal-950">
          <Link to={`/menu/${item.slug}`} className="hover:text-ember-600">
            {item.name}
          </Link>
        </h3>
        <TagChips tags={item.tags} className="mt-1.5" />
        {item.description && <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-stone-500">{item.description}</p>}
        <div className="mt-auto flex items-center justify-between gap-3 pt-4">
          <div>
            <p className="font-display text-lg font-bold">{money(item.price)}</p>
            {inCart > 0 && !plain && <p className="text-xs font-medium text-ember-600">{inCart} in your order</p>}
          </div>
          {item.sold_out ? null : plain ? (
            <QuantityStepper value={plain.quantity} onChange={(q) => cart.setQuantity(plain.key, q)} />
          ) : (
            <button
              onClick={() => cart.add({ ...item, category_name: categoryName })}
              className="inline-flex h-10 items-center gap-1.5 rounded-full bg-coal-950 px-4 text-sm font-semibold text-white transition hover:bg-ember-500"
              aria-label={`Add ${item.name} to your order`}
            >
              <Plus className="size-4" /> Add
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
