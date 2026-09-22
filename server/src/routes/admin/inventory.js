import { Router } from 'express';
import { db, now } from '../../db/index.js';
import { audit } from '../../lib/audit.js';
import { requirePerm } from '../../lib/auth.js';
import { badRequest, conflict, notFound } from '../../lib/errors.js';
import { businessDate } from '../../lib/time.js';
import { dateStr, id, money, optionalText, parse, text, z } from '../../lib/validate.js';
import { adjustStock } from '../../services/inventory.js';
import { timezone } from '../../services/settings.js';

const router = Router();

const quantity = z.number().min(0).max(10_000_000);
const itemFields = {
  name: text(80, 1),
  unit: text(20, 1),
  reorderLevel: quantity,
  costPerUnit: money,
};
const createSchema = z.object({
  ...itemFields,
  reorderLevel: quantity.optional().default(0),
  costPerUnit: money.optional().default(0),
  quantity: quantity.optional().default(0),
});
const patchSchema = z.object(itemFields).partial();

function listItems(where = 'i.archived = 0', params = []) {
  return db.all(
    `SELECT i.*, (SELECT COUNT(*) FROM recipe_items r JOIN menu_items m ON m.id = r.menu_item_id
                  WHERE r.inventory_item_id = i.id AND m.archived = 0) AS used_in
     FROM inventory_items i WHERE ${where} ORDER BY i.name`,
    params,
  );
}

router.get('/inventory', requirePerm('inventory.view', 'menu.manage'), (_req, res) => {
  const items = listItems();
  res.json({
    items,
    stock_value: Math.round(items.reduce((sum, i) => sum + Math.max(i.quantity, 0) * i.cost_per_unit, 0)),
    low_stock: items.filter((i) => i.quantity <= i.reorder_level).length,
  });
});

router.post('/inventory', requirePerm('inventory.manage'), (req, res) => {
  const body = parse(createSchema, req.body);
  if (db.get('SELECT id FROM inventory_items WHERE name = ? AND archived = 0', [body.name])) {
    throw conflict('A stock item with that name already exists');
  }
  const at = now();
  const itemId = db.tx(() => {
    // An archived item with the same name is brought back rather than duplicated.
    const archived = db.get('SELECT id FROM inventory_items WHERE name = ? AND archived = 1', [body.name]);
    let newId;
    if (archived) {
      db.run(
        'UPDATE inventory_items SET archived = 0, unit = ?, reorder_level = ?, cost_per_unit = ?, updated_at = ? WHERE id = ?',
        [body.unit, body.reorderLevel, body.costPerUnit, at, archived.id],
      );
      newId = archived.id;
    } else {
      const { lastInsertRowid } = db.run(
        `INSERT INTO inventory_items (name, unit, quantity, reorder_level, cost_per_unit, created_at, updated_at)
         VALUES (?, ?, 0, ?, ?, ?, ?)`,
        [body.name, body.unit, body.reorderLevel, body.costPerUnit, at, at],
      );
      newId = Number(lastInsertRowid);
    }
    const current = db.get('SELECT quantity FROM inventory_items WHERE id = ?', [newId]).quantity;
    if (body.quantity !== current) {
      adjustStock(newId, { type: 'correction', quantity: body.quantity, note: 'Opening stock', userId: req.user.id });
    }
    return newId;
  });
  audit(req, 'inventory.create', 'inventory_item', itemId, { name: body.name, quantity: body.quantity });
  res.status(201).json({ item: listItems('i.id = ?', [itemId])[0] });
});

router.patch('/inventory/:id', requirePerm('inventory.manage'), (req, res) => {
  const itemId = parse(id, req.params.id);
  const current = db.get('SELECT * FROM inventory_items WHERE id = ? AND archived = 0', [itemId]);
  if (!current) throw notFound('Stock item not found');
  const body = parse(patchSchema, req.body);
  db.run(
    'UPDATE inventory_items SET name = ?, unit = ?, reorder_level = ?, cost_per_unit = ?, updated_at = ? WHERE id = ?',
    [
      body.name ?? current.name,
      body.unit ?? current.unit,
      body.reorderLevel ?? current.reorder_level,
      body.costPerUnit ?? current.cost_per_unit,
      now(),
      itemId,
    ],
  );
  audit(req, 'inventory.update', 'inventory_item', itemId, body);
  res.json({ item: listItems('i.id = ?', [itemId])[0] });
});

router.delete('/inventory/:id', requirePerm('inventory.manage'), (req, res) => {
  const itemId = parse(id, req.params.id);
  const item = listItems('i.id = ? AND i.archived = 0', [itemId])[0];
  if (!item) throw notFound('Stock item not found');
  if (item.used_in) {
    throw conflict(`This is used in ${item.used_in} dish recipe${item.used_in === 1 ? '' : 's'}. Remove it from them first.`);
  }
  db.run('DELETE FROM recipe_items WHERE inventory_item_id = ?', [itemId]);
  db.run('UPDATE inventory_items SET archived = 1, updated_at = ? WHERE id = ?', [now(), itemId]);
  audit(req, 'inventory.archive', 'inventory_item', itemId, { name: item.name, quantity: item.quantity });
  res.json({ ok: true });
});

router.post('/inventory/:id/adjust', requirePerm('inventory.manage'), (req, res) => {
  const itemId = parse(id, req.params.id);
  const body = parse(
    z.object({
      type: z.enum(['restock', 'waste', 'correction']),
      quantity,
      unitCost: money.optional(),
      note: optionalText(300),
      recordExpense: z.boolean().optional().default(false),
      expenseMethod: z.enum(['cash', 'card', 'transfer']).optional().default('transfer'),
    }),
    req.body,
  );
  if (body.type !== 'restock' && !body.note) {
    throw badRequest(body.type === 'waste' ? 'Say what was wasted and why' : 'Say why the count is different');
  }
  const result = db.tx(() => {
    const out = adjustStock(itemId, { ...body, userId: req.user.id });
    if (body.type === 'restock' && body.recordExpense) {
      const cost = Math.round(body.quantity * (body.unitCost ?? out.item.cost_per_unit));
      if (cost > 0) {
        db.run(
          `INSERT INTO expenses (category, description, amount, method, from_drawer, user_id, business_date, created_at)
           VALUES ('Ingredients & supplies', ?, ?, ?, 0, ?, ?, ?)`,
          [`Restock: ${out.item.name} (${body.quantity} ${out.item.unit})`, cost, body.expenseMethod, req.user.id, businessDate(timezone()), now()],
        );
      }
    }
    return out;
  });
  audit(req, `inventory.${body.type}`, 'inventory_item', itemId, {
    name: result.item.name,
    change: result.change,
    balance: result.balance,
    note: body.note || undefined,
  });
  res.json({ item: listItems('i.id = ?', [itemId])[0] });
});

router.get('/inventory/movements', requirePerm('inventory.view'), (req, res) => {
  const q = parse(
    z.object({
      itemId: id.optional(),
      reason: z.enum(['restock', 'sale', 'waste', 'correction', 'return']).optional(),
      from: dateStr.optional(),
      to: dateStr.optional(),
      page: z.coerce.number().int().min(1).optional().default(1),
    }),
    req.query,
  );
  const where = [];
  const params = [];
  for (const [sql, value] of [
    ['s.inventory_item_id = ?', q.itemId],
    ['s.reason = ?', q.reason],
    ['s.business_date >= ?', q.from],
    ['s.business_date <= ?', q.to],
  ]) {
    if (value === undefined) continue;
    where.push(sql);
    params.push(value);
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const pageSize = 100;
  const { count } = db.get(`SELECT COUNT(*) AS count FROM stock_movements s ${clause}`, params);
  const rows = db.all(
    `SELECT s.*, i.name AS item_name, i.unit, u.name AS user_name, o.order_number
     FROM stock_movements s JOIN inventory_items i ON i.id = s.inventory_item_id
     LEFT JOIN users u ON u.id = s.user_id LEFT JOIN orders o ON o.id = s.order_id
     ${clause} ORDER BY s.id DESC LIMIT ? OFFSET ?`,
    [...params, pageSize, (q.page - 1) * pageSize],
  );
  res.json({ rows, count, page: q.page, pageSize });
});

export default router;
