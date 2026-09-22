import { ClipboardList, Download, Globe, Search, Store } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Button, Card, cx, EmptyState, ErrorState, PageLoader } from '../../components/ui';
import { withQuery } from '../../lib/api';
import { ORDER_TYPE } from '../../lib/constants';
import { dateTime, money, time, timeAgo } from '../../lib/format';
import { useApi } from '../../lib/hooks';
import { useAuth } from '../auth';
import { DateRangePicker, PageHeader, Pagination, PaymentBadge, presetRange, StatusBadge, Table, Td, Th } from '../components';
import { useLiveOrders } from '../live';
import OrderDrawer from '../OrderDrawer';

const TABS = [
  { value: 'active', label: 'In progress', dated: false },
  { value: 'pending', label: 'New', dated: false },
  { value: 'unpaid', label: 'Unpaid', dated: true },
  { value: 'completed', label: 'Completed', dated: true },
  { value: 'cancelled', label: 'Cancelled', dated: true },
  { value: 'all', label: 'All', dated: true },
];

export default function OrdersPage() {
  const { can } = useAuth();
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState(() => (TABS.some((t) => t.value === params.get('tab')) ? params.get('tab') : 'active'));
  const [range, setRange] = useState({ preset: 'today', ...presetRange('today') });
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const openId = params.get('open') ? Number(params.get('open')) : null;
  const dated = TABS.find((t) => t.value === tab).dated || Boolean(search);

  useEffect(() => {
    const t = setTimeout(() => setSearch(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => {
    setPage(1);
  }, [tab, range, search]);

  const query = {
    status: tab === 'unpaid' ? 'all' : tab,
    payment: tab === 'unpaid' ? 'unpaid' : undefined,
    from: dated && !search ? range.from : undefined,
    to: dated && !search ? range.to : undefined,
    q: search || undefined,
    page,
    pageSize: 50,
  };
  const { data, error, loading, reload } = useApi('/api/admin/orders', query);

  // Coalesce bursts of live events into a single refresh.
  const pendingReload = useRef(null);
  useLiveOrders(() => {
    clearTimeout(pendingReload.current);
    pendingReload.current = setTimeout(reload, 400);
  });

  const open = (id) => setParams(id ? { open: String(id) } : {});

  return (
    <>
      <PageHeader
        title="Orders"
        description="Every order from the website and the counter, updated live."
        actions={
          <>
            {can('reports.view') && (
              <a href={withQuery('/api/admin/orders/export.csv', { from: range.from, to: range.to })}>
                <Button variant="secondary" size="sm">
                  <Download className="size-4" /> Export CSV
                </Button>
              </a>
            )}
            {can('orders.create') && (
              <Link to="/admin/pos">
                <Button size="sm">New sale</Button>
              </Link>
            )}
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex max-w-full gap-1 overflow-x-auto rounded-2xl bg-white p-1 ring-1 ring-stone-200 scrollbar-none">
          {TABS.map((t) => (
            <button
              key={t.value}
              onClick={() => setTab(t.value)}
              className={cx('rounded-xl px-3.5 py-2 text-sm font-semibold whitespace-nowrap', tab === t.value ? 'bg-coal-950 text-white' : 'text-stone-600 hover:bg-stone-100')}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="relative min-w-52 flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-stone-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Order #, name or phone"
            className="h-11 w-full rounded-xl border-0 bg-white pr-3 pl-9 text-sm ring-1 ring-stone-200 focus:ring-2 focus:ring-ember-500 focus:outline-none"
          />
        </div>
      </div>
      {dated && !search && (
        <div className="mb-4">
          <DateRangePicker value={range} onChange={setRange} />
        </div>
      )}

      <Card>
        {loading && !data ? (
          <PageLoader />
        ) : error ? (
          <div className="p-4">
            <ErrorState error={error} onRetry={reload} />
          </div>
        ) : data.rows.length === 0 ? (
          <EmptyState icon={ClipboardList} title={tab === 'active' ? 'No orders in progress' : 'No orders here'}>
            {tab === 'active' ? 'New orders from the website and the counter appear here instantly.' : 'Try another tab or date range.'}
          </EmptyState>
        ) : (
          <>
            {/* Phones: cards */}
            <ul className="divide-y divide-stone-100 md:hidden">
              {data.rows.map((o) => (
                <li key={o.id}>
                  <button onClick={() => open(o.id)} className="w-full px-4 py-3 text-left">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-display font-bold">#{o.order_number}</span>
                      <span className="font-semibold tabular-nums">{money(o.total)}</span>
                    </div>
                    <p className="mt-0.5 truncate text-sm text-stone-600">{o.summary}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-stone-500">
                      <StatusBadge status={o.status} />
                      <PaymentBadge status={o.payment_status} />
                      <span>
                        {ORDER_TYPE[o.type]} · {timeAgo(o.created_at)}
                      </span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
            {/* Larger screens: table */}
            <Table className="hidden md:block">
              <thead>
                <tr>
                  <Th>Order</Th>
                  <Th>Customer</Th>
                  <Th>Items</Th>
                  <Th>Type</Th>
                  <Th align="right">Total</Th>
                  <Th>Payment</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((o) => (
                  <tr key={o.id} onClick={() => open(o.id)} className={cx('cursor-pointer hover:bg-stone-50', o.status === 'pending' && 'bg-amber-50/60')}>
                    <Td>
                      <p className="font-display font-bold">#{o.order_number}</p>
                      <p className="text-xs text-stone-500" title={dateTime(o.created_at)}>
                        {dated ? dateTime(o.created_at) : `${time(o.created_at)} · ${timeAgo(o.created_at)}`}
                      </p>
                    </Td>
                    <Td>
                      <p className="max-w-40 truncate">{o.customer_name || (o.table_number ? `Table ${o.table_number}` : 'Walk-in')}</p>
                      {o.customer_phone && <p className="text-xs text-stone-500">{o.customer_phone}</p>}
                    </Td>
                    <Td>
                      <p className="max-w-64 truncate text-stone-600" title={o.summary}>
                        {o.summary}
                      </p>
                    </Td>
                    <Td>
                      <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                        {o.channel === 'online' ? <Globe className="size-3.5 text-sky-600" /> : <Store className="size-3.5 text-stone-500" />}
                        {ORDER_TYPE[o.type]}
                      </span>
                    </Td>
                    <Td align="right" className="font-semibold">
                      {money(o.total)}
                    </Td>
                    <Td>
                      <PaymentBadge status={o.payment_status} />
                    </Td>
                    <Td>
                      <StatusBadge status={o.status} />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <Pagination page={data.page} pageSize={data.pageSize} count={data.count} onChange={setPage} />
          </>
        )}
      </Card>

      <OrderDrawer orderId={openId} onClose={() => open(null)} onChanged={reload} />
    </>
  );
}
