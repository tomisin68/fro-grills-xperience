import { Search, UtensilsCrossed, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router';
import Seo from '../components/Seo';
import { cx, EmptyState, ErrorState, PageLoader } from '../components/ui';
import { useSettings } from '../lib/settings';
import ItemCard from './ItemCard';
import { OpenPill, useMenu } from './shared';

const FILTERS = [
  { value: '', label: 'Everything' },
  { value: 'popular', label: 'Popular' },
  { value: 'spicy', label: 'Spicy' },
  { value: 'vegetarian', label: 'Vegetarian' },
];

export default function MenuPage() {
  const { settings } = useSettings();
  const { categories, error, loading } = useMenu();
  const { hash } = useLocation();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('');
  const [active, setActive] = useState(null);

  const sections = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (categories ?? [])
      .map((c) => ({
        ...c,
        items: c.items.filter(
          (i) =>
            (!q || i.name.toLowerCase().includes(q) || i.description.toLowerCase().includes(q)) &&
            (!filter || i.tags.includes(filter) || (filter === 'popular' && i.featured)),
        ),
      }))
      .filter((c) => c.items.length);
  }, [categories, query, filter]);

  // Deep links like /menu#drinks scroll to the section once it exists.
  useEffect(() => {
    if (!hash || !categories) return;
    document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth' });
  }, [hash, categories]);

  // Highlight the category currently on screen.
  useEffect(() => {
    if (!sections.length) return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible) setActive(visible.target.id);
      },
      { rootMargin: '-140px 0px -55% 0px' },
    );
    sections.forEach((s) => {
      const el = document.getElementById(s.slug);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [sections]);

  const jump = (slug) => {
    setActive(slug);
    document.getElementById(slug)?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <>
      <Seo title="Menu" description={`Browse the full ${settings.restaurant.name} menu with prices and order online.`} />
      <section className="ember-glow text-white">
        <div className="mx-auto max-w-6xl px-4 pt-10 pb-8 sm:px-6">
          <OpenPill status={settings.status} />
          <h1 className="mt-4 font-display text-4xl font-extrabold tracking-tight sm:text-5xl">Our menu</h1>
          <p className="mt-2 max-w-xl text-stone-300">Everything is cooked to order. Prices include everything except delivery.</p>
          <div className="relative mt-6 max-w-md">
            <Search className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-stone-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search suya, jollof, fish…"
              aria-label="Search the menu"
              className="h-12 w-full rounded-full border-0 bg-white/10 pr-10 pl-12 text-white ring-1 ring-white/15 placeholder:text-stone-400 focus:bg-white/15 focus:ring-2 focus:ring-ember-500 focus:outline-none"
            />
            {query && (
              <button onClick={() => setQuery('')} className="absolute top-1/2 right-3 -translate-y-1/2 rounded-full p-1 text-stone-400 hover:text-white" aria-label="Clear search">
                <X className="size-4" />
              </button>
            )}
          </div>
        </div>
      </section>

      <div className="sticky top-16 z-30 border-b border-stone-200 bg-cream/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center gap-2 overflow-x-auto px-4 py-3 scrollbar-none sm:px-6">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={cx(
                'shrink-0 rounded-full px-3.5 py-1.5 text-sm font-semibold transition',
                filter === f.value ? 'bg-ember-500 text-white' : 'bg-white text-stone-600 ring-1 ring-stone-200 hover:text-coal-950',
              )}
            >
              {f.label}
            </button>
          ))}
          <span className="mx-1 h-5 w-px shrink-0 bg-stone-300" />
          {sections.map((c) => (
            <button
              key={c.id}
              onClick={() => jump(c.slug)}
              className={cx(
                'shrink-0 rounded-full px-3.5 py-1.5 text-sm font-semibold transition',
                active === c.slug ? 'bg-coal-950 text-white' : 'text-stone-600 hover:bg-white hover:text-coal-950',
              )}
            >
              {c.name}
            </button>
          ))}
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 pt-8 pb-24 sm:px-6">
        {loading && !categories ? (
          <PageLoader />
        ) : error && !categories ? (
          <ErrorState error={error} onRetry={() => window.location.reload()} />
        ) : sections.length === 0 ? (
          <EmptyState icon={UtensilsCrossed} title="Nothing matches that">
            Try a different word, or clear the search to see the whole menu.
          </EmptyState>
        ) : (
          sections.map((c) => (
            <section key={c.id} id={c.slug} className="scroll-mt-36 pb-12">
              <div className="mb-5">
                <h2 className="font-display text-2xl font-extrabold tracking-tight sm:text-3xl">{c.name}</h2>
                {c.description && <p className="mt-1 text-stone-500">{c.description}</p>}
              </div>
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {c.items.map((item) => (
                  <ItemCard key={item.id} item={item} categoryName={c.name} />
                ))}
              </div>
            </section>
          ))
        )}
      </div>
    </>
  );
}
