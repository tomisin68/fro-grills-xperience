import { Boxes, PackagePlus, Pencil, Plus, TriangleAlert } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Badge, Button, Card, cx, EmptyState, ErrorState, Input, Modal, PageLoader, Segmented, Select, Switch, Textarea } from '../../components/ui';
import { api } from '../../lib/api';
import { dateTime, money, number, toMajor, toMinor } from '../../lib/format';
import { useApi } from '../../lib/hooks';
import { useToast } from '../../lib/toast';
import { useAuth } from '../auth';
import { MoneyInput, PageHeader, Pagination, StatCard, Table, Td, Th } from '../components';

const REASON = {
  restock: { label: 'Restock', tone: 'emerald' },
  sale: { label: 'Sold', tone: 'sky' },
  waste: { label: 'Waste', tone: 'rose' },
  correction: { label: 'Count', tone: 'amber' },
  return: { label: 'Returned', tone: 'violet' },
};

function ItemModal({ item, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState({
    name: item?.name ?? '',
    unit: item?.unit ?? 'kg',
    quantity: '',
    reorderLevel: item ? String(item.reorder_level) : '',
    costPerUnit: toMajor(item?.cost_per_unit),
  });
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    const body = { name: form.name.trim(), unit: form.unit.trim(), reorderLevel: Number(form.reorderLevel) || 0, costPerUnit: toMinor(form.costPerUnit) };
    try {
      if (item) await api.patch(`/api/admin/inventory/${item.id}`, body);
      else await api.post('/api/admin/inventory', { ...body, quantity: Number(form.quantity) || 0 });
      toast.success(`${body.name} saved`);
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }
  async function archive() {
    if (!window.confirm(`Stop tracking ${item.name}? Its history is kept.`)) return;
    try {
      await api.delete(`/api/admin/inventory/${item.id}`);
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err.message);
    }
  }
  return (
    <Modal
      open
      onClose={onClose}
      title={item ? `Edit ${item.name}` : 'Add a stock item'}
      description={item ? 'To change the quantity, use Restock, Waste or Count so the change is recorded.' : null}
      footer={
        <>
          {item && (
            <Button variant="danger-ghost" className="mr-auto" onClick={archive}>
              Stop tracking
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={busy} disabled={!form.name.trim() || !form.unit.trim()} onClick={save}>
            Save
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Input className="sm:col-span-2" label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Whole chicken" />
        <Input label="Unit" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} hint="kg, pcs, L, bottles…" list="units" />
        <datalist id="units">
          {['kg', 'g', 'pcs', 'L', 'ml', 'bottles', 'packs', 'bags', 'crates'].map((u) => (
            <option key={u} value={u} />
          ))}
        </datalist>
        <MoneyInput label={`Cost per ${form.unit || 'unit'}`} value={form.costPerUnit} onChange={(e) => setForm({ ...form, costPerUnit: e.target.value })} />
        {!item && <Input label="Quantity on hand now" inputMode="decimal" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />}
        <Input label="Warn me when it falls to" inputMode="decimal" value={form.reorderLevel} onChange={(e) => setForm({ ...form, reorderLevel: e.target.value })} hint="The reorder level" />
      </div>
    </Modal>
  );
}

function AdjustModal({ item, initialType, onClose, onSaved }) {
  const toast = useToast();
  const [type, setType] = useState(initialType);
  const [quantity, setQuantity] = useState('');
  const [unitCost, setUnitCost] = useState(toMajor(item.cost_per_unit));
  const [note, setNote] = useState('');
  const [recordExpense, setRecordExpense] = useState(true);
  const [expenseMethod, setExpenseMethod] = useState('transfer');
  const [busy, setBusy] = useState(false);
  const qty = Number(quantity);
  const after = type === 'restock' ? item.quantity + qty : type === 'waste' ? item.quantity - qty : qty;

  async function save() {
    setBusy(true);
    try {
      await api.post(`/api/admin/inventory/${item.id}/adjust`, {
        type,
        quantity: qty,
        note: note.trim(),
        ...(type === 'restock' ? { unitCost: toMinor(unitCost), recordExpense, expenseMethod } : {}),
      });
      toast.success(`${item.name} updated`);
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
      title={item.name}
      description={`On hand: ${number(item.quantity, 3)} ${item.unit}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={busy} disabled={quantity === '' || !(qty >= 0) || (type !== 'correction' && qty <= 0) || (type !== 'restock' && note.trim().length < 2)} onClick={save}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Segmented
          value={type}
          onChange={setType}
          className="w-full"
          options={[
            { value: 'restock', label: 'Restock' },
            { value: 'waste', label: 'Waste' },
            { value: 'correction', label: 'Count' },
          ]}
        />
        <Input
          label={type === 'restock' ? `How much arrived (${item.unit})` : type === 'waste' ? `How much was wasted (${item.unit})` : `How much you counted (${item.unit})`}
          inputMode="decimal"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          autoFocus
        />
        {type === 'restock' && (
          <>
            <MoneyInput label={`Cost per ${item.unit}`} value={unitCost} onChange={(e) => setUnitCost(e.target.value)} />
            <Switch checked={recordExpense} onChange={setRecordExpense} label="Also record this purchase as an expense" description={qty > 0 ? `${money(Math.round(qty * toMinor(unitCost)))} under Ingredients & supplies` : null} />
            {recordExpense && (
              <Select label="Paid by" value={expenseMethod} onChange={(e) => setExpenseMethod(e.target.value)}>
                <option value="transfer">Bank transfer</option>
                <option value="cash">Cash</option>
                <option value="card">Card</option>
              </Select>
            )}
          </>
        )}
        <Textarea
          label={type === 'restock' ? 'Note (optional)' : type === 'waste' ? 'What happened?' : 'Why is the count different?'}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          placeholder={type === 'waste' ? 'Burnt, spoiled, dropped…' : type === 'correction' ? 'Weekly stock count' : 'Supplier, invoice number…'}
        />
        {quantity !== '' && qty >= 0 && (
          <p className="rounded-xl bg-stone-50 px-3 py-2 text-sm">
            Stock after this: <span className="font-semibold">{number(after, 3)} {item.unit}</span>
          </p>
        )}
      </div>
    </Modal>
  );
}

function Movements({ items }) {
  const [itemId, setItemId] = useState('');
  const [reason, setReason] = useState('');
  const [page, setPage] = useState(1);
  const { data, loading, error, reload } = useApi('/api/admin/inventory/movements', { itemId, reason, page });
  return (
    <Card>
      <div className="flex flex-wrap gap-2 border-b border-stone-100 p-3">
        <select value={itemId} onChange={(e) => { setItemId(e.target.value); setPage(1); }} className="h-10 rounded-xl border-0 px-3 text-sm ring-1 ring-stone-200">
          <option value="">All stock items</option>
          {items.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name}
            </option>
          ))}
        </select>
        <select value={reason} onChange={(e) => { setReason(e.target.value); setPage(1); }} className="h-10 rounded-xl border-0 px-3 text-sm ring-1 ring-stone-200">
          <option value="">All changes</option>
          {Object.entries(REASON).map(([k, v]) => (
            <option key={k} value={k}>
              {v.label}
            </option>
          ))}
        </select>
      </div>
      {loading && !data ? (
        <PageLoader />
      ) : error ? (
        <div className="p-4">
          <ErrorState error={error} onRetry={reload} />
        </div>
      ) : (
        <>
          <Table>
            <thead>
              <tr>
                <Th>When</Th>
                <Th>Item</Th>
                <Th>Change</Th>
                <Th align="right">Amount</Th>
                <Th align="right">Balance</Th>
                <Th>By</Th>
                <Th>Note</Th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((m) => (
                <tr key={m.id}>
                  <Td className="whitespace-nowrap text-stone-600">{dateTime(m.created_at)}</Td>
                  <Td className="font-medium">{m.item_name}</Td>
                  <Td>
                    <Badge tone={REASON[m.reason].tone}>{REASON[m.reason].label}</Badge>
                  </Td>
                  <Td align="right" className={cx('font-semibold', m.change < 0 ? 'text-rose-700' : 'text-emerald-700')}>
                    {m.change > 0 ? '+' : ''}
                    {number(m.change, 3)} {m.unit}
                  </Td>
                  <Td align="right">{number(m.balance_after, 3)}</Td>
                  <Td className="text-stone-600">{m.user_name ?? '—'}</Td>
                  <Td className="max-w-64 truncate text-stone-600">{m.order_number ? `Order #${m.order_number}` : m.note}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
          <Pagination page={data.page} pageSize={data.pageSize} count={data.count} onChange={setPage} />
        </>
      )}
    </Card>
  );
}

export default function InventoryPage() {
  const { can } = useAuth();
  const manage = can('inventory.manage');
  const { data, error, loading, reload } = useApi('/api/admin/inventory');
  const [tab, setTab] = useState('stock');
  const [modal, setModal] = useState(null);
  const [onlyLow, setOnlyLow] = useState(false);

  const items = useMemo(() => (data?.items ?? []).filter((i) => !onlyLow || i.quantity <= i.reorder_level), [data, onlyLow]);

  if (loading && !data) return <PageLoader />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  return (
    <>
      <PageHeader
        title="Inventory"
        description="Sales deduct stock automatically through each dish's recipe. Restock, waste and counts are recorded with your name."
        actions={
          manage && (
            <Button onClick={() => setModal({ kind: 'item' })}>
              <Plus className="size-4" /> Add stock item
            </Button>
          )
        }
      />
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <StatCard label="Stock value (at cost)" value={money(data.stock_value)} icon={Boxes} />
        <StatCard label="Running low" value={data.low_stock} tone={data.low_stock ? 'danger' : 'good'} sub={data.low_stock ? 'At or below reorder level' : 'Everything is stocked'} icon={TriangleAlert} />
        <StatCard label="Items tracked" value={data.items.length} icon={PackagePlus} />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex gap-1 rounded-2xl bg-white p-1 ring-1 ring-stone-200">
          {[
            ['stock', 'Stock levels'],
            ['history', 'History'],
          ].map(([value, label]) => (
            <button key={value} onClick={() => setTab(value)} className={cx('rounded-xl px-4 py-2 text-sm font-semibold', tab === value ? 'bg-coal-950 text-white' : 'text-stone-600 hover:bg-stone-100')}>
              {label}
            </button>
          ))}
        </div>
        {tab === 'stock' && <Switch checked={onlyLow} onChange={setOnlyLow} label="Only show low stock" />}
      </div>

      {tab === 'history' ? (
        <Movements items={data.items} />
      ) : (
        <Card>
          {items.length === 0 ? (
            <EmptyState icon={Boxes} title={onlyLow ? 'Nothing is running low' : 'No stock items yet'}>
              {onlyLow ? 'Every item is above its reorder level.' : 'Add ingredients and drinks, then link them to dishes in the Menu page.'}
            </EmptyState>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Item</Th>
                  <Th align="right">On hand</Th>
                  <Th align="right">Reorder at</Th>
                  <Th align="right">Cost / unit</Th>
                  <Th align="right">Value</Th>
                  <Th align="right">Used in</Th>
                  {manage && <Th />}
                </tr>
              </thead>
              <tbody>
                {items.map((i) => {
                  const low = i.quantity <= i.reorder_level;
                  return (
                    <tr key={i.id} className={cx(low && 'bg-rose-50/50')}>
                      <Td>
                        <p className="font-semibold">{i.name}</p>
                        {low && <p className="text-xs font-medium text-rose-700">{i.quantity <= 0 ? 'Out of stock' : 'Running low'}</p>}
                      </Td>
                      <Td align="right" className={cx('font-semibold', low && 'text-rose-700')}>
                        {number(i.quantity, 3)} {i.unit}
                      </Td>
                      <Td align="right" className="text-stone-600">
                        {number(i.reorder_level, 3)}
                      </Td>
                      <Td align="right">{money(i.cost_per_unit)}</Td>
                      <Td align="right">{money(Math.round(Math.max(i.quantity, 0) * i.cost_per_unit))}</Td>
                      <Td align="right" className="text-stone-600">
                        {i.used_in} dish{i.used_in === 1 ? '' : 'es'}
                      </Td>
                      {manage && (
                        <Td align="right">
                          <div className="flex justify-end gap-1">
                            <Button size="xs" variant="success" onClick={() => setModal({ kind: 'adjust', item: i, type: 'restock' })}>
                              Restock
                            </Button>
                            <Button size="xs" variant="secondary" onClick={() => setModal({ kind: 'adjust', item: i, type: 'waste' })}>
                              Waste
                            </Button>
                            <Button size="xs" variant="secondary" onClick={() => setModal({ kind: 'adjust', item: i, type: 'correction' })}>
                              Count
                            </Button>
                            <Button size="xs" variant="ghost" onClick={() => setModal({ kind: 'item', item: i })} aria-label="Edit">
                              <Pencil className="size-3.5" />
                            </Button>
                          </div>
                        </Td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </Card>
      )}

      {modal?.kind === 'item' && <ItemModal item={modal.item} onClose={() => setModal(null)} onSaved={reload} />}
      {modal?.kind === 'adjust' && <AdjustModal item={modal.item} initialType={modal.type} onClose={() => setModal(null)} onSaved={reload} />}
    </>
  );
}

