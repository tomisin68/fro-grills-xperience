import { Banknote, CircleCheck, Lock, Plus, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { Badge, Button, Card, cx, EmptyState, ErrorState, Modal, PageLoader, Textarea } from '../../components/ui';
import { api } from '../../lib/api';
import { PAYMENT_METHOD } from '../../lib/constants';
import { dateTime, money, time, toMinor } from '../../lib/format';
import { useApi } from '../../lib/hooks';
import { useToast } from '../../lib/toast';
import { useAuth } from '../auth';
import { MoneyInput, PageHeader, Table, Td, Th } from '../components';
import { ExpenseModal } from './ExpensesPage';

const DRAWER_CATEGORIES = ['Gas & fuel', 'Ingredients & supplies', 'Delivery & transport', 'Packaging', 'Repairs & maintenance', 'Other'];

function VarianceText({ value, className }) {
  if (value === null || value === undefined) return <span className="text-stone-400">—</span>;
  const tone = value === 0 ? 'text-emerald-700' : value < 0 ? 'text-rose-700' : 'text-amber-700';
  const label = value === 0 ? 'Balanced' : value < 0 ? `Short ${money(-value)}` : `Over ${money(value)}`;
  return <span className={cx('font-semibold', tone, className)}>{label}</span>;
}

function OpenShiftCard({ onOpened }) {
  const toast = useToast();
  const [float, setFloat] = useState('');
  const [busy, setBusy] = useState(false);
  async function open() {
    setBusy(true);
    try {
      const { shift } = await api.post('/api/admin/shifts/open', { openingFloat: toMinor(float) });
      toast.success('Shift opened. You can take cash now.');
      onOpened(shift);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card className="p-5 sm:p-6">
      <div className="flex items-start gap-4">
        <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-amber-100 text-amber-700">
          <Banknote className="size-6" />
        </div>
        <div className="flex-1">
          <h2 className="font-display text-lg font-bold">Start your cash shift</h2>
          <p className="mt-1 text-sm text-stone-600">Count the cash in the drawer before you start. At the end of the day you count it again and the system tells you if anything is missing.</p>
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <MoneyInput label="Cash in the drawer now (float)" value={float} onChange={(e) => setFloat(e.target.value)} className="w-56" />
            <Button loading={busy} onClick={open}>
              Open shift
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}

function CurrentShift({ shiftId, onClosed }) {
  const toast = useToast();
  const { data, error, loading, reload } = useApi(`/api/admin/shifts/${shiftId}`);
  const [counted, setCounted] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [payout, setPayout] = useState(false);

  if (loading && !data) return <PageLoader />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  const { shift, payments, payouts } = data;
  const variance = counted === '' ? null : toMinor(counted) - shift.expected_cash;

  async function close() {
    setBusy(true);
    try {
      const { shift: closed } = await api.post(`/api/admin/shifts/${shift.id}/close`, { countedCash: toMinor(counted), note });
      toast.success(closed.variance === 0 ? 'Shift closed. The drawer balanced.' : 'Shift closed and the difference was recorded.');
      onClosed(closed);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
      <Card className="p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Badge tone="emerald">Open</Badge>
            <h2 className="mt-2 font-display text-xl font-bold">{shift.user_name}’s shift</h2>
            <p className="text-sm text-stone-500">Started {dateTime(shift.opened_at)}</p>
          </div>
          <Button variant="secondary" size="sm" onClick={() => setPayout(true)}>
            <Plus className="size-4" /> Pay out cash
          </Button>
        </div>
        <dl className="mt-6 grid gap-3 sm:grid-cols-2">
          {[
            ['Opening float', shift.opening_float],
            ['Cash sales', shift.cash_sales],
            ['Cash refunds', -shift.cash_refunds],
            ['Paid out from drawer', -shift.drawer_payouts],
          ].map(([label, value]) => (
            <div key={label} className="flex justify-between rounded-xl bg-stone-50 px-4 py-3 text-sm">
              <dt className="text-stone-600">{label}</dt>
              <dd className={cx('font-semibold tabular-nums', value < 0 && 'text-rose-700')}>
                {value < 0 ? '−' : ''}
                {money(Math.abs(value))}
              </dd>
            </div>
          ))}
        </dl>
        <div className="mt-3 flex items-baseline justify-between rounded-xl bg-coal-950 px-4 py-4 text-white">
          <span className="text-sm text-stone-300">Cash that should be in the drawer</span>
          <span className="font-display text-2xl font-bold tabular-nums">{money(shift.expected_cash)}</span>
        </div>
        {shift.by_method.length > 0 && (
          <div className="mt-6">
            <h3 className="text-xs font-semibold tracking-wider text-stone-500 uppercase">Everything you took this shift</h3>
            <div className="mt-2 flex flex-wrap gap-2">
              {shift.by_method.map((m) => (
                <span key={m.method} className="rounded-full bg-white px-3 py-1 text-sm ring-1 ring-stone-200">
                  {PAYMENT_METHOD[m.method]}: <span className="font-semibold">{money(m.net)}</span> ({m.count})
                </span>
              ))}
            </div>
          </div>
        )}
        {(payments.length > 0 || payouts.length > 0) && (
          <ul className="mt-5 max-h-72 divide-y divide-stone-100 overflow-y-auto text-sm">
            {payouts.map((p) => (
              <li key={`x${p.id}`} className="flex justify-between gap-3 py-2">
                <span>
                  <Badge tone="amber">Pay-out</Badge> {p.description}
                </span>
                <span className="font-semibold text-rose-700 tabular-nums">−{money(p.amount)}</span>
              </li>
            ))}
            {payments.map((p) => (
              <li key={p.id} className="flex justify-between gap-3 py-2">
                <span className="text-stone-600">
                  {time(p.created_at)} · #{p.order_number} · {PAYMENT_METHOD[p.method]}
                  {p.kind === 'refund' && ' refund'}
                </span>
                <span className={cx('font-semibold tabular-nums', p.kind === 'refund' && 'text-rose-700')}>
                  {p.kind === 'refund' ? '−' : ''}
                  {money(p.amount)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="h-fit p-5 sm:p-6">
        <h2 className="flex items-center gap-2 font-display text-lg font-bold">
          <Lock className="size-5 text-stone-400" /> Close shift
        </h2>
        <p className="mt-1 text-sm text-stone-600">Count every note and coin in the drawer, then enter the total.</p>
        <div className="mt-4 space-y-4">
          <MoneyInput label="Cash counted" value={counted} onChange={(e) => setCounted(e.target.value)} />
          {variance !== null && (
            <div className={cx('rounded-xl px-4 py-3 text-sm', variance === 0 ? 'bg-emerald-50' : variance < 0 ? 'bg-rose-50' : 'bg-amber-50')}>
              <VarianceText value={variance} className="text-base" />
              {variance !== 0 && <p className="mt-1 text-stone-600">Recount before closing. If it is still different, explain below. The owner will see it.</p>}
            </div>
          )}
          <Textarea label="Note (optional)" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          <Button className="w-full" variant="dark" disabled={counted === ''} onClick={() => setConfirming(true)}>
            Close shift
          </Button>
        </div>
      </Card>

      <Modal
        open={confirming}
        onClose={() => setConfirming(false)}
        size="sm"
        title="Close this shift?"
        description="You cannot reopen it afterwards."
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirming(false)}>
              Back
            </Button>
            <Button variant="dark" loading={busy} onClick={close}>
              Close shift
            </Button>
          </>
        }
      >
        <p className="text-sm">
          Expected {money(shift.expected_cash)}, counted {money(toMinor(counted))}: <VarianceText value={variance} />
        </p>
      </Modal>
      {payout && <ExpenseModal drawerOnly categories={DRAWER_CATEGORIES} onClose={() => setPayout(false)} onSaved={reload} />}
    </div>
  );
}

/** For managers: close a shift someone forgot to close, using the manager's own count. */
function CloseForModal({ shift, onClose, onDone }) {
  const toast = useToast();
  const { data } = useApi(`/api/admin/shifts/${shift.id}`);
  const [counted, setCounted] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit() {
    setBusy(true);
    try {
      await api.post(`/api/admin/shifts/${shift.id}/close`, { countedCash: toMinor(counted), note });
      toast.success(`${shift.user_name}'s shift closed`);
      onDone();
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
      title={`Close ${shift.user_name}'s shift`}
      description={data ? `Expected in the drawer: ${money(data.shift.expected_cash)}` : 'Loading…'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="dark" loading={busy} disabled={counted === '' || note.trim().length < 3} onClick={submit}>
            Close shift
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <MoneyInput label="Cash you counted" value={counted} onChange={(e) => setCounted(e.target.value)} />
        <Textarea label="Why are you closing it?" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Forgot to close before leaving" />
      </div>
    </Modal>
  );
}

export default function ShiftsPage() {
  const { shift, setShift, can, user } = useAuth();
  const history = useApi('/api/admin/shifts');
  const [lastClosed, setLastClosed] = useState(null);
  const [closingFor, setClosingFor] = useState(null);
  const viewAll = can('shifts.viewAll');

  return (
    <>
      <PageHeader title="Cash shifts" description="Every cash payment belongs to someone's shift, so the drawer can be balanced and any shortfall is traced to a person and a day." />
      {lastClosed && (
        <div className={cx('mb-5 flex items-center gap-3 rounded-2xl p-4 ring-1', lastClosed.variance === 0 ? 'bg-emerald-50 ring-emerald-200' : 'bg-amber-50 ring-amber-200')}>
          {lastClosed.variance === 0 ? <CircleCheck className="size-6 text-emerald-600" /> : <TriangleAlert className="size-6 text-amber-600" />}
          <p className="text-sm">
            Shift closed. Expected {money(lastClosed.expected_cash)}, counted {money(lastClosed.counted_cash)}: <VarianceText value={lastClosed.variance} />
          </p>
        </div>
      )}
      <div className="mb-8">
        {shift ? (
          <CurrentShift
            shiftId={shift.id}
            onClosed={(closed) => {
              setShift(null);
              setLastClosed(closed);
              history.reload();
            }}
          />
        ) : (
          <OpenShiftCard
            onOpened={(s) => {
              setShift(s);
              setLastClosed(null);
              history.reload();
            }}
          />
        )}
      </div>

      <h2 className="mb-3 font-display text-lg font-bold">{viewAll ? 'All shifts (last 30 days)' : 'Your recent shifts'}</h2>
      <Card>
        {history.loading && !history.data ? (
          <PageLoader />
        ) : history.error ? (
          <div className="p-4">
            <ErrorState error={history.error} onRetry={history.reload} />
          </div>
        ) : history.data.rows.length === 0 ? (
          <EmptyState icon={Banknote} title="No shifts yet" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Opened</Th>
                {viewAll && <Th>Staff</Th>}
                <Th>Closed</Th>
                <Th align="right">Float</Th>
                <Th align="right">Expected</Th>
                <Th align="right">Counted</Th>
                <Th align="right">Difference</Th>
              </tr>
            </thead>
            <tbody>
              {history.data.rows.map((s) => (
                <tr key={s.id} className={cx(s.variance < 0 && 'bg-rose-50/50')}>
                  <Td className="whitespace-nowrap">{dateTime(s.opened_at)}</Td>
                  {viewAll && <Td className="font-medium">{s.user_name}</Td>}
                  <Td className="whitespace-nowrap text-stone-600">
                    {s.status === 'open' ? (
                      <span className="inline-flex items-center gap-2">
                        <Badge tone="emerald">Still open</Badge>
                        {viewAll && s.user_id !== user.id && (
                          <Button size="xs" variant="secondary" onClick={() => setClosingFor(s)}>
                            Close
                          </Button>
                        )}
                      </span>
                    ) : (
                      time(s.closed_at)
                    )}
                  </Td>
                  <Td align="right">{money(s.opening_float)}</Td>
                  <Td align="right">{s.expected_cash === null ? '—' : money(s.expected_cash)}</Td>
                  <Td align="right">{s.counted_cash === null ? '—' : money(s.counted_cash)}</Td>
                  <Td align="right">
                    <VarianceText value={s.variance} />
                    {s.note && <p className="text-xs text-stone-500">{s.note}</p>}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      {closingFor && <CloseForModal shift={closingFor} onClose={() => setClosingFor(null)} onDone={history.reload} />}
    </>
  );
}
