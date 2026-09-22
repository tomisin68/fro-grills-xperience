import { MapPin, Phone, ShoppingBag } from 'lucide-react';
import { Link, NavLink, Outlet, useLocation } from 'react-router';
import { cx } from '../components/ui';
import { useCart } from '../lib/cart';
import { DAYS } from '../lib/constants';
import { money } from '../lib/format';
import { useSettings } from '../lib/settings';
import CartDrawer from './CartDrawer';
import { Logo, mapsLink, OpenPill, SocialLinks, whatsappLink } from './shared';

function Header() {
  const { settings } = useSettings();
  const cart = useCart();
  const navClass = ({ isActive }) =>
    cx('rounded-full px-3.5 py-2 text-sm font-medium transition', isActive ? 'text-white' : 'text-stone-400 hover:text-white');

  return (
    <header className="no-print sticky top-0 z-40 border-b border-white/5 bg-coal-950/90 text-white backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link to="/" aria-label={`${settings.restaurant.name} home`}>
          <Logo name={settings.restaurant.name} />
        </Link>
        <nav className="hidden items-center gap-1 md:flex">
          <NavLink to="/menu" className={navClass}>
            Menu
          </NavLink>
          <a href="/#about" className={navClass({ isActive: false })}>
            About
          </a>
          <a href="/#visit" className={navClass({ isActive: false })}>
            Hours &amp; location
          </a>
        </nav>
        <div className="flex items-center gap-3">
          <div className="hidden lg:block">
            <OpenPill status={settings.status} />
          </div>
          <button
            onClick={() => cart.setOpen(true)}
            className="relative inline-flex h-10 items-center gap-2 rounded-full bg-ember-500 pr-4 pl-3.5 text-sm font-semibold text-white transition hover:bg-ember-600"
            aria-label={`Cart, ${cart.count} items`}
          >
            <ShoppingBag className="size-[18px]" />
            <span className="hidden sm:inline">{cart.count ? money(cart.subtotal) : 'Cart'}</span>
            {cart.count > 0 && (
              <span className="grid size-5 place-items-center rounded-full bg-white text-[11px] font-bold text-ember-600">{cart.count}</span>
            )}
          </button>
        </div>
      </div>
    </header>
  );
}

function Footer() {
  const { settings } = useSettings();
  const r = settings.restaurant;
  return (
    <footer className="no-print ember-glow text-stone-300">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <Logo name={r.name} />
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-stone-400">{r.description}</p>
          <SocialLinks social={r.social} className="mt-6" />
        </div>
        <div className="text-sm">
          <h3 className="font-display text-base font-bold text-white">Visit us</h3>
          <a href={mapsLink(r)} target="_blank" rel="noreferrer" className="mt-3 flex gap-2 hover:text-white">
            <MapPin className="mt-0.5 size-4 shrink-0 text-ember-400" />
            <span>{[r.address, r.city, r.state].filter(Boolean).join(', ')}</span>
          </a>
          {r.phone && (
            <a href={`tel:${r.phone.replace(/\s/g, '')}`} className="mt-3 flex gap-2 hover:text-white">
              <Phone className="mt-0.5 size-4 shrink-0 text-ember-400" />
              {r.phone}
            </a>
          )}
          {r.whatsapp && (
            <a href={whatsappLink(r.whatsapp)} target="_blank" rel="noreferrer" className="mt-3 inline-block font-semibold text-emerald-400 hover:text-emerald-300">
              Chat with us on WhatsApp
            </a>
          )}
          {r.email && <p className="mt-3 text-stone-400">{r.email}</p>}
        </div>
        <div className="text-sm">
          <h3 className="font-display text-base font-bold text-white">Opening hours</h3>
          <ul className="mt-3 space-y-1.5">
            {settings.hours.map((h) => (
              <li key={h.day} className="flex justify-between gap-4">
                <span className="text-stone-400">{DAYS[h.day]}</span>
                <span className="tabular-nums">{h.closed ? 'Closed' : `${h.open} – ${h.close}`}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="border-t border-white/5">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-5 text-xs text-stone-500 sm:px-6">
          <p>
            © {new Date().getFullYear()} {r.name}. All rights reserved.
          </p>
          <Link to="/admin" className="hover:text-stone-300">
            Staff sign in
          </Link>
        </div>
      </div>
    </footer>
  );
}

/** Sticky basket summary for phones, where the header button is small. */
function MobileCartBar() {
  const cart = useCart();
  const { pathname } = useLocation();
  if (!cart.count || cart.open || pathname.startsWith('/checkout') || pathname.startsWith('/track')) return null;
  return (
    <div className="no-print fixed inset-x-0 bottom-0 z-30 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:hidden">
      <button
        onClick={() => cart.setOpen(true)}
        className="flex h-14 w-full animate-pop items-center justify-between rounded-2xl bg-ember-500 px-5 font-semibold text-white shadow-xl shadow-ember-900/30"
      >
        <span className="flex items-center gap-2">
          <span className="grid size-7 place-items-center rounded-full bg-white/20 text-sm">{cart.count}</span>
          View your order
        </span>
        <span>{money(cart.subtotal)}</span>
      </button>
    </div>
  );
}

export default function PublicLayout() {
  return (
    <div className="flex min-h-dvh flex-col">
      <Header />
      <main className="flex-1">
        <Outlet />
      </main>
      <Footer />
      <MobileCartBar />
      <CartDrawer />
    </div>
  );
}
