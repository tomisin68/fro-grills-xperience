import { ArrowDownRight, ArrowRight, ArrowUpRight, Ban, Banknote, CircleAlert, CircleCheck, PackageX, ReceiptText, RotateCcw } from 'lucide-react';
import { Link } from 'react-router';
import { Card, cx, ErrorState, PageLoader } from '../../components/ui';
import { ORDER_STATUS } from '../../lib/constants';
import { dayLabel, money, moneyShort, number, timeAgo } from '../../lib/format';
import { useApi } from '../../lib/hooks';
import { BarList, ChartCard, ColumnChart } from '../charts';
import { PageHeader, PaymentBadge, StatusBadge } from '../components';
import { useLiveOrders } from '../live';

function Delta({ now, before, label }) {
  if (!before) return <span className="text-sm text-stone-500">Nothing had been received by this time yesterday</span>;
  const change = ((now - before) / before) * 100;
  const up = change >= 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={cx('inline-flex items-center gap-1 text-sm font-medium', up ? 'text-emerald-700' : 'text-rose-700')}>
      <Icon className="size-4" />
      {up ? '+' : '−'}
      {number(Math.abs(change), 0)}% {label}
    </span>
  );
}

/** One line of the leakage watch: always an icon + words, never colour alone. */
function Watch({ ok, icon: Icon, children, to }) {
  const body = (
    <span className="flex items-start gap-3 py-2.5">
      <span className={cx('mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg', ok ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700')}>
        {ok ? <CircleCheck className="size-4" /> : <Icon className="size-4" />}
      </span>
      <span className="flex-1 text-sm">{children}</span>
      {to && <ArrowRight className="mt-1 size-4 text-stone-400" />}
    </span>
  );
  return <li>{to ? <Link to={to} className="block rounded-lg hover:bg-stone-50">{body}</Link> : body}</li>;
}

export default function DashboardPage() {
  const { data, error, loading, reload } = useApi('/api/admin/dashboard');
  useLiveOrders(() => reload());

  if (loading && !data) return <PageLoader />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  const t = data.totals;
  const y = data.yesterday;
  const active = Object.fromEntries(data.active.map((a) => [a.status, a.count]));
  const trend = data.trend.map((d) => ({ ...d, label: d.date }));

  return (
    <>
      <PageHeader title="Today" description={`${dayLabel(data.today, { weekday: 'long', day: 'numeric', month: 'long' })} · updates live as orders come in`} />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-5 sm:p-6 lg:col-span-2">
          <p className="text-sm text-stone-500">Money received today</p>
          <p className="mt-1 text-5xl font-semibold tracking-tight text-coal-950">{money(t.collected)}</p>
          <div className="mt-2">
            <Delta now={t.collected} before={data.yesterday_so_far.collected} label="vs this time yesterday" />
            <span className="ml-2 text-sm text-stone-500">· {money(y.collected)} all of yesterday</span>
          </div>
          <dl className="mt-6 grid grid-cols-2 gap-4 border-t border-stone-100 pt-5 sm:grid-cols-4">
            {[
              ['Sales', money(t.sales), `${t.orders} orders`],
              ['Average order', money(t.avg_order), `${t.items_sold} items sold`],
              ['Expenses', money(t.expenses), 'Recorded today'],
              ['Net', money(t.net), 'Received − expenses'],
            ].map(([label, value, sub]) => (
              <div key={label}>
                <dt className="text-xs text-stone-500">{label}</dt>
                <dd className={cx('mt-1 text-lg font-semibold', label === 'Net' && t.net < 0 ? 'text-rose-700' : 'text-coal-950')}>{value}</dd>
                <dd className="text-xs text-stone-500">{sub}</dd>
              </div>
            ))}
          </dl>
        </Card>

        <Card className="p-5 sm:p-6">
          <h2 className="font-semibold">Leakage watch</h2>
          <p className="text-xs text-stone-500">Where money usually goes missing</p>
          <ul className="mt-2 divide-y divide-stone-100">
            <Watch ok={!data.unpaid_completed.count} icon={ReceiptText} to="/admin/orders?tab=unpaid">
              {data.unpaid_completed.count ? (
                <>
                  <b>{data.unpaid_completed.count} served orders unpaid</b> · {money(data.unpaid_completed.amount)}
                </>
              ) : (
                'Every served order is paid'
              )}
            </Watch>
            <Watch ok={!t.cancelled} icon={Ban} to="/admin/orders?tab=cancelled">
              {t.cancelled ? (
                <>
                  <b>{t.cancelled} cancelled today</b> · {money(t.cancelled_value)}
                </>
              ) : (
                'No cancellations today'
              )}
            </Watch>
            <Watch ok={!t.refunded} icon={RotateCcw}>
              {t.refunded ? (
                <>
                  <b>{money(t.refunded)} refunded</b> today
                </>
              ) : (
                'No refunds today'
              )}
            </Watch>
            <Watch ok={!data.low_stock.length} icon={PackageX} to="/admin/inventory">
              {data.low_stock.length ? (
                <>
                  <b>{data.low_stock.length} stock items running low</b>
                </>
              ) : (
                'Stock levels are healthy'
              )}
            </Watch>
            <Watch ok icon={Banknote} to="/admin/shifts">
              {data.open_shifts.length ? `${data.open_shifts.length} cash shift${data.open_shifts.length === 1 ? '' : 's'} open: ${data.open_shifts.map((s) => s.user_name).join(', ')}` : 'No cash shifts open'}
            </Watch>
          </ul>
        </Card>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {['pending', 'confirmed', 'preparing', 'ready', 'out_for_delivery'].map((s) => (
          <Link key={s} to={s === 'pending' ? '/admin/orders?tab=pending' : '/admin/orders'} className={cx('rounded-2xl bg-white p-4 ring-1 ring-stone-200/80 hover:ring-stone-300', s === 'pending' && active[s] && 'ring-2 ring-amber-400')}>
            <p className="text-2xl font-semibold">{active[s] ?? 0}</p>
            <p className="mt-1 text-sm text-stone-500">{ORDER_STATUS[s].label}</p>
          </Link>
        ))}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <ChartCard
          className="lg:col-span-2"
          title="Money received, last 14 days"
          subtitle={`${money(data.trend.reduce((s, d) => s + d.collected, 0))} in total`}
          table={{ columns: ['Day', 'Orders', 'Sales', 'Received'], rows: data.trend.map((d) => [dayLabel(d.date), d.orders, money(d.sales), money(d.collected)]) }}
        >
          <ColumnChart
            data={trend}
            xKey="label"
            series={[{ key: 'collected', label: 'received' }]}
            formatX={(d) => dayLabel(d, { day: 'numeric', month: 'short' })}
            formatLabel={(d) => dayLabel(d)}
            formatValue={money}
            formatAxis={moneyShort}
            extra={(row) => `${row.orders} orders · ${money(row.sales)} sales`}
          />
        </ChartCard>
        <ChartCard title="Best sellers today" subtitle="By portions sold">
          <BarList rows={data.top_items.map((i) => ({ label: i.name, value: i.quantity, note: money(i.sales) }))} formatValue={(v) => `${v}×`} empty="No sales yet today" />
        </ChartCard>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="flex items-center justify-between px-5 pt-4 pb-2">
            <h2 className="font-semibold">Latest orders</h2>
            <Link to="/admin/orders" className="text-sm font-semibold text-ember-700 hover:text-ember-800">
              All orders
            </Link>
          </div>
          <ul className="divide-y divide-stone-100">
            {data.recent.map((o) => (
              <li key={o.id}>
                <Link to={`/admin/orders?open=${o.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-stone-50">
                  <span className="w-14 font-semibold">#{o.order_number}</span>
                  <span className="min-w-0 flex-1 truncate text-sm text-stone-600">{o.summary}</span>
                  <span className="hidden text-xs text-stone-500 sm:inline">{timeAgo(o.created_at)}</span>
                  <StatusBadge status={o.status} />
                  <PaymentBadge status={o.payment_status} />
                  <span className="w-24 text-right text-sm font-semibold tabular-nums">{money(o.total)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Running low</h2>
            <Link to="/admin/inventory" className="text-sm font-semibold text-ember-700 hover:text-ember-800">
              Inventory
            </Link>
          </div>
          {data.low_stock.length === 0 ? (
            <p className="mt-6 flex items-center gap-2 text-sm text-stone-600">
              <CircleCheck className="size-4 text-emerald-600" /> Nothing below its reorder level.
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {data.low_stock.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3 rounded-xl bg-rose-50/60 px-3 py-2 text-sm">
                  <span className="flex items-center gap-2">
                    <CircleAlert className="size-4 text-rose-600" /> {s.name}
                  </span>
                  <span className="font-semibold tabular-nums">
                    {number(s.quantity, 2)} {s.unit}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
