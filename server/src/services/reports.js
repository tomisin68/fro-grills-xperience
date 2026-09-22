import { db } from '../db/index.js';
import { addDays, daysBetween, localParts } from '../lib/time.js';
import { lowStockItems } from './inventory.js';
import { ACTIVE_STATUSES, listOrders } from './orders.js';
import { timezone, today } from './settings.js';

const LIVE = "o.status != 'cancelled'";
const net = "CASE WHEN kind = 'payment' THEN amount ELSE -amount END";

/** Headline numbers for a date range (inclusive business dates). */
export function totals(from, to) {
  const r = { from, to };
  const orders = db.get(
    `SELECT COUNT(*) AS count, COALESCE(SUM(total), 0) AS sales, COALESCE(SUM(subtotal - discount), 0) AS food_sales,
            COALESCE(SUM(discount), 0) AS discounts, COALESCE(SUM(tax), 0) AS tax,
            COALESCE(SUM(delivery_fee), 0) AS delivery_fees, COALESCE(SUM(status = 'completed'), 0) AS completed
     FROM orders o WHERE business_date BETWEEN :from AND :to AND ${LIVE}`,
    r,
  );
  const cancelled = db.get(
    `SELECT COUNT(*) AS count, COALESCE(SUM(total), 0) AS value FROM orders
     WHERE business_date BETWEEN :from AND :to AND status = 'cancelled'`,
    r,
  );
  const items = db.get(
    `SELECT COALESCE(SUM(oi.quantity), 0) AS qty FROM order_items oi JOIN orders o ON o.id = oi.order_id
     WHERE o.business_date BETWEEN :from AND :to AND ${LIVE}`,
    r,
  );
  const money = db.get(
    `SELECT COALESCE(SUM(CASE WHEN kind = 'payment' THEN amount END), 0) AS received,
            COALESCE(SUM(CASE WHEN kind = 'refund' THEN amount END), 0) AS refunded
     FROM payments WHERE business_date BETWEEN :from AND :to`,
    r,
  );
  const outstanding = db.get(
    `SELECT COUNT(*) AS count, COALESCE(SUM(total - amount_paid), 0) AS amount,
            COALESCE(SUM(status = 'completed'), 0) AS completed_count,
            COALESCE(SUM(CASE WHEN status = 'completed' THEN total - amount_paid END), 0) AS completed_amount
     FROM orders o WHERE business_date BETWEEN :from AND :to AND ${LIVE} AND payment_status IN ('unpaid', 'partial')`,
    r,
  );
  const expenses = db.get(
    'SELECT COALESCE(SUM(amount), 0) AS total FROM expenses WHERE business_date BETWEEN :from AND :to',
    r,
  );
  const stock = db.get(
    `SELECT COALESCE(SUM(CASE WHEN reason IN ('sale', 'return') THEN -change * unit_cost END), 0) AS food_cost,
            COALESCE(SUM(CASE WHEN reason = 'waste' THEN -change * unit_cost END), 0) AS waste_cost
     FROM stock_movements WHERE business_date BETWEEN :from AND :to`,
    r,
  );
  const shifts = db.get(
    `SELECT COALESCE(SUM(variance), 0) AS variance, COUNT(*) AS count FROM shifts
     WHERE status = 'closed' AND business_date BETWEEN :from AND :to`,
    r,
  );

  const collected = money.received - money.refunded;
  const foodCost = Math.round(stock.food_cost);
  return {
    orders: orders.count,
    completed: orders.completed,
    sales: orders.sales,
    food_sales: orders.food_sales,
    // Rounded to a whole currency unit; kobo-level averages are noise.
    avg_order: orders.count ? Math.round(orders.sales / orders.count / 100) * 100 : 0,
    items_sold: items.qty,
    discounts: orders.discounts,
    tax: orders.tax,
    delivery_fees: orders.delivery_fees,
    received: money.received,
    refunded: money.refunded,
    collected,
    outstanding: outstanding.amount,
    outstanding_count: outstanding.count,
    unpaid_completed: outstanding.completed_amount,
    unpaid_completed_count: outstanding.completed_count,
    cancelled: cancelled.count,
    cancelled_value: cancelled.value,
    expenses: expenses.total,
    net: collected - expenses.total,
    food_cost: foodCost,
    food_cost_pct: orders.food_sales ? Math.round((foodCost / orders.food_sales) * 1000) / 10 : 0,
    waste_cost: Math.round(stock.waste_cost),
    cash_variance: shifts.variance,
    closed_shifts: shifts.count,
  };
}

export function daily(from, to) {
  const r = { from, to };
  const byDate = (rows) => new Map(rows.map((row) => [row.d, row]));
  const orders = byDate(
    db.all(
      `SELECT business_date AS d, COUNT(*) AS orders, SUM(total) AS sales FROM orders o
       WHERE business_date BETWEEN :from AND :to AND ${LIVE} GROUP BY business_date`,
      r,
    ),
  );
  const payments = byDate(
    db.all(
      `SELECT business_date AS d, SUM(${net}) AS collected FROM payments
       WHERE business_date BETWEEN :from AND :to GROUP BY business_date`,
      r,
    ),
  );
  const expenses = byDate(
    db.all(
      `SELECT business_date AS d, SUM(amount) AS expenses FROM expenses
       WHERE business_date BETWEEN :from AND :to GROUP BY business_date`,
      r,
    ),
  );
  return daysBetween(from, to).map((date) => {
    const collected = payments.get(date)?.collected ?? 0;
    const spent = expenses.get(date)?.expenses ?? 0;
    return {
      date,
      orders: orders.get(date)?.orders ?? 0,
      sales: orders.get(date)?.sales ?? 0,
      collected,
      expenses: spent,
      net: collected - spent,
    };
  });
}

export function topItems(from, to, limit = 100) {
  return db.all(
    `SELECT oi.name, SUM(oi.quantity) AS quantity, SUM(oi.line_total) AS sales
     FROM order_items oi JOIN orders o ON o.id = oi.order_id
     WHERE o.business_date BETWEEN :from AND :to AND ${LIVE}
     GROUP BY oi.name ORDER BY quantity DESC, sales DESC LIMIT :limit`,
    { from, to, limit },
  );
}

function byHour(from, to) {
  const tz = timezone();
  const hours = Array.from({ length: 24 }, (_, hour) => ({ hour, orders: 0, sales: 0 }));
  const rows = db.all(
    `SELECT created_at, total FROM orders o WHERE business_date BETWEEN :from AND :to AND ${LIVE}`,
    { from, to },
  );
  for (const row of rows) {
    const h = hours[localParts(tz, new Date(row.created_at)).hour];
    h.orders += 1;
    h.sales += row.total;
  }
  return hours;
}

/** Everything the Reports page needs for one range. */
export function fullReport(from, to) {
  const r = { from, to };
  return {
    from,
    to,
    totals: totals(from, to),
    daily: daily(from, to),
    items: topItems(from, to),
    by_hour: byHour(from, to),
    by_category: db.all(
      `SELECT COALESCE(oi.category_name, 'Uncategorised') AS category, SUM(oi.quantity) AS quantity, SUM(oi.line_total) AS sales
       FROM order_items oi JOIN orders o ON o.id = oi.order_id
       WHERE o.business_date BETWEEN :from AND :to AND ${LIVE}
       GROUP BY category ORDER BY sales DESC`,
      r,
    ),
    by_method: db.all(
      `SELECT method, COUNT(*) AS count,
              COALESCE(SUM(CASE WHEN kind = 'payment' THEN amount END), 0) AS received,
              COALESCE(SUM(CASE WHEN kind = 'refund' THEN amount END), 0) AS refunded
       FROM payments WHERE business_date BETWEEN :from AND :to GROUP BY method ORDER BY received DESC`,
      r,
    ),
    by_type: db.all(
      `SELECT type, COUNT(*) AS orders, SUM(total) AS sales FROM orders o
       WHERE business_date BETWEEN :from AND :to AND ${LIVE} GROUP BY type ORDER BY sales DESC`,
      r,
    ),
    by_channel: db.all(
      `SELECT channel, COUNT(*) AS orders, SUM(total) AS sales FROM orders o
       WHERE business_date BETWEEN :from AND :to AND ${LIVE} GROUP BY channel ORDER BY sales DESC`,
      r,
    ),
    by_staff: db.all(
      `SELECT * FROM (
         SELECT u.id, u.name, u.role,
           (SELECT COUNT(*) FROM orders o WHERE o.created_by = u.id AND o.business_date BETWEEN :from AND :to AND ${LIVE}) AS orders_taken,
           (SELECT COALESCE(SUM(${net}), 0) FROM payments p WHERE p.user_id = u.id AND p.business_date BETWEEN :from AND :to) AS collected,
           (SELECT COALESCE(SUM(amount), 0) FROM payments p WHERE p.user_id = u.id AND p.kind = 'refund' AND p.business_date BETWEEN :from AND :to) AS refunds,
           (SELECT COUNT(*) FROM order_events e JOIN orders o ON o.id = e.order_id
              WHERE e.user_id = u.id AND e.status = 'cancelled' AND o.business_date BETWEEN :from AND :to) AS cancellations,
           (SELECT COALESCE(SUM(discount), 0) FROM orders o WHERE o.created_by = u.id AND o.business_date BETWEEN :from AND :to AND ${LIVE}) AS discounts
         FROM users u
       ) WHERE orders_taken > 0 OR collected != 0 OR refunds > 0 OR cancellations > 0
       ORDER BY collected DESC`,
      r,
    ),
    cancellations: db.all(
      `SELECT o.id, o.order_number, o.total, o.cancel_reason, o.created_at,
         (SELECT u.name FROM order_events e LEFT JOIN users u ON u.id = e.user_id
          WHERE e.order_id = o.id AND e.status = 'cancelled' ORDER BY e.id DESC LIMIT 1) AS cancelled_by
       FROM orders o WHERE o.status = 'cancelled' AND o.business_date BETWEEN :from AND :to ORDER BY o.id DESC`,
      r,
    ),
    refunds: db.all(
      `SELECT p.id, p.amount, p.method, p.note, p.created_at, o.id AS order_id, o.order_number, u.name AS user_name
       FROM payments p JOIN orders o ON o.id = p.order_id LEFT JOIN users u ON u.id = p.user_id
       WHERE p.kind = 'refund' AND p.business_date BETWEEN :from AND :to ORDER BY p.id DESC`,
      r,
    ),
    discounts: db.all(
      `SELECT o.id, o.order_number, o.discount, o.discount_reason, o.created_at, u.name AS user_name
       FROM orders o LEFT JOIN users u ON u.id = o.created_by
       WHERE o.discount > 0 AND o.business_date BETWEEN :from AND :to AND ${LIVE} ORDER BY o.id DESC`,
      r,
    ),
    expenses_by_category: db.all(
      `SELECT category, COUNT(*) AS count, SUM(amount) AS total FROM expenses
       WHERE business_date BETWEEN :from AND :to GROUP BY category ORDER BY total DESC`,
      r,
    ),
    shifts: db.all(
      `SELECT s.id, s.status, s.opened_at, s.closed_at, s.opening_float, s.expected_cash, s.counted_cash, s.variance, u.name AS user_name
       FROM shifts s JOIN users u ON u.id = s.user_id
       WHERE s.business_date BETWEEN :from AND :to ORDER BY s.id DESC`,
      r,
    ),
  };
}

export function dashboard() {
  const t = today();
  const yesterday = addDays(t, -1);
  return {
    today: t,
    totals: totals(t, t),
    yesterday: totals(yesterday, yesterday),
    // A fair comparison early in the day: what yesterday had received by this same time.
    yesterday_so_far: db.get(
      `SELECT COALESCE(SUM(${net}), 0) AS collected FROM payments WHERE business_date = ? AND created_at <= ?`,
      [yesterday, new Date(Date.now() - 86400000).toISOString()],
    ),
    trend: daily(addDays(t, -13), t),
    top_items: topItems(t, t, 5),
    active: db.all(
      `SELECT status, COUNT(*) AS count FROM orders WHERE status IN (${ACTIVE_STATUSES.map(() => '?').join(',')}) GROUP BY status`,
      ACTIVE_STATUSES,
    ),
    recent: listOrders({ pageSize: 8 }).rows,
    low_stock: lowStockItems(),
    open_shifts: db.all(
      `SELECT s.id, s.opened_at, s.opening_float, u.name AS user_name FROM shifts s
       JOIN users u ON u.id = s.user_id WHERE s.status = 'open' ORDER BY s.opened_at`,
    ),
    // Served but never paid for: the most common way money quietly goes missing.
    unpaid_completed: db.get(
      `SELECT COUNT(*) AS count, COALESCE(SUM(total - amount_paid), 0) AS amount FROM orders
       WHERE status = 'completed' AND payment_status IN ('unpaid', 'partial')`,
    ),
  };
}
