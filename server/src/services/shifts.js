import { db, now } from '../db/index.js';
import { conflict, forbidden, notFound } from '../lib/errors.js';
import { can } from '../lib/permissions.js';
import { businessDate } from '../lib/time.js';
import { timezone } from './settings.js';

export function getOpenShift(userId) {
  return db.get("SELECT * FROM shifts WHERE user_id = ? AND status = 'open'", [userId]);
}

/** Money that moved through a shift, and how much cash should be in the drawer. */
export function shiftTotals(shift) {
  const cash = db.get(
    `SELECT COALESCE(SUM(CASE WHEN kind = 'payment' THEN amount END), 0) AS cash_in,
            COALESCE(SUM(CASE WHEN kind = 'refund' THEN amount END), 0) AS cash_out
     FROM payments WHERE shift_id = ? AND method = 'cash'`,
    [shift.id],
  );
  const payouts = db.get(
    'SELECT COALESCE(SUM(amount), 0) AS total, COUNT(*) AS count FROM expenses WHERE shift_id = ? AND from_drawer = 1',
    [shift.id],
  );
  const byMethod = db.all(
    `SELECT method, COUNT(*) AS count,
            SUM(CASE WHEN kind = 'payment' THEN amount ELSE -amount END) AS net
     FROM payments WHERE shift_id = ? GROUP BY method ORDER BY net DESC`,
    [shift.id],
  );
  return {
    cash_sales: cash.cash_in,
    cash_refunds: cash.cash_out,
    drawer_payouts: payouts.total,
    payout_count: payouts.count,
    expected_cash: shift.opening_float + cash.cash_in - cash.cash_out - payouts.total,
    by_method: byMethod,
  };
}

export function openShift(user, openingFloat) {
  if (getOpenShift(user.id)) throw conflict('You already have an open shift');
  const at = now();
  const { lastInsertRowid } = db.run(
    `INSERT INTO shifts (user_id, status, opening_float, opened_at, business_date)
     VALUES (?, 'open', ?, ?, ?)`,
    [user.id, openingFloat, at, businessDate(timezone())],
  );
  return getShift(Number(lastInsertRowid));
}

export function getShift(id) {
  const shift = db.get(
    'SELECT s.*, u.name AS user_name FROM shifts s JOIN users u ON u.id = s.user_id WHERE s.id = ?',
    [id],
  );
  if (!shift) throw notFound('Shift not found');
  const totals = shiftTotals(shift);
  // A closed shift keeps the expected figure it was reconciled against.
  return shift.status === 'open' ? { ...shift, ...totals } : { ...totals, ...shift };
}

export function closeShift(id, { countedCash, note }, user) {
  const shift = getShift(id);
  if (shift.status !== 'open') throw conflict('This shift is already closed');
  if (shift.user_id !== user.id && !can(user, 'shifts.viewAll')) throw forbidden('You can only close your own shift');
  const variance = countedCash - shift.expected_cash;
  db.run(
    `UPDATE shifts SET status = 'closed', closed_at = ?, expected_cash = ?, counted_cash = ?, variance = ?, note = ?
     WHERE id = ?`,
    [now(), shift.expected_cash, countedCash, variance, note || null, id],
  );
  return getShift(id);
}
