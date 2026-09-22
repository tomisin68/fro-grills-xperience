import { Router } from 'express';
import { db, now } from '../../db/index.js';
import { audit } from '../../lib/audit.js';
import { requirePerm } from '../../lib/auth.js';
import { major, sendCsv, toCsv } from '../../lib/csv.js';
import { badRequest, conflict, forbidden, notFound } from '../../lib/errors.js';
import { can } from '../../lib/permissions.js';
import { addDays } from '../../lib/time.js';
import { dateStr, id, money, parse, positiveMoney, text, z } from '../../lib/validate.js';
import { dashboard, daily, fullReport, topItems } from '../../services/reports.js';
import { today } from '../../services/settings.js';
import { closeShift, getOpenShift, getShift, openShift } from '../../services/shifts.js';

const router = Router();

function range(query) {
  const { from = today(), to = today() } = parse(z.object({ from: dateStr.optional(), to: dateStr.optional() }), query);
  if (from > to) throw badRequest('The start date must be before the end date');
  if (addDays(from, 366) < to) throw badRequest('Choose a range of one year or less');
  return { from, to };
}

// ------------------------------------------------------------ dashboard & reports

router.get('/dashboard', requirePerm('dashboard.view'), (_req, res) => res.json(dashboard()));

router.get('/reports', requirePerm('reports.view'), (req, res) => {
  const { from, to } = range(req.query);
  res.json(fullReport(from, to));
});

router.get('/reports/export.csv', requirePerm('reports.view'), (req, res) => {
  const { from, to } = range(req.query);
  const { kind } = parse(z.object({ kind: z.enum(['daily', 'items', 'payments', 'expenses']) }), req.query);
  let csv;
  if (kind === 'daily') {
    csv = toCsv(daily(from, to), [
      ['Date', (r) => r.date],
      ['Orders', (r) => r.orders],
      ['Sales', (r) => major(r.sales)],
      ['Money received', (r) => major(r.collected)],
      ['Expenses', (r) => major(r.expenses)],
      ['Net', (r) => major(r.net)],
    ]);
  } else if (kind === 'items') {
    csv = toCsv(topItems(from, to, 10000), [
      ['Item', (r) => r.name],
      ['Quantity sold', (r) => r.quantity],
      ['Sales', (r) => major(r.sales)],
    ]);
  } else if (kind === 'payments') {
    const rows = db.all(
      `SELECT p.*, o.order_number, u.name AS user_name FROM payments p JOIN orders o ON o.id = p.order_id
       LEFT JOIN users u ON u.id = p.user_id WHERE p.business_date BETWEEN ? AND ? ORDER BY p.id`,
      [from, to],
    );
    csv = toCsv(rows, [
      ['Date', (r) => r.business_date],
      ['Time (UTC)', (r) => r.created_at],
      ['Order #', (r) => r.order_number],
      ['Type', (r) => r.kind],
      ['Method', (r) => r.method],
      ['Amount', (r) => major(r.kind === 'refund' ? -r.amount : r.amount)],
      ['Reference', (r) => r.reference],
      ['Note', (r) => r.note],
      ['Staff', (r) => r.user_name ?? 'Online'],
    ]);
  } else {
    const rows = db.all(
      `SELECT e.*, u.name AS user_name FROM expenses e LEFT JOIN users u ON u.id = e.user_id
       WHERE e.business_date BETWEEN ? AND ? ORDER BY e.business_date, e.id`,
      [from, to],
    );
    csv = toCsv(rows, [
      ['Date', (r) => r.business_date],
      ['Category', (r) => r.category],
      ['Description', (r) => r.description],
      ['Amount', (r) => major(r.amount)],
      ['Method', (r) => r.method],
      ['From cash drawer', (r) => (r.from_drawer ? 'Yes' : 'No')],
      ['Recorded by', (r) => r.user_name],
    ]);
  }
  audit(req, `export.${kind}`, null, null, { from, to });
  sendCsv(res, `fro-grills-xperience-${kind}-${from}-to-${to}.csv`, csv);
});

// ------------------------------------------------------------ expenses

export const EXPENSE_CATEGORIES = [
  'Ingredients & supplies',
  'Gas & fuel',
  'Salaries & wages',
  'Rent',
  'Utilities',
  'Repairs & maintenance',
  'Packaging',
  'Delivery & transport',
  'Marketing',
  'Other',
];

router.get('/expenses', requirePerm('expenses.view'), (req, res) => {
  const { from, to } = range(req.query);
  const rows = db.all(
    `SELECT e.*, u.name AS user_name FROM expenses e LEFT JOIN users u ON u.id = e.user_id
     WHERE e.business_date BETWEEN ? AND ? ORDER BY e.business_date DESC, e.id DESC`,
    [from, to],
  );
  res.json({ rows, total: rows.reduce((s, r) => s + r.amount, 0), categories: EXPENSE_CATEGORIES });
});

router.post('/expenses', requirePerm('expenses.create'), (req, res) => {
  const body = parse(
    z.object({
      date: dateStr.optional(),
      category: text(60, 1),
      description: text(200, 2),
      amount: positiveMoney,
      method: z.enum(['cash', 'card', 'transfer']).optional().default('cash'),
      fromDrawer: z.boolean().optional().default(false),
    }),
    req.body,
  );
  // Staff without full expense access can only record pay-outs from their own drawer, dated today.
  const limited = !can(req.user, 'expenses.view');
  if (limited && (!body.fromDrawer || (body.date && body.date !== today()))) {
    throw forbidden('You can only record cash paid out of your drawer today');
  }
  const date = body.date ?? today();
  if (date > today()) throw badRequest('Expenses cannot be dated in the future');
  let shiftId = null;
  if (body.fromDrawer) {
    const shift = getOpenShift(req.user.id);
    if (!shift) throw conflict('Open your cash shift before paying out from the drawer');
    shiftId = shift.id;
  }
  const { lastInsertRowid } = db.run(
    `INSERT INTO expenses (category, description, amount, method, from_drawer, shift_id, user_id, business_date, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [body.category, body.description, body.amount, body.fromDrawer ? 'cash' : body.method, body.fromDrawer, shiftId, req.user.id, date, now()],
  );
  audit(req, 'expense.create', 'expense', lastInsertRowid, body);
  res.status(201).json({ expense: db.get('SELECT * FROM expenses WHERE id = ?', [lastInsertRowid]) });
});

router.delete('/expenses/:id', requirePerm('expenses.delete'), (req, res) => {
  const expenseId = parse(id, req.params.id);
  const expense = db.get('SELECT * FROM expenses WHERE id = ?', [expenseId]);
  if (!expense) throw notFound('Expense not found');
  if (expense.shift_id && db.get("SELECT id FROM shifts WHERE id = ? AND status = 'closed'", [expense.shift_id])) {
    throw conflict('This pay-out belongs to a closed cash shift and cannot be removed');
  }
  db.run('DELETE FROM expenses WHERE id = ?', [expenseId]);
  // The full record goes into the activity log so nothing disappears without a trace.
  audit(req, 'expense.delete', 'expense', expenseId, expense);
  res.json({ ok: true });
});

// ------------------------------------------------------------ cash shifts

router.get('/shifts/current', requirePerm('shifts.use'), (req, res) => {
  const shift = getOpenShift(req.user.id);
  res.json({ shift: shift ? getShift(shift.id) : null });
});

router.post('/shifts/open', requirePerm('shifts.use'), (req, res) => {
  const { openingFloat } = parse(z.object({ openingFloat: money }), req.body);
  const shift = openShift(req.user, openingFloat);
  audit(req, 'shift.open', 'shift', shift.id, { opening_float: openingFloat });
  res.status(201).json({ shift });
});

router.post('/shifts/:id/close', requirePerm('shifts.use'), (req, res) => {
  const { countedCash, note } = parse(
    z.object({ countedCash: money, note: z.string().trim().max(300).optional().default('') }),
    req.body,
  );
  const shift = closeShift(parse(id, req.params.id), { countedCash, note }, req.user);
  audit(req, 'shift.close', 'shift', shift.id, {
    staff: shift.user_name,
    expected: shift.expected_cash,
    counted: countedCash,
    variance: shift.variance,
  });
  res.json({ shift });
});

router.get('/shifts', requirePerm('shifts.use'), (req, res) => {
  const { from, to } = range({ from: req.query.from ?? addDays(today(), -30), to: req.query.to });
  const all = can(req.user, 'shifts.viewAll');
  const rows = db.all(
    `SELECT s.*, u.name AS user_name FROM shifts s JOIN users u ON u.id = s.user_id
     WHERE s.business_date BETWEEN ? AND ? ${all ? '' : 'AND s.user_id = ?'} ORDER BY s.id DESC`,
    all ? [from, to] : [from, to, req.user.id],
  );
  res.json({ rows });
});

router.get('/shifts/:id', requirePerm('shifts.use'), (req, res) => {
  const shift = getShift(parse(id, req.params.id));
  if (shift.user_id !== req.user.id && !can(req.user, 'shifts.viewAll')) throw forbidden();
  const payments = db.all(
    `SELECT p.id, p.kind, p.method, p.amount, p.created_at, o.order_number, o.id AS order_id
     FROM payments p JOIN orders o ON o.id = p.order_id WHERE p.shift_id = ? ORDER BY p.id DESC`,
    [shift.id],
  );
  const payouts = db.all('SELECT * FROM expenses WHERE shift_id = ? ORDER BY id DESC', [shift.id]);
  res.json({ shift, payments, payouts });
});

export default router;
