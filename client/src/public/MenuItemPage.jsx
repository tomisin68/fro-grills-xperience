import { ArrowLeft, Clock } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { FoodImage } from '../components/FoodImage';
import Seo from '../components/Seo';
import { Button, ErrorState, PageLoader, QuantityStepper } from '../components/ui';
import { useCart } from '../lib/cart';
import { TAG_LABEL } from '../lib/constants';
import { money } from '../lib/format';
import { useApi } from '../lib/hooks';
import { useToast } from '../lib/toast';
import ItemCard, { TagChips } from './ItemCard';
import NotFoundPage from './NotFoundPage';

// Keyed by slug so quantity and notes reset when moving between dishes.
export default function MenuItemPage() {
  const { slug } = useParams();
  return <ItemView key={slug} slug={slug} />;
}

function ItemView({ slug }) {
  const { data, error, loading, reload } = useApi(`/api/public/menu/${encodeURIComponent(slug)}`);
  const cart = useCart();
  const toast = useToast();
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState('');

  if (loading && !data) return <PageLoader />;
  if (error?.status === 404) return <NotFoundPage />;
  if (error) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16">
        <ErrorState error={error} onRetry={reload} />
      </div>
    );
  }

  const { item, related } = data;
  const highlights = item.tags.filter((t) => ['popular', 'chef-special', 'new'].includes(t));

  const addToCart = () => {
    cart.add(item, quantity, notes);
    toast.success(`${quantity} × ${item.name} added to your order`);
    setQuantity(1);
    setNotes('');
  };

  return (
    <>
      <Seo title={item.name} description={item.description} image={item.image_url} />
      <div className="mx-auto max-w-6xl px-4 pt-6 pb-20 sm:px-6">
        <nav className="flex items-center gap-2 text-sm text-stone-500">
          <Link to="/menu" className="inline-flex items-center gap-1 font-medium hover:text-coal-950">
            <ArrowLeft className="size-4" /> Menu
          </Link>
          <span>/</span>
          <Link to={`/menu#${item.category_slug}`} className="hover:text-coal-950">
            {item.category_name}
          </Link>
        </nav>

        <div className="mt-6 grid gap-8 lg:grid-cols-2 lg:gap-12">
          <div className="aspect-square overflow-hidden rounded-[2rem] lg:aspect-[4/3.6]">
            <FoodImage src={item.image_url} name={item.name} category={item.category_name} rounded="rounded-[2rem]" iconClassName="max-h-28 max-w-28" />
          </div>

          <div className="flex flex-col">
            {highlights.length > 0 && (
              <div className="flex gap-2">
                {highlights.map((t) => (
                  <span key={t} className="rounded-full bg-coal-950 px-3 py-1 text-xs font-bold tracking-wide text-ember-300 uppercase">
                    {TAG_LABEL[t]}
                  </span>
                ))}
              </div>
            )}
            <h1 className="mt-3 font-display text-4xl leading-tight font-extrabold tracking-tight sm:text-5xl">{item.name}</h1>
            <p className="mt-3 font-display text-3xl font-bold text-ember-600">{money(item.price)}</p>
            <TagChips tags={item.tags} className="mt-4" />
            {item.description && <p className="mt-5 text-lg leading-relaxed text-stone-600">{item.description}</p>}
            {item.prep_minutes > 0 && (
              <p className="mt-4 inline-flex items-center gap-2 text-sm text-stone-500">
                <Clock className="size-4" /> About {item.prep_minutes} minutes on the grill
              </p>
            )}

            {item.sold_out ? (
              <div className="mt-8 rounded-2xl bg-stone-100 px-5 py-4 text-stone-700">
                <p className="font-semibold">Sold out right now</p>
                <p className="text-sm">We have run out for today. Check back soon or try something else below.</p>
              </div>
            ) : (
              <div className="mt-8 space-y-4 rounded-3xl bg-white p-5 ring-1 ring-stone-200">
                <label className="block">
                  <span className="text-sm font-medium">Special requests</span>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value.slice(0, 200))}
                    rows={2}
                    placeholder="Extra pepper, no onions, well done…"
                    className="mt-1.5 w-full rounded-xl border-0 bg-stone-50 px-3.5 py-2.5 text-sm ring-1 ring-stone-200 focus:ring-2 focus:ring-ember-500 focus:outline-none"
                  />
                </label>
                <div className="flex items-center justify-between gap-4">
                  <QuantityStepper value={quantity} min={1} onChange={setQuantity} />
                  <Button size="lg" className="flex-1" onClick={addToCart}>
                    Add to order · {money(item.price * quantity)}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>

        {related.length > 0 && (
          <section className="mt-16">
            <h2 className="font-display text-2xl font-extrabold tracking-tight">More from {item.category_name}</h2>
            <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {related.map((r) => (
                <ItemCard key={r.id} item={r} categoryName={item.category_name} />
              ))}
            </div>
          </section>
        )}
      </div>
    </>
  );
}
