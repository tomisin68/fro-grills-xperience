import { History } from 'lucide-react';
import { useState } from 'react';
import { Badge, Card, EmptyState, ErrorState, PageLoader } from '../../components/ui';
import { dateTime } from '../../lib/format';
import { useApi } from '../../lib/hooks';
import { DateRangePicker, PageHeader, Pagination, presetRange, Table, Td, Th } from '../components';

const GROUPS = [
  ['', 'Everything'],
  ['order.', 'Orders'],
  ['payment.', 'Payments & refunds'],
  ['shift.', 'Cash shifts'],
  ['expense.', 'Expenses'],
  ['menu.', 'Menu & prices'],
  ['inventory.', 'Inventory'],
  ['staff.', 'Staff'],
  ['settings.', 'Settings'],
  ['auth.', 'Sign-ins'],
  ['export.', 'Exports'],
];

const LABELS = {
  'auth.login': 'Signed in',
  'auth.logout': 'Signed out',
  'auth.password_changed': 'Changed password',
  'order.create': 'Created order',
  'order.status': 'Moved order',
  'order.cancel': 'Cancelled order',
  'payment.record': 'Took payment',
  'payment.refund': 'Refunded',
  'payment.online': 'Online payment received',
  'shift.open': 'Opened cash shift',
  'shift.close': 'Closed cash shift',
  'expense.create': 'Recorded expense',
  'expense.delete': 'Deleted expense',
  'menu.create': 'Added dish',
  'menu.update': 'Edited dish',
  'menu.archive': 'Removed dish',
  'inventory.restock': 'Restocked',
  'inventory.waste': 'Recorded waste',
  'inventory.correction': 'Corrected stock count',
  'staff.create': 'Added staff',
  'staff.update': 'Edited staff',
  'settings.update': 'Changed settings',
};

const TONE = { cancel: 'rose', refund: 'rose', delete: 'rose', waste: 'amber', correction: 'amber', archive: 'amber', close: 'sky' };

function Details({ details }) {
  if (!details) return null;
  const skip = new Set(['sections']);
  const entries = Object.entries(details).filter(([k, v]) => !skip.has(k) && v !== undefined && v !== null && typeof v !== 'object');
  const changes = Object.entries(details).filter(([, v]) => v && typeof v === 'object' && 'from' in v);
  return (
    <span className="text-xs text-stone-600">
      {entries
        .slice(0, 6)
        .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${typeof v === 'number' && /amount|total|expected|counted|variance|float|price|paid|discount/.test(k) ? (v / 100).toLocaleString() : v}`)
        .join(' · ')}
      {changes.map(([k, v]) => (
        <span key={k} className="block">
          {k}: {String(k === 'price' ? v.from / 100 : v.from)} → {String(k === 'price' ? v.to / 100 : v.to)}
        </span>
      ))}
    </span>
  );
}

export default function ActivityPage() {
  const [range, setRange] = useState({ preset: '7d', ...presetRange('7d') });
  const [action, setAction] = useState('');
  const [userId, setUserId] = useState('');
  const [page, setPage] = useState(1);
  const { data, error, loading, reload } = useApi('/api/admin/audit', { from: range.from, to: range.to, action, userId, page });

  return (
    <>
      <PageHeader title="Activity log" description="A permanent record of who did what and when. It cannot be edited or deleted." />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <DateRangePicker
          value={range}
          onChange={(r) => {
            setRange(r);
            setPage(1);
          }}
        />
        <select value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }} className="h-11 rounded-xl border-0 bg-white px-3 text-sm ring-1 ring-stone-200">
          {GROUPS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <select value={userId} onChange={(e) => { setUserId(e.target.value); setPage(1); }} className="h-11 rounded-xl border-0 bg-white px-3 text-sm ring-1 ring-stone-200">
          <option value="">All staff</option>
          {data?.users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
      </div>
      <Card>
        {loading && !data ? (
          <PageLoader />
        ) : error ? (
          <div className="p-4">
            <ErrorState error={error} onRetry={reload} />
          </div>
        ) : data.rows.length === 0 ? (
          <EmptyState icon={History} title="Nothing recorded for these filters" />
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  <Th>When</Th>
                  <Th>Who</Th>
                  <Th>What</Th>
                  <Th>Details</Th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => {
                  const verb = r.action.split('.')[1];
                  return (
                    <tr key={r.id}>
                      <Td className="whitespace-nowrap text-stone-600">{dateTime(r.created_at)}</Td>
                      <Td className="font-medium whitespace-nowrap">{r.user_name}</Td>
                      <Td>
                        <Badge tone={TONE[verb] ?? 'stone'}>{LABELS[r.action] ?? r.action}</Badge>
                      </Td>
                      <Td className="max-w-xl">
                        <Details details={r.details} />
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
            <Pagination page={data.page} pageSize={data.pageSize} count={data.count} onChange={setPage} />
          </>
        )}
      </Card>
    </>
  );
}
