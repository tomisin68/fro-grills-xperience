import { useEffect } from 'react';
import { useParams } from 'react-router';
import { Button, ErrorState, PageLoader } from '../../components/ui';
import { ORDER_TYPE, PAYMENT_METHOD } from '../../lib/constants';
import { dateTime, money } from '../../lib/format';
import { useApi } from '../../lib/hooks';
import { useSettings } from '../../lib/settings';

/** 80mm thermal-printer receipt. Opens the print dialog automatically. */
export default function ReceiptPage() {
  const { id } = useParams();
  const { settings } = useSettings();
  const { data, error, loading, reload } = useApi(`/api/admin/orders/${id}`);
  const order = data?.order;

  useEffect(() => {
    if (!order) return undefined;
    const t = setTimeout(() => window.print(), 300);
    return () => clearTimeout(t);
  }, [order]);

  if (loading && !order) return <PageLoader />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  const r = settings.restaurant;
  const line = <div className="my-2 border-t border-dashed border-black" />;

  return (
    <div className="min-h-dvh bg-stone-200 py-6 print:bg-white print:py-0">
      <title>{`Receipt #${order.order_number} | ${settings.restaurant.name}`}</title>
      <style>{'@page { size: 80mm auto; margin: 4mm; }'}</style>
      <div className="no-print mx-auto mb-4 flex w-[80mm] gap-2">
        <Button size="sm" onClick={() => window.print()}>
          Print
        </Button>
        <Button size="sm" variant="secondary" onClick={() => window.close()}>
          Close
        </Button>
      </div>
      <div className="mx-auto w-[80mm] bg-white p-4 font-mono text-[12px] leading-snug text-black shadow print:w-full print:p-0 print:shadow-none">
        <div className="text-center">
          <p className="text-[15px] font-bold uppercase">{r.name}</p>
          <p>{[r.address, r.city].filter(Boolean).join(', ')}</p>
          {r.phone && <p>{r.phone}</p>}
        </div>
        {line}
        <p className="flex justify-between">
          <span>Order</span>
          <span className="font-bold">#{order.order_number}</span>
        </p>
        <p className="flex justify-between">
          <span>Date</span>
          <span>{dateTime(order.created_at)}</span>
        </p>
        <p className="flex justify-between">
          <span>Type</span>
          <span>
            {ORDER_TYPE[order.type]}
            {order.table_number ? ` · T${order.table_number}` : ''}
          </span>
        </p>
        {order.customer_name && (
          <p className="flex justify-between">
            <span>Customer</span>
            <span>{order.customer_name}</span>
          </p>
        )}
        {order.created_by_name && (
          <p className="flex justify-between">
            <span>Served by</span>
            <span>{order.created_by_name}</span>
          </p>
        )}
        {line}
        {order.items.map((i) => (
          <div key={i.id} className="mb-1">
            <p className="flex justify-between gap-2">
              <span>
                {i.quantity} x {i.name}
              </span>
              <span className="shrink-0">{money(i.line_total)}</span>
            </p>
            {i.notes && <p className="pl-3 text-[11px]">- {i.notes}</p>}
          </div>
        ))}
        {line}
        <p className="flex justify-between">
          <span>Subtotal</span>
          <span>{money(order.subtotal)}</span>
        </p>
        {order.discount > 0 && (
          <p className="flex justify-between">
            <span>Discount</span>
            <span>-{money(order.discount)}</span>
          </p>
        )}
        {order.delivery_fee > 0 && (
          <p className="flex justify-between">
            <span>Delivery</span>
            <span>{money(order.delivery_fee)}</span>
          </p>
        )}
        {order.tax > 0 && (
          <p className="flex justify-between">
            <span>Tax</span>
            <span>{money(order.tax)}</span>
          </p>
        )}
        <p className="mt-1 flex justify-between text-[14px] font-bold">
          <span>TOTAL</span>
          <span>{money(order.total)}</span>
        </p>
        {line}
        {order.payments.map((p) => (
          <p key={p.id} className="flex justify-between">
            <span>
              {p.kind === 'refund' ? 'Refund' : 'Paid'} ({PAYMENT_METHOD[p.method]})
            </span>
            <span>
              {p.kind === 'refund' ? '-' : ''}
              {money(p.amount)}
            </span>
          </p>
        ))}
        {order.balance_due > 0 && order.status !== 'cancelled' && (
          <p className="flex justify-between font-bold">
            <span>BALANCE DUE</span>
            <span>{money(order.balance_due)}</span>
          </p>
        )}
        {order.status === 'cancelled' && <p className="text-center font-bold">*** CANCELLED ***</p>}
        {line}
        <p className="text-center">Thank you for choosing {r.name}!</p>
        <p className="text-center">{window.location.host}</p>
      </div>
    </div>
  );
}
