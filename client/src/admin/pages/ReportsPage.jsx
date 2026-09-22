import { Ban, Banknote, CircleCheck, Download, Flame, Percent, Printer, ReceiptText, RotateCcw, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Badge, Button, Card, cx, ErrorState, PageLoader } from '../../components/ui';
import { withQuery } from '../../lib/api';
import { ORDER_TYPE, PAYMENT_METHOD, ROLE_LABEL } from '../../lib/constants';
import { dateTime, dayLabel, money, moneyShort, number, pct } from '../../lib/format';
import { useApi } from '../../lib/hooks';
import { BarList, ChartCard, ColumnChart, SERIES } from '../charts';
import { DateRangePicker, PageHeader, presetRange, StatCard, Table, Td, Th } from '../components';

const hourLabel = (h) => `${String(h).padStart(2, '0')}:00`;

function LeakRow({ icon: Icon, label, value, detail, bad }) {
  return (
    <li className="flex items-start gap-3 py-3">
      <span className={cx('mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg', bad ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700')}>
        {bad ? <Icon className="size-4" /> : <CircleCheck className="size-4" />}
      </span>
      <div className="flex-1">
        <p className="text-sm text-stone-600">{label}</p>
        <p className="font-semibold">{value}</p>
        {detail && <p className="text-xs text-stone-500">{detail}</p>}
      </div>
    </li>
  );
}

function Exports({ range }) {
  const link = (kind) => withQuery('/api/admin/reports/export.csv', { kind, from: range.from, to: range.to });
  return (
    <div className="no-print flex flex-wrap gap-2">
      <a href={withQuery('/api/admin/orders/export.csv', { from: range.from, to: range.to })}>
        <Button size="sm" variant="secondary">
          <Download className="size-4" /> Orders
        </Button>
      </a>
      {[
        ['daily', 'Daily totals'],
        ['items', 'Items sold'],
        ['payments', 'Payments'],
        ['expenses', 'Expenses'],
      ].map(([kind, label]) => (
        <a key={kind} href={link(kind)}>
          <Button size="sm" variant="secondary">
            <Download className="size-4" /> {label}
          </Button>
        </a>
      ))}
      <Button size="sm" variant="dark" onClick={() => window.print()}>
        <Printer className="size-4" /> Print report
      </Button>
    </div>
  );
}

export default function ReportsPage() {
  const [range, setRange] = useState({ preset: '7d', ...presetRange('7d') });
  const [control, setControl] = useState('cancellations');
  const [showAllItems, setShowAllItems] = useState(false);
  const { data, error, loading, reload } = useApi('/api/admin/reports', { from: range.from, to: range.to });

  if (!data && loading) return <PageLoader />;
  if (error && !data) return <ErrorState error={error} onRetry={reload} />;

  const t = data.totals;
  const multiDay = data.daily.length > 1;
  const busyHours = data.by_hour.filter((h) => h.orders > 0);
  const hours = busyHours.length ? data.by_hour.slice(busyHours[0].hour, busyHours.at(-1).hour + 1) : [];
  const items = showAllItems ? data.items : data.items.slice(0, 10);
  const leak = {
    cancellations: data.cancellations,
    refunds: data.refunds,
    discounts: data.discounts,
  };
  const period = data.from === data.to ? dayLabel(data.from, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : `${dayLabel(data.from)} – ${dayLabel(data.to)}`;

  return (
    <div className={cx(loading && 'opacity-60 transition-opacity')}>
      <PageHeader title="Reports" description={period} actions={<Exports range={range} />} />
      <div className="no-print mb-6">
        <DateRangePicker value={range} onChange={setRange} />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Money received" value={money(t.collected)} sub={t.refunded ? `after ${money(t.refunded)} refunds` : `${number(t.orders)} orders`} />
        <StatCard label="Sales" value={money(t.sales)} sub={`${number(t.orders)} orders · ${number(t.items_sold)} items`} />
        <StatCard label="Expenses" value={money(t.expenses)} />
        <StatCard label="Net (received − expenses)" value={money(t.net)} tone={t.net < 0 ? 'danger' : 'good'} />
        <StatCard label="Average order" value={money(t.avg_order)} />
        <StatCard label="Food cost (estimated)" value={t.food_cost ? pct(t.food_cost_pct) : '—'} sub={t.food_cost ? `${money(t.food_cost)} of ingredients from recipes` : 'Add recipes to dishes to see this'} />
        <StatCard label="Delivery fees" value={money(t.delivery_fees)} />
        <StatCard label="Still unpaid" value={money(t.outstanding)} tone={t.outstanding ? 'danger' : undefined} sub={`${t.outstanding_count} order${t.outstanding_count === 1 ? '' : 's'}`} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        {multiDay ? (
          <ChartCard
            className="lg:col-span-2"
            title="Money received and spent each day"
            legend={[
              { label: 'Received', color: SERIES[0] },
              { label: 'Expenses', color: SERIES[1] },
            ]}
            dim={loading}
            table={{
              columns: ['Day', 'Orders', 'Sales', 'Received', 'Expenses', 'Net'],
              rows: data.daily.map((d) => [dayLabel(d.date), d.orders, money(d.sales), money(d.collected), money(d.expenses), money(d.net)]),
            }}
          >
            <ColumnChart
              data={data.daily}
              xKey="date"
              series={[
                { key: 'collected', label: 'received' },
                { key: 'expenses', label: 'expenses' },
              ]}
              formatX={(d) => dayLabel(d, { day: 'numeric', month: 'short' })}
              formatLabel={(d) => dayLabel(d)}
              formatValue={money}
              formatAxis={moneyShort}
              extra={(row) => `${row.orders} orders · net ${money(row.net)}`}
              height={280}
            />
          </ChartCard>
        ) : (
          <ChartCard
            className="lg:col-span-2"
            title="Orders by hour"
            subtitle="When the kitchen is busiest"
            dim={loading}
            table={{ columns: ['Hour', 'Orders', 'Sales'], rows: hours.map((h) => [hourLabel(h.hour), h.orders, money(h.sales)]) }}
          >
            <ColumnChart data={hours} xKey="hour" series={[{ key: 'orders', label: 'orders' }]} formatX={hourLabel} formatValue={(v) => number(v)} extra={(row) => `${money(row.sales)} in sales`} height={280} />
          </ChartCard>
        )}

        <Card className="p-5">
          <h2 className="font-semibold">Leakage & control</h2>
          <p className="text-xs text-stone-500">Every item here is tied to a staff member in the activity log.</p>
          <ul className="mt-1 divide-y divide-stone-100">
            <LeakRow icon={ReceiptText} bad={t.unpaid_completed > 0} label="Served but not paid" value={money(t.unpaid_completed)} detail={`${t.unpaid_completed_count} orders`} />
            <LeakRow icon={Ban} bad={t.cancelled > 0} label="Cancelled orders" value={`${t.cancelled} · ${money(t.cancelled_value)}`} />
            <LeakRow icon={RotateCcw} bad={t.refunded > 0} label="Refunds" value={money(t.refunded)} />
            <LeakRow icon={Percent} bad={t.discounts > 0} label="Discounts given" value={money(t.discounts)} />
            <LeakRow
              icon={Banknote}
              bad={t.cash_variance < 0}
              label={`Cash drawer difference (${t.closed_shifts} shifts)`}
              value={t.cash_variance === 0 ? 'Balanced' : t.cash_variance < 0 ? `Short ${money(-t.cash_variance)}` : `Over ${money(t.cash_variance)}`}
            />
            <LeakRow icon={Trash2} bad={t.waste_cost > 0} label="Stock written off as waste" value={money(t.waste_cost)} />
          </ul>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        {multiDay && (
          <ChartCard
            title="Orders by hour"
            subtitle="When the kitchen is busiest"
            dim={loading}
            table={{ columns: ['Hour', 'Orders', 'Sales'], rows: hours.map((h) => [hourLabel(h.hour), h.orders, money(h.sales)]) }}
          >
            <ColumnChart data={hours} xKey="hour" series={[{ key: 'orders', label: 'orders' }]} formatX={hourLabel} formatValue={(v) => number(v)} extra={(row) => `${money(row.sales)} in sales`} height={220} />
          </ChartCard>
        )}
        <ChartCard title="Sales by category" dim={loading}>
          <BarList rows={data.by_category.map((c) => ({ label: c.category, value: c.sales, note: `${c.quantity}×` }))} formatValue={money} />
        </ChartCard>
        <ChartCard title="How customers paid" subtitle="Money received by method" dim={loading}>
          <BarList
            rows={data.by_method.map((m) => ({ label: PAYMENT_METHOD[m.method], value: m.received - m.refunded, note: `${m.count}` }))}
            formatValue={money}
          />
          <div className="mt-5 grid grid-cols-2 gap-3 border-t border-stone-100 pt-4 text-sm">
            {data.by_type.map((x) => (
              <div key={x.type}>
                <p className="text-stone-500">{ORDER_TYPE[x.type]}</p>
                <p className="font-semibold">
                  {x.orders} · {money(x.sales)}
                </p>
              </div>
            ))}
            {data.by_channel.map((x) => (
              <div key={x.channel}>
                <p className="text-stone-500">{x.channel === 'online' ? 'Website' : 'Counter'}</p>
                <p className="font-semibold">
                  {x.orders} · {money(x.sales)}
                </p>
              </div>
            ))}
          </div>
        </ChartCard>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Card>
          <div className="flex items-center justify-between px-5 pt-4 pb-2">
            <h2 className="font-semibold">Items sold</h2>
            {data.items.length > 10 && (
              <button onClick={() => setShowAllItems(!showAllItems)} className="no-print text-sm font-semibold text-ember-700">
                {showAllItems ? 'Top 10' : `All ${data.items.length}`}
              </button>
            )}
          </div>
          <Table>
            <thead>
              <tr>
                <Th>Dish</Th>
                <Th align="right">Sold</Th>
                <Th align="right">Sales</Th>
              </tr>
            </thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.name}>
                  <Td>{i.name}</Td>
                  <Td align="right">{i.quantity}</Td>
                  <Td align="right" className="font-semibold">
                    {money(i.sales)}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>

        <Card>
          <h2 className="px-5 pt-4 pb-2 font-semibold">Staff</h2>
          <Table>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th align="right">Orders taken</Th>
                <Th align="right">Money collected</Th>
                <Th align="right">Cancelled</Th>
                <Th align="right">Refunds</Th>
                <Th align="right">Discounts</Th>
              </tr>
            </thead>
            <tbody>
              {data.by_staff.map((s) => (
                <tr key={s.id}>
                  <Td>
                    <p className="font-medium">{s.name}</p>
                    <p className="text-xs text-stone-500">{ROLE_LABEL[s.role]}</p>
                  </Td>
                  <Td align="right">{s.orders_taken}</Td>
                  <Td align="right" className="font-semibold">
                    {money(s.collected)}
                  </Td>
                  <Td align="right" className={cx(s.cancellations > 0 && 'text-rose-700')}>
                    {s.cancellations}
                  </Td>
                  <Td align="right" className={cx(s.refunds > 0 && 'text-rose-700')}>
                    {money(s.refunds)}
                  </Td>
                  <Td align="right">{money(s.discounts)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Card>
          <div className="no-print flex gap-1 px-4 pt-4">
            {[
              ['cancellations', `Cancellations (${data.cancellations.length})`],
              ['refunds', `Refunds (${data.refunds.length})`],
              ['discounts', `Discounts (${data.discounts.length})`],
            ].map(([key, label]) => (
              <button key={key} onClick={() => setControl(key)} className={cx('rounded-xl px-3 py-1.5 text-sm font-semibold', control === key ? 'bg-coal-950 text-white' : 'text-stone-600 hover:bg-stone-100')}>
                {label}
              </button>
            ))}
          </div>
          {leak[control].length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-stone-500">None in this period.</p>
          ) : (
            <Table className="mt-2">
              <thead>
                <tr>
                  <Th>Order</Th>
                  <Th>When</Th>
                  <Th>By</Th>
                  <Th>Reason</Th>
                  <Th align="right">Amount</Th>
                </tr>
              </thead>
              <tbody>
                {leak[control].map((r) => (
                  <tr key={r.id}>
                    <Td className="font-semibold">#{r.order_number}</Td>
                    <Td className="whitespace-nowrap text-stone-600">{dateTime(r.created_at)}</Td>
                    <Td>{r.cancelled_by ?? r.user_name ?? '—'}</Td>
                    <Td className="max-w-56 text-stone-600">{r.cancel_reason ?? r.note ?? r.discount_reason}</Td>
                    <Td align="right" className="font-semibold">
                      {money(r.total ?? r.amount ?? r.discount)}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>

        <Card>
          <h2 className="px-5 pt-4 pb-2 font-semibold">Cash shifts</h2>
          {data.shifts.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-stone-500">No shifts in this period.</p>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Opened</Th>
                  <Th>Staff</Th>
                  <Th align="right">Expected</Th>
                  <Th align="right">Counted</Th>
                  <Th align="right">Difference</Th>
                </tr>
              </thead>
              <tbody>
                {data.shifts.map((s) => (
                  <tr key={s.id}>
                    <Td className="whitespace-nowrap text-stone-600">{dateTime(s.opened_at)}</Td>
                    <Td>{s.user_name}</Td>
                    <Td align="right">{s.expected_cash === null ? '—' : money(s.expected_cash)}</Td>
                    <Td align="right">{s.counted_cash === null ? '—' : money(s.counted_cash)}</Td>
                    <Td align="right">
                      {s.status === 'open' ? (
                        <Badge tone="emerald">Open</Badge>
                      ) : s.variance === 0 ? (
                        <span className="text-emerald-700">Balanced</span>
                      ) : (
                        <span className={cx('font-semibold', s.variance < 0 ? 'text-rose-700' : 'text-amber-700')}>
                          {s.variance < 0 ? 'Short ' : 'Over '}
                          {money(Math.abs(s.variance))}
                        </span>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      </div>

      {data.expenses_by_category.length > 0 && (
        <ChartCard className="mt-4" title="Where the money went" subtitle={`${money(t.expenses)} in expenses`}>
          <BarList rows={data.expenses_by_category.map((e) => ({ label: e.category, value: e.total, note: `${e.count}` }))} formatValue={money} />
        </ChartCard>
      )}
      <p className="mt-6 flex items-center gap-2 text-xs text-stone-500">
        <Flame className="size-3.5" /> Sales count every order that was not cancelled. Money received counts payments actually taken, minus refunds, on the day they were taken.
      </p>
    </div>
  );
}
