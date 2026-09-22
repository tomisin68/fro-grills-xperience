import crypto from 'node:crypto';
import { db, now } from '../db/index.js';
import { audit } from '../lib/audit.js';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors.js';
import { bus } from '../lib/events.js';
import { can } from '../lib/permissions.js';
import { businessDate } from '../lib/time.js';
import { deductStockForOrder, findShortage, restoreStockForOrder } from './inventory.js';
import { formatMoney, getSettings, openStatus, publicSettings, timezone } from './settings.js';
import { getOpenShift } from './shifts.js';

export const ACTIVE_STATUSES = ['pending', 'confirmed', 'preparing', 'ready', 'out_for_delivery'];
const FLOW = ['pending', 'confirmed', 'preparing', 'ready', 'out_for_delivery', 'completed'];
// Once an order reaches the kitchen its ingredients are used up, so cancelling no longer returns stock.
const RESTOCK_ON_CANCEL = ['pending', 'confirmed'];

const in$ = (list) => list.map(() => '?').join(',');

// ---------------------------------------------------------------- pricing

function priceLines(items) {
  const ids = [...new Set(items.map((i) => i.menuItemId))];
  const rows = db.all(
    `SELECT m.*, c.name AS category_name, c.active AS category_active
     FROM menu_items m LEFT JOIN categories c ON c.id = m.category_id
     WHERE m.id IN (${in$(ids)})`,
    ids,
  );
  const byId = new Map(rows.map((r) => [r.id, r]));
  const lines = items.map((i) => {
    const m = byId.get(i.menuItemId);
    if (!m || m.archived) throw badRequest('An item in the order is no longer on the menu. Please refresh and try again.');
    if (!m.available || m.category_active === 0) throw conflict(`${m.name} is not available right now`);
    return {
      menuItemId: m.id,
      name: m.name,
      categoryName: m.category_name,
      unitPrice: m.price,
      quantity: i.quantity,
      lineTotal: m.price * i.quantity,
      notes: i.notes || null,
    };
  });
  const shortage = findShortage(lines);
  if (shortage) throw conflict(`Sorry, ${shortage} is sold out`);
  return lines;
}

function totalsFor(lines, type, discount) {
  const { ordering } = getSettings();
  const subtotal = lines.reduce((sum, l) => sum + l.lineTotal, 0);
  if (discount > subtotal) throw badRequest('The discount cannot be more than the order subtotal');
  const deliveryFee = type === 'delivery' ? ordering.deliveryFee : 0;
  const tax = Math.round(((subtotal - discount) * (ordering.taxRate || 0)) / 100);
  return { subtotal, deliveryFee, tax, discount, total: subtotal - discount + deliveryFee + tax };
}

function checkOnlineOrderAllowed(input) {
  const s = getSettings();
  if (!s.ordering.acceptingOrders) throw conflict('We are not taking online orders right now. Please call us instead.');
  if (!openStatus(s).isOpen) throw conflict('We are closed at the moment. Please order during our opening hours.');
  const typeEnabled = { delivery: s.ordering.delivery, pickup: s.ordering.pickup, dine_in: s.ordering.dineIn }[input.type];
  if (!typeEnabled) throw badRequest('That order type is not available');
  if (!['cash', 'transfer', 'online'].includes(input.paymentMethod) || !publicSettings().payments[input.paymentMethod]) {
    throw badRequest('That payment method is not available');
  }
  if (!input.customer.name || !input.customer.phone) throw badRequest('Please enter your name and phone number');
  if (input.type === 'delivery' && !input.deliveryAddress) throw badRequest('Please enter a delivery address');
  if (input.paymentMethod === 'online' && !input.customer.email) throw badRequest('Enter your email address to pay online');
}

// ---------------------------------------------------------------- events

function emitOrder(id, kind) {
  db.afterCommit(() => {
    const order = orderSummary(id);
    if (order) bus.emit('order', { kind, order });
  });
}

// ---------------------------------------------------------------- create

/**
 * Creates an order. input.items carry only ids, quantities and notes;
 * every price is read from the database.
 */
export function createOrder(input, { channel, user = null }) {
  const settings = getSettings();
  if (channel === 'online') checkOnlineOrderAllowed(input);
  if (channel === 'pos' && input.paymentMethod === 'online') throw badRequest('Online payment is only for web orders');

  const discount = input.discount || 0;
  if (discount && !can(user, 'orders.discount')) throw forbidden('Only a manager can give discounts');
  if (discount && !input.discountReason) throw badRequest('Give a reason for the discount');

  const lines = priceLines(input.items);
  const totals = totalsFor(lines, input.type, discount);
  if (channel === 'online' && totals.subtotal < settings.ordering.minOrder) {
    throw badRequest(`The minimum order is ${formatMoney(settings.ordering.minOrder)}`);
  }

  const autoConfirm = channel === 'pos' || (settings.ordering.autoAccept && input.paymentMethod !== 'online');
  const status = autoConfirm ? 'confirmed' : 'pending';
  const at = now();
  const customer = input.customer ?? {};

  const id = db.tx(() => {
    const nextId = (db.get('SELECT MAX(id) AS m FROM orders').m ?? 0) + 1;
    db.run(
      `INSERT INTO orders (id, order_number, tracking_token, channel, type, status, customer_name, customer_phone,
         customer_email, delivery_address, table_number, notes, subtotal, delivery_fee, tax, discount, discount_reason,
         total, payment_method, created_by, business_date, created_at, updated_at)
       VALUES (:id, :orderNumber, :token, :channel, :type, :status, :name, :phone, :email, :address, :table, :notes,
         :subtotal, :deliveryFee, :tax, :discount, :discountReason, :total, :paymentMethod, :createdBy, :businessDate, :at, :at)`,
      {
        id: nextId,
        orderNumber: String(1000 + nextId),
        token: crypto.randomBytes(12).toString('base64url'),
        channel,
        type: input.type,
        status,
        name: customer.name || null,
        phone: customer.phone || null,
        email: customer.email || null,
        address: input.type === 'delivery' ? input.deliveryAddress || null : null,
        table: input.type === 'dine_in' ? input.tableNumber || null : null,
        notes: input.notes || null,
        ...totals,
        discountReason: discount ? input.discountReason : null,
        paymentMethod: input.paymentMethod,
        createdBy: user?.id ?? null,
        businessDate: businessDate(timezone()),
        at,
      },
    );
    for (const l of lines) {
      db.run(
        `INSERT INTO order_items (order_id, menu_item_id, name, category_name, unit_price, quantity, line_total, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [nextId, l.menuItemId, l.name, l.categoryName, l.unitPrice, l.quantity, l.lineTotal, l.notes],
      );
    }
    addEvent(nextId, status, channel === 'pos' ? 'Created at the counter' : 'Order placed online', user?.id);
    if (status === 'confirmed') deductStockForOrder(nextId, user?.id);
    emitOrder(nextId, 'created');
    return nextId;
  });
  return getOrder(id);
}

function addEvent(orderId, status, note, userId) {
  db.run('INSERT INTO order_events (order_id, status, note, user_id, created_at) VALUES (?, ?, ?, ?, ?)', [
    orderId,
    status,
    note || null,
    userId ?? null,
    now(),
  ]);
}

// ---------------------------------------------------------------- read

export function getOrder(id) {
  const order = db.get(
    'SELECT o.*, u.name AS created_by_name FROM orders o LEFT JOIN users u ON u.id = o.created_by WHERE o.id = ?',
    [id],
  );
  if (!order) throw notFound('Order not found');
  order.balance_due = Math.max(order.total - order.amount_paid, 0);
  order.items = db.all('SELECT * FROM order_items WHERE order_id = ? ORDER BY id', [id]);
  order.events = db.all(
    `SELECT e.id, e.status, e.note, e.created_at, u.name AS user_name
     FROM order_events e LEFT JOIN users u ON u.id = e.user_id WHERE e.order_id = ? ORDER BY e.id`,
    [id],
  );
  order.payments = db.all(
    `SELECT p.id, p.kind, p.method, p.amount, p.reference, p.note, p.created_at, u.name AS user_name
     FROM payments p LEFT JOIN users u ON u.id = p.user_id WHERE p.order_id = ? ORDER BY p.id`,
    [id],
  );
  return order;
}

const SUMMARY_COLUMNS = `o.id, o.order_number, o.status, o.type, o.channel, o.customer_name, o.customer_phone,
  o.table_number, o.total, o.amount_paid, o.payment_status, o.payment_method, o.created_at, o.updated_at,
  (SELECT COALESCE(SUM(quantity), 0) FROM order_items WHERE order_id = o.id) AS item_count,
  (SELECT GROUP_CONCAT(quantity || '× ' || name, ', ') FROM order_items WHERE order_id = o.id) AS summary`;

export function orderSummary(id) {
  return db.get(`SELECT ${SUMMARY_COLUMNS} FROM orders o WHERE o.id = ?`, [id]);
}

export function listOrders({ status = 'all', from, to, q, payment, type, channel, page = 1, pageSize = 50 }) {
  const where = [];
  const params = [];
  if (status === 'active') {
    where.push(`o.status IN (${in$(ACTIVE_STATUSES)})`);
    params.push(...ACTIVE_STATUSES);
  } else if (status && status !== 'all') {
    where.push('o.status = ?');
    params.push(status);
  }
  const filters = [
    ['o.business_date >= ?', from],
    ['o.business_date <= ?', to],
    ['o.type = ?', type],
    ['o.channel = ?', channel],
  ];
  for (const [sql, value] of filters) {
    if (!value) continue;
    where.push(sql);
    params.push(value);
  }
  if (payment === 'unpaid') where.push(`o.payment_status IN ('unpaid', 'partial') AND o.status != 'cancelled'`);
  if (payment === 'paid') where.push(`o.payment_status = 'paid'`);
  if (q) {
    where.push('(o.order_number LIKE ? OR o.customer_name LIKE ? OR o.customer_phone LIKE ?)');
    const like = `%${q.replace(/[%_]/g, '')}%`;
    params.push(like, like, like);
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const { count } = db.get(`SELECT COUNT(*) AS count FROM orders o ${clause}`, params);
  const rows = db.all(
    `SELECT ${SUMMARY_COLUMNS} FROM orders o ${clause} ORDER BY o.id DESC LIMIT ? OFFSET ?`,
    [...params, pageSize, (page - 1) * pageSize],
  );
  return { rows, count, page, pageSize };
}

export function kitchenQueue() {
  const orders = db.all(
    `SELECT id, order_number, status, type, channel, customer_name, table_number, notes, created_at, updated_at
     FROM orders WHERE status IN ('confirmed', 'preparing', 'ready') ORDER BY id ASC`,
  );
  const items = orders.length
    ? db.all(
        `SELECT order_id, name, quantity, notes FROM order_items WHERE order_id IN (${in$(orders)}) ORDER BY id`,
        orders.map((o) => o.id),
      )
    : [];
  return orders.map((o) => ({ ...o, items: items.filter((i) => i.order_id === o.id) }));
}

/** The slice of an order a customer may see with their tracking link. */
export function publicOrderView(id) {
  const o = getOrder(id);
  const { estimatedMinutes } = getSettings().ordering;
  return {
    order_number: o.order_number,
    status: o.status,
    type: o.type,
    customer_name: o.customer_name,
    delivery_address: o.delivery_address,
    table_number: o.table_number,
    notes: o.notes,
    subtotal: o.subtotal,
    delivery_fee: o.delivery_fee,
    tax: o.tax,
    discount: o.discount,
    total: o.total,
    amount_paid: o.amount_paid,
    balance_due: o.balance_due,
    payment_method: o.payment_method,
    payment_status: o.payment_status,
    cancel_reason: o.cancel_reason,
    created_at: o.created_at,
    updated_at: o.updated_at,
    estimated_minutes: estimatedMinutes,
    items: o.items.map((i) => ({ name: i.name, quantity: i.quantity, unit_price: i.unit_price, line_total: i.line_total, notes: i.notes })),
    events: o.events.map((e) => ({ status: e.status, created_at: e.created_at })),
  };
}

// ---------------------------------------------------------------- status

function assertCanMove(user, order, target) {
  if (can(user, 'orders.update')) return;
  const kitchenMove =
    can(user, 'kitchen.update') &&
    ((order.status === 'confirmed' && ['preparing', 'ready'].includes(target)) ||
      (order.status === 'preparing' && target === 'ready'));
  if (!kitchenMove) throw forbidden('You cannot move this order to that stage');
}

export function updateStatus(id, target, { user, note }) {
  const order = db.get('SELECT * FROM orders WHERE id = ?', [id]);
  if (!order) throw notFound('Order not found');
  if (['completed', 'cancelled'].includes(order.status)) throw conflict(`This order is already ${order.status}`);
  const from = FLOW.indexOf(order.status);
  const to = FLOW.indexOf(target);
  if (to <= from) throw conflict('Orders can only move forward. Cancel it instead if needed.');
  if (target === 'out_for_delivery' && order.type !== 'delivery') throw badRequest('Only delivery orders go out for delivery');
  assertCanMove(user, order, target);

  db.tx(() => {
    const at = now();
    db.run('UPDATE orders SET status = ?, updated_at = ?, completed_at = ? WHERE id = ?', [
      target,
      at,
      target === 'completed' ? at : null,
      id,
    ]);
    addEvent(id, target, note, user?.id);
    if (!order.stock_deducted) deductStockForOrder(id, user?.id);
    emitOrder(id, 'updated');
  });
  return getOrder(id);
}

export function cancelOrder(id, { user, reason }) {
  const order = db.get('SELECT * FROM orders WHERE id = ?', [id]);
  if (!order) throw notFound('Order not found');
  if (['completed', 'cancelled'].includes(order.status)) {
    throw conflict(`A ${order.status} order cannot be cancelled. Record a refund instead.`);
  }
  // Rejecting a brand-new order is routine; cancelling one already in progress needs a manager.
  const rejectingNew = order.status === 'pending' && can(user, 'orders.update');
  if (!rejectingNew && !can(user, 'orders.cancel')) throw forbidden('Only a manager can cancel an order once it is accepted');
  if (order.amount_paid > 0) throw conflict('This order has been paid. Refund the payment before cancelling it.');

  db.tx(() => {
    db.run("UPDATE orders SET status = 'cancelled', cancel_reason = ?, updated_at = ? WHERE id = ?", [reason, now(), id]);
    addEvent(id, 'cancelled', reason, user?.id);
    if (order.stock_deducted && RESTOCK_ON_CANCEL.includes(order.status)) restoreStockForOrder(id, user?.id);
    emitOrder(id, 'updated');
  });
  return getOrder(id);
}

// ---------------------------------------------------------------- payments

function insertPayment(orderId, { kind, method, amount, reference = null, note = null, userId = null, shiftId = null }) {
  db.run(
    `INSERT INTO payments (order_id, kind, method, amount, reference, note, user_id, shift_id, business_date, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [orderId, kind, method, amount, reference, note, userId, shiftId, businessDate(timezone()), now()],
  );
  const { total } = db.get('SELECT total FROM orders WHERE id = ?', [orderId]);
  const sums = db.get(
    `SELECT COALESCE(SUM(CASE WHEN kind = 'payment' THEN amount ELSE -amount END), 0) AS net,
            COALESCE(SUM(kind = 'refund'), 0) AS refunds
     FROM payments WHERE order_id = ?`,
    [orderId],
  );
  const status = sums.net >= total ? 'paid' : sums.refunds > 0 ? 'refunded' : sums.net > 0 ? 'partial' : 'unpaid';
  db.run('UPDATE orders SET amount_paid = ?, payment_status = ?, updated_at = ? WHERE id = ?', [
    sums.net,
    status,
    now(),
    orderId,
  ]);
}

/** Shift that a staff payment belongs to. Cash cannot be taken without an open drawer. */
function shiftFor(user, method) {
  const shift = user ? getOpenShift(user.id) : null;
  if (method === 'cash' && !shift) throw conflict('Open your cash shift before handling cash');
  return shift?.id ?? null;
}

export function recordPayment(id, { method, amount, reference, note, user }) {
  const order = db.get('SELECT * FROM orders WHERE id = ?', [id]);
  if (!order) throw notFound('Order not found');
  if (order.status === 'cancelled') throw conflict('This order was cancelled');
  const balance = order.total - order.amount_paid;
  if (balance <= 0) throw conflict('This order is already fully paid');
  if (amount > balance) throw badRequest(`Only ${formatMoney(balance)} is left to pay on this order`);
  const shiftId = shiftFor(user, method);

  db.tx(() => {
    insertPayment(id, { kind: 'payment', method, amount, reference, note, userId: user.id, shiftId });
    emitOrder(id, 'updated');
  });
  return getOrder(id);
}

export function refundPayment(id, { method, amount, reason, user }) {
  const order = db.get('SELECT * FROM orders WHERE id = ?', [id]);
  if (!order) throw notFound('Order not found');
  if (order.amount_paid <= 0) throw conflict('Nothing has been paid on this order');
  if (amount > order.amount_paid) throw badRequest(`You can refund at most ${formatMoney(order.amount_paid)}`);
  const shiftId = shiftFor(user, method);

  db.tx(() => {
    insertPayment(id, { kind: 'refund', method, amount, note: reason, userId: user.id, shiftId });
    emitOrder(id, 'updated');
  });
  return getOrder(id);
}

/**
 * Credits a verified gateway payment. Safe to call repeatedly with the same
 * reference: the unique index on payments.reference makes it idempotent.
 */
export function applyOnlinePayment({ orderId, reference, amount, currency }) {
  const order = db.get('SELECT * FROM orders WHERE id = ?', [orderId]);
  if (!order) return null;
  if (db.get("SELECT id FROM payments WHERE reference = ? AND method = 'online' AND kind = 'payment'", [reference])) {
    return order;
  }
  const settings = getSettings();
  if (currency !== settings.locale.currency) {
    audit(null, 'payment.currency_mismatch', 'order', order.id, { reference, amount, currency });
    return order;
  }
  db.tx(() => {
    insertPayment(order.id, { kind: 'payment', method: 'online', amount, reference, note: 'Paystack' });
    if (order.status === 'pending' && settings.ordering.autoAccept) {
      db.run("UPDATE orders SET status = 'confirmed', updated_at = ? WHERE id = ?", [now(), order.id]);
      addEvent(order.id, 'confirmed', 'Accepted automatically after online payment');
      deductStockForOrder(order.id);
    }
    emitOrder(order.id, 'updated');
  });
  audit(null, 'payment.online', 'order', order.id, { reference, amount, order_number: order.order_number });
  return db.get('SELECT * FROM orders WHERE id = ?', [order.id]);
}
