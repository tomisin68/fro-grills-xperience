import { Download, Plus, Trash2, Wallet } from 'lucide-react';
import { useState } from 'react';
import { Badge, Button, Card, EmptyState, ErrorState, Input, Modal, PageLoader, Select, Switch } from '../../components/ui';
import { api, withQuery } from '../../lib/api';
import { dayLabel, money, today, toMinor } from '../../lib/format';
import { useApi } from '../../lib/hooks';
import { useSettings } from '../../lib/settings';
import { useToast } from '../../lib/toast';
import { useAuth } from '../auth';
import { DateRangePicker, MoneyInput, PageHeader, presetRange, Table, Td, Th } from '../components';

export function ExpenseModal({ categories, onClose, onSaved, drawerOnly }) {
  const toast = useToast();
  const [form, setForm] = useState({
    date: today(),
    category: drawerOnly ? 'Gas & fuel' : categories[0],
    description: '',
    amount: '',
    method: 'transfer',
    fromDrawer: Boolean(drawerOnly),
  });
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    try {
      await api.post('/api/admin/expenses', {
        ...(drawerOnly ? {} : { date: form.date }),
        category: form.category,
        description: form.description.trim(),
        amount: toMinor(form.amount),
        method: form.fromDrawer ? 'cash' : form.method,
        fromDrawer: form.fromDrawer,
      });
      toast.success('Expense recorded');
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      open
      onClose={onClose}
      title={drawerOnly ? 'Pay out cash from the drawer' : 'Record an expense'}
      description={form.fromDrawer ? 'This is taken off the cash expected in your drawer at close.' : null}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={busy} disabled={!form.description.trim() || toMinor(form.amount) <= 0} onClick={save}>
            Save
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Select label="Category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
          {categories.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </Select>
        <MoneyInput label="Amount" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
        <Input className="sm:col-span-2" label="What was it for?" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="e.g. Diesel for generator" />
        {!drawerOnly && (
          <>
            <Input label="Date" type="date" max={today()} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            {!form.fromDrawer && (
              <Select label="Paid by" value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })}>
                <option value="transfer">Bank transfer</option>
                <option value="cash">Cash (not from the till)</option>
                <option value="card">Card</option>
              </Select>
            )}
            <div className="sm:col-span-2">
              <Switch checked={form.fromDrawer} onChange={(fromDrawer) => setForm({ ...form, fromDrawer, date: today() })} label="Paid with cash from my drawer" description="Needs your cash shift to be open." />
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

export default function ExpensesPage() {
  const { settings } = useSettings();
  const { can } = useAuth();
  const toast = useToast();
  const [range, setRange] = useState({ preset: 'month', ...presetRange('month') });
  const { data, error, loading, reload } = useApi('/api/admin/expenses', { from: range.from, to: range.to });
  const [adding, setAdding] = useState(false);

  async function remove(e) {
    if (!window.confirm(`Delete “${e.description}” (${money(e.amount)})? The deletion is kept in the activity log.`)) return;
    try {
      await api.delete(`/api/admin/expenses/${e.id}`);
      toast.success('Expense deleted');
      reload();
    } catch (err) {
      toast.error(err.message);
    }
  }

  const byCategory = Object.entries(
    (data?.rows ?? []).reduce((acc, r) => ({ ...acc, [r.category]: (acc[r.category] ?? 0) + r.amount }), {}),
  ).sort((a, b) => b[1] - a[1]);

  return (
    <>
      <PageHeader
        title="Expenses"
        description={`Everything ${settings.restaurant.name} spends, so the reports show real profit, not just sales.`}
        actions={
          <>
            <a href={withQuery('/api/admin/reports/export.csv', { kind: 'expenses', from: range.from, to: range.to })}>
              <Button variant="secondary" size="sm">
                <Download className="size-4" /> CSV
              </Button>
            </a>
            <Button size="sm" onClick={() => setAdding(true)} disabled={!data}>
              <Plus className="size-4" /> Record expense
            </Button>
          </>
        }
      />
      <div className="mb-4">
        <DateRangePicker value={range} onChange={setRange} />
      </div>
      {loading && !data ? (
        <PageLoader />
      ) : error ? (
        <ErrorState error={error} onRetry={reload} />
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <span className="mr-2 font-display text-2xl font-bold">{money(data.total)}</span>
            {byCategory.map(([c, amount]) => (
              <span key={c} className="rounded-full bg-white px-3 py-1 text-sm ring-1 ring-stone-200">
                {c} <span className="font-semibold">{money(amount)}</span>
              </span>
            ))}
          </div>
          <Card>
            {data.rows.length === 0 ? (
              <EmptyState icon={Wallet} title="No expenses in this period">
                Record diesel, market runs, salaries and other costs to see true profit.
              </EmptyState>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>Date</Th>
                    <Th>Category</Th>
                    <Th>Description</Th>
                    <Th>Paid by</Th>
                    <Th align="right">Amount</Th>
                    <Th>Recorded by</Th>
                    {can('expenses.delete') && <Th />}
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((e) => (
                    <tr key={e.id}>
                      <Td className="whitespace-nowrap text-stone-600">{dayLabel(e.business_date)}</Td>
                      <Td>{e.category}</Td>
                      <Td className="max-w-72">{e.description}</Td>
                      <Td>{e.from_drawer ? <Badge tone="amber">Cash drawer</Badge> : <span className="capitalize">{e.method}</span>}</Td>
                      <Td align="right" className="font-semibold">
                        {money(e.amount)}
                      </Td>
                      <Td className="text-stone-600">{e.user_name}</Td>
                      {can('expenses.delete') && (
                        <Td align="right">
                          <button onClick={() => remove(e)} className="rounded-lg p-1.5 text-stone-400 hover:bg-rose-50 hover:text-rose-600" aria-label="Delete expense">
                            <Trash2 className="size-4" />
                          </button>
                        </Td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
        </>
      )}
      {adding && <ExpenseModal categories={data.categories} onClose={() => setAdding(false)} onSaved={reload} />}
    </>
  );
}
