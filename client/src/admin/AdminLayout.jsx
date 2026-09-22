import {
  Banknote,
  Bell,
  Boxes,
  ChartColumn,
  ChefHat,
  ClipboardList,
  ExternalLink,
  History,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu as MenuIcon,
  Settings,
  ShoppingCart,
  Users,
  UtensilsCrossed,
  Volume2,
  VolumeX,
  Wallet,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { cx } from '../components/ui';
import { api } from '../lib/api';
import { ROLE_LABEL } from '../lib/constants';
import { money, time } from '../lib/format';
import { useSettings } from '../lib/settings';
import { FlameMark } from '../public/shared';
import { useAuth } from './auth';
import { LiveProvider, useLive, useLiveOrders } from './live';

const NAV = [
  { to: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard, perm: 'dashboard.view' },
  { to: '/admin/orders', label: 'Orders', icon: ClipboardList, perm: 'orders.view', badge: 'pending' },
  { to: '/admin/pos', label: 'New sale', icon: ShoppingCart, perm: 'orders.create' },
  { to: '/admin/kitchen', label: 'Kitchen', icon: ChefHat, perm: 'kitchen.view' },
  { section: 'Manage' },
  { to: '/admin/menu', label: 'Menu', icon: UtensilsCrossed, perm: 'menu.manage' },
  { to: '/admin/inventory', label: 'Inventory', icon: Boxes, perm: 'inventory.view' },
  { to: '/admin/shifts', label: 'Cash shifts', icon: Banknote, perm: 'shifts.use' },
  { to: '/admin/expenses', label: 'Expenses', icon: Wallet, perm: 'expenses.view' },
  { to: '/admin/reports', label: 'Reports', icon: ChartColumn, perm: 'reports.view' },
  { section: 'Admin' },
  { to: '/admin/staff', label: 'Staff', icon: Users, perm: 'staff.manage' },
  { to: '/admin/activity', label: 'Activity log', icon: History, perm: 'audit.view' },
  { to: '/admin/settings', label: 'Settings', icon: Settings, perm: 'settings.manage' },
];

function usePendingCount(enabled) {
  const [count, setCount] = useState(0);
  const load = useCallback(() => {
    if (!enabled) return;
    api.get('/api/admin/orders', { status: 'pending', pageSize: 1 }).then((d) => setCount(d.count)).catch(() => {});
  }, [enabled]);
  useEffect(() => {
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, [load]);
  useLiveOrders(load);
  return count;
}

function Sidebar({ onNavigate }) {
  const { user, can, logout } = useAuth();
  const { settings } = useSettings();
  const pending = usePendingCount(can('orders.view'));
  const navigate = useNavigate();
  // A section heading shows only when at least one link under it is allowed.
  const items = [];
  let heading = null;
  for (const n of NAV) {
    if (n.section) heading = n;
    else if (can(n.perm)) {
      if (heading) items.push(heading);
      heading = null;
      items.push(n);
    }
  }

  return (
    <div className="flex h-full flex-col bg-coal-950 text-stone-300">
      <Link to="/admin" onClick={onNavigate} className="flex items-center gap-2.5 px-5 py-5">
        <FlameMark className="size-9" />
        <span className="leading-tight">
          <span className="block font-display text-[15px] font-extrabold text-white">{settings.restaurant.name}</span>
          <span className="text-xs text-stone-500">Back office</span>
        </span>
      </Link>
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-4">
        {items.map((n) =>
          n.section ? (
            <p key={n.section} className="px-3 pt-5 pb-2 text-[11px] font-bold tracking-wider text-stone-600 uppercase">
              {n.section}
            </p>
          ) : (
            <NavLink
              key={n.to}
              to={n.to}
              onClick={onNavigate}
              className={({ isActive }) =>
                cx(
                  'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition',
                  isActive ? 'bg-white/10 text-white' : 'hover:bg-white/5 hover:text-white',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <n.icon className={cx('size-[18px]', isActive ? 'text-ember-400' : 'text-stone-500')} />
                  <span className="flex-1">{n.label}</span>
                  {n.badge === 'pending' && pending > 0 && (
                    <span className="grid h-5 min-w-5 place-items-center rounded-full bg-ember-500 px-1.5 text-[11px] font-bold text-white">{pending}</span>
                  )}
                </>
              )}
            </NavLink>
          ),
        )}
      </nav>
      <div className="border-t border-white/5 p-3">
        <div className="flex items-center gap-3 rounded-xl px-3 py-2">
          <span className="grid size-9 place-items-center rounded-full bg-ember-500/15 font-display font-bold text-ember-300">
            {user.name.slice(0, 1).toUpperCase()}
          </span>
          <span className="min-w-0 flex-1 leading-tight">
            <span className="block truncate text-sm font-semibold text-white">{user.name}</span>
            <span className="text-xs text-stone-500">{ROLE_LABEL[user.role]}</span>
          </span>
        </div>
        <div className="mt-1 grid grid-cols-3 gap-1">
          <Link to="/" target="_blank" className="flex flex-col items-center gap-1 rounded-lg py-2 text-[11px] hover:bg-white/5 hover:text-white" title="Open the website">
            <ExternalLink className="size-4" /> Website
          </Link>
          <Link to="/admin/account" onClick={onNavigate} className="flex flex-col items-center gap-1 rounded-lg py-2 text-[11px] hover:bg-white/5 hover:text-white">
            <KeyRound className="size-4" /> Password
          </Link>
          <button
            onClick={async () => {
              await logout();
              navigate('/admin/login');
            }}
            className="flex flex-col items-center gap-1 rounded-lg py-2 text-[11px] hover:bg-white/5 hover:text-white"
          >
            <LogOut className="size-4" /> Sign out
          </button>
        </div>
      </div>
    </div>
  );
}

function ShiftChip() {
  const { can, shift } = useAuth();
  if (!can('shifts.use')) return null;
  return (
    <Link
      to="/admin/shifts"
      className={cx(
        'hidden items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ring-1 sm:inline-flex',
        shift ? 'bg-emerald-50 text-emerald-800 ring-emerald-200' : 'bg-amber-50 text-amber-800 ring-amber-200',
      )}
    >
      <span className={cx('size-2 rounded-full', shift ? 'bg-emerald-500' : 'bg-amber-500')} />
      {shift ? `Cash shift open since ${time(shift.opened_at)}` : 'No cash shift open'}
    </Link>
  );
}

function NewOrderAlert() {
  const { lastNew } = useLive();
  const [shown, setShown] = useState(null);
  useEffect(() => {
    if (!lastNew) return undefined;
    setShown(lastNew);
    const t = setTimeout(() => setShown(null), 15000);
    return () => clearTimeout(t);
  }, [lastNew]);
  if (!shown) return null;
  return (
    <div className="fixed top-4 right-4 left-4 z-50 mx-auto max-w-md animate-pop sm:left-auto">
      <div className="flex items-center gap-3 rounded-2xl bg-coal-950 p-4 text-white shadow-2xl ring-1 ring-ember-500/50">
        <span className="grid size-11 shrink-0 animate-pulse place-items-center rounded-full bg-ember-500">
          <Bell className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">New online order #{shown.order_number}</p>
          <p className="truncate text-sm text-stone-400">
            {shown.customer_name} · {money(shown.total)} · {shown.summary}
          </p>
        </div>
        <Link to={`/admin/orders?open=${shown.id}`} onClick={() => setShown(null)} className="rounded-xl bg-ember-500 px-3 py-2 text-sm font-semibold">
          View
        </Link>
        <button onClick={() => setShown(null)} className="text-stone-500 hover:text-white" aria-label="Dismiss">
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}

function Shell() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { connected, soundOn, setSoundOn, testSound } = useLive();
  const { can } = useAuth();
  const { pathname } = useLocation();
  const { settings } = useSettings();
  const current = NAV.find((n) => n.to && pathname.startsWith(n.to));

  return (
    <div className="flex min-h-dvh bg-stone-100">
      <title>{`${current?.label ?? 'Back office'} | ${settings.restaurant.name}`}</title>
      <aside className="no-print fixed inset-y-0 left-0 z-30 hidden w-64 lg:block">
        <Sidebar />
      </aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-coal-950/60" onClick={() => setMobileOpen(false)} />
          <aside className="relative h-full w-72 animate-fade-in">
            <Sidebar onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col lg:pl-64">
        <header className="no-print sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-stone-200 bg-white/90 px-4 backdrop-blur sm:px-6">
          <button onClick={() => setMobileOpen(true)} className="-ml-1 rounded-lg p-2 text-stone-600 hover:bg-stone-100 lg:hidden" aria-label="Open menu">
            <MenuIcon className="size-5" />
          </button>
          <p className="font-display text-base font-bold">{current?.label ?? 'Account'}</p>
          <div className="ml-auto flex items-center gap-2">
            <ShiftChip />
            {(can('orders.view') || can('kitchen.view')) && (
              <>
                <span className="hidden items-center gap-1.5 text-xs text-stone-500 md:inline-flex" title="Live order updates">
                  <span className={cx('size-2 rounded-full', connected ? 'bg-emerald-500' : 'bg-stone-300')} />
                  {connected ? 'Live' : 'Offline'}
                </span>
                <button
                  onClick={() => {
                    setSoundOn(!soundOn);
                    if (!soundOn) testSound();
                  }}
                  className="rounded-lg p-2 text-stone-500 hover:bg-stone-100"
                  title={soundOn ? 'New-order sound is on' : 'New-order sound is off'}
                >
                  {soundOn ? <Volume2 className="size-5" /> : <VolumeX className="size-5" />}
                </button>
              </>
            )}
          </div>
        </header>
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <Outlet />
        </main>
      </div>
      <NewOrderAlert />
    </div>
  );
}

export default function AdminLayout() {
  const { can } = useAuth();
  return (
    <LiveProvider enabled={can('orders.view') || can('kitchen.view')}>
      <meta name="robots" content="noindex, nofollow" />
      <Shell />
    </LiveProvider>
  );
}
