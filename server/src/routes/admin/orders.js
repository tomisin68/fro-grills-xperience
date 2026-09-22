import { Router } from 'express';
import { db, now } from '../../db/index.js';
import { audit } from '../../lib/audit.js';
import { requirePerm } from '../../lib/auth.js';
import { major, sendCsv, toCsv } from '../../lib/csv.js';
import { forbidden } from '../../lib/errors.js';
import { bus, openEventStream } from '../../lib/events.js';
import { can } from '../../lib/permissions.js';
import { dateStr, id, money, optionalText, parse, positiveMoney, z } from '../../lib/validate.js';
import {
  cancelOrder,
  createOrder,
  getOrder,
  kitchenQueue,
  listOrders,
  recordPayment,
  refundPayment,
  updateStatus,
} from '../../services/orders.js';
import { today } from '../../services/settings.js';

const router = Router();

const staffMethod = z.enum(['cash', 'card', 'transfer'], { error: 'Choose cash, card or transfer' });

const posOrderSchema = z.object({
  type: z.enum(['dine_in', 'pickup', 'delivery']),
  customer: z
    .object({ name: optionalText(80), phone: optionalText(30), email: optionalText(120) })
    .optional()
    .default({}),
  deliveryAddress: optionalText(300),
  tableNumber: optionalText(20),
  notes: optionalText(500),
  items: z
    .array(z.object({ menuItemId: z.number().int().positive(), quantity: z.number().int().min(1).max(99), notes: optionalText(200) }))
    .min(1, 'Add at least one item'),
  paymentMethod: staffMethod,
  discount: money.optional().default(0),
  discountReason: optionalText(200),
  // Omit amount to settle the order in full at whatever total the server calculates.
  payment: z.object({ method: staffMethod, amount: positiveMoney.optional(), reference: optionalText(80) }).optional(),
});

const listSchema = z.object({
  status: z.enum(['all', 'active', 'pending', 'confirmed', 'preparing', 'ready', 'out_for_delivery', 'completed', 'cancelled']).optional(),
  from: dateStr.optional(),
  to: dateStr.optional(),
  q: z.string().trim().max(80).optional(),
  payment: z.enum(['unpaid', 'paid']).optional(),
  type: z.enum(['delivery', 'pickup', 'dine_in']).optional(),
  channel: z.enum(['online', 'pos']).optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(200).optional().default(50),
});

router.get('/orders', requirePerm('orders.view'), (req, res) => {
  res.json(listOrders(parse(listSchema, req.query)));
});

router.get('/orders/export.csv', requirePerm('reports.view'), (req, res) => {
  const { from = today(), to = today() } = parse(z.object({ from: dateStr.optional(), to: dateStr.optional() }), req.query);
  const rows = db.all(
    `SELECT o.*, u.name AS created_by_name,
       (SELECT GROUP_CONCAT(quantity || 'x ' || name, '; ') FROM order_items WHERE order_id = o.id) AS items
     FROM orders o LEFT JOIN users u ON u.id = o.created_by
     WHERE o.business_date BETWEEN ? AND ? ORDER BY o.id`,
    [from, to],
  );
  const csv = toCsv(rows, [
    ['Order #', (r) => r.order_number],
    ['Date', (r) => r.business_date],
    ['Time (UTC)', (r) => r.created_at],
    ['Channel', (r) => r.channel],
    ['Type', (r) => r.type],
    ['Status', (r) => r.status],
    ['Customer', (r) => r.customer_name],
    ['Phone', (r) => r.customer_phone],
    ['Items', (r) => r.items],
    ['Subtotal', (r) => major(r.subtotal)],
    ['Discount', (r) => major(r.discount)],
    ['Delivery fee', (r) => major(r.delivery_fee)],
    ['Tax', (r) => major(r.tax)],
    ['Total', (r) => major(r.total)],
    ['Paid', (r) => major(r.amount_paid)],
    ['Payment status', (r) => r.payment_status],
    ['Payment method', (r) => r.payment_method],
    ['Taken by', (r) => r.created_by_name ?? 'Online'],
    ['Cancel reason', (r) => r.cancel_reason],
  ]);
  audit(req, 'export.orders', null, null, { from, to, rows: rows.length });
  sendCsv(res, `fro-grills-xperience-orders-${from}-to-${to}.csv`, csv);
});

router.get('/orders/:id', requirePerm('orders.view', 'kitchen.view'), (req, res) => {
  res.json({ order: getOrder(parse(id, req.params.id)) });
});

router.post('/orders', requirePerm('orders.create'), (req, res) => {
  const input = parse(posOrderSchema, req.body);
  if (input.payment && !can(req.user, 'payments.record')) throw forbidden('You cannot take payments');
  const order = db.tx(() => {
    const created = createOrder(input, { channel: 'pos', user: req.user });
    if (!input.payment || created.total === 0) return created;
    return recordPayment(created.id, { ...input.payment, amount: input.payment.amount ?? created.total, user: req.user });
  });
  audit(req, 'order.create', 'order', order.id, {
    order_number: order.order_number,
    total: order.total,
    discount: order.discount || undefined,
    discount_reason: order.discount_reason || undefined,
    paid: order.amount_paid,
  });
  res.status(201).json({ order });
});

router.post('/orders/:id/status', requirePerm('orders.update', 'kitchen.update'), (req, res) => {
  const { status, note } = parse(
    z.object({
      status: z.enum(['confirmed', 'preparing', 'ready', 'out_for_delivery', 'completed']),
      note: optionalText(300),
    }),
    req.body,
  );
  const order = updateStatus(parse(id, req.params.id), status, { user: req.user, note });
  audit(req, 'order.status', 'order', order.id, { order_number: order.order_number, status });
  res.json({ order });
});

router.post('/orders/:id/cancel', requirePerm('orders.update', 'orders.cancel'), (req, res) => {
  const { reason } = parse(z.object({ reason: z.string().trim().min(3, 'Give a reason for cancelling').max(300) }), req.body);
  const order = cancelOrder(parse(id, req.params.id), { user: req.user, reason });
  audit(req, 'order.cancel', 'order', order.id, { order_number: order.order_number, total: order.total, reason });
  res.json({ order });
});

router.post('/orders/:id/payments', requirePerm('payments.record'), (req, res) => {
  const body = parse(
    z.object({ method: staffMethod, amount: positiveMoney, reference: optionalText(80), note: optionalText(200) }),
    req.body,
  );
  const order = recordPayment(parse(id, req.params.id), { ...body, user: req.user });
  audit(req, 'payment.record', 'order', order.id, { order_number: order.order_number, method: body.method, amount: body.amount });
  res.json({ order });
});

router.post('/orders/:id/refunds', requirePerm('payments.refund'), (req, res) => {
  const body = parse(
    z.object({
      method: staffMethod,
      amount: positiveMoney,
      reason: z.string().trim().min(3, 'Give a reason for the refund').max(300),
    }),
    req.body,
  );
  const order = refundPayment(parse(id, req.params.id), { ...body, user: req.user });
  audit(req, 'payment.refund', 'order', order.id, { order_number: order.order_number, ...body });
  res.json({ order });
});

router.get('/kitchen', requirePerm('kitchen.view'), (_req, res) => {
  res.json({ orders: kitchenQueue(), server_time: now() });
});

/** Live feed of order changes for the orders board, kitchen display and new-order alerts. */
router.get('/events', requirePerm('orders.view', 'kitchen.view'), (req, res) => {
  const send = openEventStream(req, res, () => bus.off('order', onOrder));
  const onOrder = (e) => send(`order.${e.kind}`, e.order);
  bus.on('order', onOrder);
  send('ready', { at: now() });
});

export default router;
