import { ArrowRight, Bike, Clock, CreditCard, MapPin, Phone, Radio, ShoppingBag, Store, UtensilsCrossed } from 'lucide-react';
import { Link } from 'react-router';
import { FoodImage } from '../components/FoodImage';
import Seo from '../components/Seo';
import { cx } from '../components/ui';
import { DAYS } from '../lib/constants';
import { money } from '../lib/format';
import { useSettings } from '../lib/settings';
import ItemCard from './ItemCard';
import { mapsLink, OpenPill, recentOrders, useMenu, whatsappLink } from './shared';

function HeroArt({ featured, heroImage, name }) {
  if (heroImage) {
    return (
      <div className="relative mx-auto aspect-[4/5] w-full max-w-md overflow-hidden rounded-[2rem] ring-1 ring-white/10 lg:max-w-none">
        <img src={heroImage} alt={name} className="size-full object-cover" fetchPriority="high" />
        <div className="absolute inset-0 bg-linear-to-t from-coal-950/60 via-transparent" />
      </div>
    );
  }
  const [a, b, c] = featured;
  // A mosaic: one tall dish beside two stacked ones, each captioned over its own photo.
  const tile = (item, className) =>
    item && (
      <Link
        to={`/menu/${item.slug}`}
        className={cx('group relative block overflow-hidden rounded-[1.75rem] shadow-2xl ring-1 ring-white/10', className)}
      >
        <FoodImage src={item.image_url} name={item.name} rounded="rounded-none" className="transition duration-500 group-hover:scale-[1.04]" />
        <div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-coal-950/90 via-coal-950/50 to-transparent px-4 pt-10 pb-4">
          <p className="text-sm leading-snug font-semibold text-white">{item.name}</p>
          <p className="text-sm font-bold text-ember-300">{money(item.price)}</p>
        </div>
      </Link>
    );
  if (!a) return null;
  return (
    <div className="mx-auto grid w-full max-w-md grid-cols-2 gap-4 lg:max-w-none">
      {tile(a, 'row-span-2 min-h-[22rem] sm:min-h-[28rem]')}
      {tile(b, 'aspect-square translate-y-6')}
      {tile(c, 'aspect-square translate-y-6')}
    </div>
  );
}

function Hero({ settings, featured }) {
  const r = settings.restaurant;
  const o = settings.ordering;
  const modes = [
    o.delivery && { icon: Bike, label: 'Delivery' },
    o.pickup && { icon: ShoppingBag, label: 'Pickup' },
    o.dineIn && { icon: Store, label: 'Dine-in' },
  ].filter(Boolean);

  return (
    <section className="ember-glow relative overflow-hidden text-white">
      <div className="grain absolute inset-0" />
      <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 pt-12 pb-16 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:pt-20 lg:pb-24">
        <div>
          <OpenPill status={settings.status} />
          <h1 className="mt-6 font-display text-[2.6rem] leading-[1.02] font-extrabold tracking-tight text-balance sm:text-6xl lg:text-[4.25rem]">
            {r.tagline || r.name}
          </h1>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-stone-300 sm:text-lg">{r.description}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              to="/menu"
              className="inline-flex h-13 items-center gap-2 rounded-full bg-ember-500 px-7 text-base font-semibold text-white shadow-lg shadow-ember-900/40 transition hover:bg-ember-600"
            >
              Order now <ArrowRight className="size-5" />
            </Link>
            <a
              href="#favourites"
              className="inline-flex h-13 items-center rounded-full px-6 text-base font-semibold text-white ring-1 ring-white/25 transition hover:bg-white/10"
            >
              See the favourites
            </a>
          </div>
          <dl className="mt-10 flex flex-wrap gap-x-8 gap-y-4 text-sm">
            {modes.length > 0 && (
              <div>
                <dt className="text-stone-400">Order for</dt>
                <dd className="mt-1 flex items-center gap-3 font-semibold">
                  {modes.map((m) => (
                    <span key={m.label} className="inline-flex items-center gap-1.5">
                      <m.icon className="size-4 text-ember-400" /> {m.label}
                    </span>
                  ))}
                </dd>
              </div>
            )}
            <div>
              <dt className="text-stone-400">Ready in about</dt>
              <dd className="mt-1 inline-flex items-center gap-1.5 font-semibold">
                <Clock className="size-4 text-ember-400" /> {o.estimatedMinutes} minutes
              </dd>
            </div>
            {o.delivery && (
              <div>
                <dt className="text-stone-400">Delivery fee</dt>
                <dd className="mt-1 font-semibold">{o.deliveryFee ? money(o.deliveryFee) : 'Free'}</dd>
              </div>
            )}
          </dl>
        </div>
        <HeroArt featured={featured} heroImage={r.heroImageUrl} name={r.name} />
      </div>
    </section>
  );
}

function RecentOrderBanner() {
  const recent = recentOrders()[0];
  if (!recent || Date.now() - new Date(recent.at).getTime() > 6 * 3600 * 1000) return null;
  return (
    <div className="mx-auto max-w-6xl px-4 pt-6 sm:px-6">
      <Link
        to={`/track/${recent.number}?t=${recent.token}`}
        className="flex items-center justify-between gap-3 rounded-2xl bg-white px-5 py-4 ring-1 ring-ember-200 transition hover:ring-ember-400"
      >
        <span className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-full bg-ember-100 text-ember-600">
            <Radio className="size-5" />
          </span>
          <span>
            <span className="block font-semibold">Order #{recent.number}</span>
            <span className="text-sm text-stone-500">Follow it live from the grill to you</span>
          </span>
        </span>
        <ArrowRight className="size-5 text-ember-600" />
      </Link>
    </div>
  );
}

const STEPS = [
  { icon: UtensilsCrossed, title: 'Pick your grills', body: 'Browse the full menu with prices. What you see is what you pay.' },
  { icon: CreditCard, title: 'Pay your way', body: 'Pay online, by bank transfer, or with cash or card when your food arrives.' },
  { icon: Radio, title: 'Track it live', body: 'Watch your order go from accepted to on the grill to on its way.' },
];

export default function HomePage() {
  const { settings } = useSettings();
  const { categories } = useMenu();
  const r = settings.restaurant;
  const allItems = (categories ?? []).flatMap((c) => c.items.map((i) => ({ ...i, category_name: c.name })));
  const featured = [...allItems.filter((i) => i.featured), ...allItems.filter((i) => !i.featured)].filter((i) => !i.sold_out).slice(0, 6);
  const todayIdx = new Date().getDay();

  return (
    <>
      <Seo />
      <Hero settings={settings} featured={featured} />
      <RecentOrderBanner />

      <section id="favourites" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16 sm:px-6 lg:py-20">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold tracking-wider text-ember-600 uppercase">Crowd favourites</p>
            <h2 className="mt-2 font-display text-3xl font-extrabold tracking-tight sm:text-4xl">Hot off the grill</h2>
          </div>
          <Link to="/menu" className="inline-flex items-center gap-1.5 text-sm font-semibold text-coal-900 hover:text-ember-600">
            Full menu <ArrowRight className="size-4" />
          </Link>
        </div>
        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {featured.map((item) => (
            <ItemCard key={item.id} item={item} categoryName={item.category_name} />
          ))}
        </div>
        {categories?.length > 0 && (
          <div className="mt-10 flex flex-wrap gap-2">
            {categories.map((c) => (
              <Link
                key={c.id}
                to={`/menu#${c.slug}`}
                className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-coal-800 ring-1 ring-stone-200 transition hover:bg-coal-950 hover:text-white hover:ring-coal-950"
              >
                {c.name} <span className="text-stone-400">· {c.items.length}</span>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="bg-white">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-16 sm:px-6 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <div key={s.title} className="flex gap-4">
              <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-coal-950 text-ember-400">
                <s.icon className="size-6" />
              </div>
              <div>
                <p className="text-xs font-bold tracking-wider text-stone-400 uppercase">Step {i + 1}</p>
                <h3 className="mt-1 font-display text-lg font-bold">{s.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-stone-600">{s.body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:py-20">
        <div id="about" className="scroll-mt-20">
          <p className="text-sm font-semibold tracking-wider text-ember-600 uppercase">About us</p>
          <h2 className="mt-2 font-display text-3xl font-extrabold tracking-tight sm:text-4xl">{r.name}</h2>
          <p className="mt-4 text-base leading-relaxed text-stone-600">{r.description}</p>
          {r.cuisine?.length > 0 && (
            <div className="mt-6 flex flex-wrap gap-2">
              {r.cuisine.map((c) => (
                <span key={c} className="rounded-full bg-ember-50 px-3 py-1 text-sm font-medium text-ember-800 ring-1 ring-ember-200">
                  {c}
                </span>
              ))}
            </div>
          )}
          <div className="mt-8 flex flex-wrap gap-3">
            {r.phone && (
              <a href={`tel:${r.phone.replace(/\s/g, '')}`} className="inline-flex h-11 items-center gap-2 rounded-full bg-coal-950 px-5 text-sm font-semibold text-white hover:bg-coal-800">
                <Phone className="size-4" /> Call {r.phone}
              </a>
            )}
            {r.whatsapp && (
              <a
                href={whatsappLink(r.whatsapp, `Hi ${r.name}!`)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-11 items-center gap-2 rounded-full bg-emerald-600 px-5 text-sm font-semibold text-white hover:bg-emerald-700"
              >
                WhatsApp us
              </a>
            )}
          </div>
        </div>

        <div id="visit" className="scroll-mt-20 overflow-hidden rounded-3xl bg-white ring-1 ring-stone-200">
          {r.mapEmbedUrl ? (
            <iframe title={`Map to ${r.name}`} src={r.mapEmbedUrl} className="h-56 w-full border-0" loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
          ) : (
            <a href={mapsLink(r)} target="_blank" rel="noreferrer" className="ember-glow flex h-40 items-center justify-center gap-2 font-semibold text-white">
              <MapPin className="size-5 text-ember-400" /> Get directions on Google Maps
            </a>
          )}
          <div className="grid gap-6 p-6 sm:grid-cols-2">
            <div>
              <h3 className="font-display text-lg font-bold">Find us</h3>
              <address className="mt-2 text-sm leading-relaxed text-stone-600 not-italic">
                {r.address}
                <br />
                {[r.city, r.state].filter(Boolean).join(', ')}
              </address>
              <a href={mapsLink(r)} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-ember-600 hover:text-ember-700">
                Directions <ArrowRight className="size-4" />
              </a>
            </div>
            <div>
              <h3 className="font-display text-lg font-bold">Opening hours</h3>
              <ul className="mt-2 space-y-1 text-sm">
                {settings.hours.map((h) => (
                  <li key={h.day} className={cx('flex justify-between gap-3', h.day === todayIdx ? 'font-semibold text-coal-950' : 'text-stone-600')}>
                    <span>{DAYS[h.day].slice(0, 3)}</span>
                    <span className="tabular-nums">{h.closed ? 'Closed' : `${h.open} – ${h.close}`}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className="px-4 pb-16 sm:px-6">
        <div className="ember-glow relative mx-auto max-w-6xl overflow-hidden rounded-[2rem] px-6 py-12 text-center text-white sm:py-16">
          <div className="grain absolute inset-0" />
          <h2 className="relative font-display text-3xl font-extrabold tracking-tight sm:text-5xl">Hungry? The grill is hot.</h2>
          <p className="relative mx-auto mt-3 max-w-md text-stone-300">Order in a minute, pay how you like, and follow your food live.</p>
          <Link
            to="/menu"
            className="relative mt-8 inline-flex h-13 items-center gap-2 rounded-full bg-ember-500 px-8 font-semibold text-white shadow-lg shadow-ember-900/40 transition hover:bg-ember-600"
          >
            Start your order <ArrowRight className="size-5" />
          </Link>
        </div>
      </section>
    </>
  );
}
