import { db, now } from '../db/index.js';
import { badRequest, notFound } from '../lib/errors.js';
import { businessDate } from '../lib/time.js';
import { timezone } from './settings.js';

const round3 = (n) => Math.round(n * 1000) / 1000;

function placeholders(list) {
  return list.map(() => '?').join(',');
}

/** Menu item ids that cannot be made from current stock, even once. */
export function soldOutMenuItemIds() {
  return new Set(
    db
      .all(
        `SELECT DISTINCT r.menu_item_id AS id FROM recipe_items r
         JOIN inventory_items i ON i.id = r.inventory_item_id
         WHERE i.quantity < r.quantity`,
      )
      .map((r) => r.id),
  );
}

/**
 * Checks a basket against stock. lines: [{ menuItemId, name, quantity }].
 * Returns the name of the first dish that cannot be fulfilled, or null.
 */
export function findShortage(lines) {
  const ids = [...new Set(lines.map((l) => l.menuItemId))];
  if (!ids.length) return null;
  const recipes = db.all(
    `SELECT r.menu_item_id, r.inventory_item_id, r.quantity AS per_serving, i.quantity AS on_hand
     FROM recipe_items r JOIN inventory_items i ON i.id = r.inventory_item_id
     WHERE r.menu_item_id IN (${placeholders(ids)})`,
    ids,
  );
  const needed = new Map();
  for (const line of lines) {
    for (const r of recipes.filter((x) => x.menu_item_id === line.menuItemId)) {
      const entry = needed.get(r.inventory_item_id) ?? { need: 0, onHand: r.on_hand, dishes: [] };
      entry.need += r.per_serving * line.quantity;
      entry.dishes.push(line.name);
      needed.set(r.inventory_item_id, entry);
    }
  }
  for (const entry of needed.values()) {
    if (entry.need > entry.onHand + 1e-9) return entry.dishes[0];
  }
  return null;
}

function move(itemId, change, reason, { orderId = null, note = null, userId = null, unitCost } = {}) {
  const item = db.get('SELECT * FROM inventory_items WHERE id = ?', [itemId]);
  const balance = round3(item.quantity + change);
  const at = now();
  db.run('UPDATE inventory_items SET quantity = ?, updated_at = ? WHERE id = ?', [balance, at, itemId]);
  db.run(
    `INSERT INTO stock_movements (inventory_item_id, change, balance_after, reason, unit_cost, order_id, note, user_id, business_date, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [itemId, round3(change), balance, reason, unitCost ?? item.cost_per_unit, orderId, note, userId, businessDate(timezone()), at],
  );
  return balance;
}

/** Deducts every recipe ingredient for an order. Stock may go negative: the kitchen already committed. */
export function deductStockForOrder(orderId, userId = null) {
  const usage = db.all(
    `SELECT r.inventory_item_id AS id, SUM(r.quantity * oi.quantity) AS qty
     FROM order_items oi JOIN recipe_items r ON r.menu_item_id = oi.menu_item_id
     WHERE oi.order_id = ? GROUP BY r.inventory_item_id`,
    [orderId],
  );
  for (const u of usage) move(u.id, -u.qty, 'sale', { orderId, userId });
  db.run('UPDATE orders SET stock_deducted = 1 WHERE id = ?', [orderId]);
}

/** Puts back exactly what an order took, using its own movement history rather than today's recipes. */
export function restoreStockForOrder(orderId, userId = null) {
  const taken = db.all(
    `SELECT inventory_item_id AS id, SUM(change) AS net FROM stock_movements
     WHERE order_id = ? AND reason IN ('sale', 'return') GROUP BY inventory_item_id`,
    [orderId],
  );
  for (const t of taken) {
    if (t.net < 0) move(t.id, -t.net, 'return', { orderId, userId, note: 'Order cancelled' });
  }
  db.run('UPDATE orders SET stock_deducted = 0 WHERE id = ?', [orderId]);
}

/**
 * Manual stock changes. restock and waste take a positive quantity;
 * correction takes the newly counted quantity on hand.
 */
export function adjustStock(itemId, { type, quantity, unitCost, note, userId }) {
  const item = db.get('SELECT * FROM inventory_items WHERE id = ? AND archived = 0', [itemId]);
  if (!item) throw notFound('Stock item not found');

  let change;
  if (type === 'restock') {
    if (!(quantity > 0)) throw badRequest('Enter how much stock arrived');
    change = quantity;
    if (unitCost !== undefined && unitCost !== null) {
      db.run('UPDATE inventory_items SET cost_per_unit = ? WHERE id = ?', [unitCost, itemId]);
    }
  } else if (type === 'waste') {
    if (!(quantity > 0)) throw badRequest('Enter how much was wasted');
    change = -quantity;
  } else {
    if (!(quantity >= 0)) throw badRequest('Enter the quantity you counted');
    change = quantity - item.quantity;
    if (Math.abs(change) < 1e-9) throw badRequest('The count matches the stock on record, so nothing changed');
  }
  const balance = move(itemId, change, type, { note, userId, unitCost: unitCost ?? undefined });
  return { item, change: round3(change), balance };
}

export function lowStockItems() {
  return db.all(
    `SELECT id, name, unit, quantity, reorder_level FROM inventory_items
     WHERE archived = 0 AND quantity <= reorder_level ORDER BY (quantity - reorder_level) ASC LIMIT 20`,
  );
}
