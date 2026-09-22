import assert from 'node:assert/strict';
import { once } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fro-grills-xperience-test-'));
process.env.NODE_ENV = 'test';
process.env.DB_PATH = path.join(dir, 'test.db');
process.env.UPLOAD_DIR = path.join(dir, 'uploads');
process.env.CLIENT_DIST = path.join(dir, 'no-client-build');

const { closeDb, db, openDb } = await import('../src/db/index.js');
const { createApp } = await import('../src/app.js');
const { updateSettings } = await import('../src/services/settings.js');
const bcrypt = (await import('bcryptjs')).default;

openDb(process.env.DB_PATH);

// ---------------------------------------------------------------- fixtures

const at = new Date().toISOString();
const hash = bcrypt.hashSync('password123', 4);
for (const role of ['owner', 'manager', 'cashier', 'kitchen']) {
  db.run('INSERT INTO users (name, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)', [
    `Test ${role}`,
    `${role}@test.dev`,
    hash,
    role,
    at,
  ]);
}
// Open around the clock so the tests never depend on the time they run.
updateSettings({
  hours: [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, closed: false, open: '00:00', close: '00:00' })),
  ordering: { deliveryFee: 100000, taxRate: 0, autoAccept: false },
});

const category = Number(db.run("INSERT INTO categories (name, slug, created_at) VALUES ('Grills', 'grills', ?)", [at]).lastInsertRowid);
const addItem = (name, slug, price) =>
  Number(
    db.run('INSERT INTO menu_items (category_id, name, slug, price, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)', [
      category,
      name,
      slug,
      price,
      at,
      at,
    ]).lastInsertRowid,
  );
const addStock = (name, quantity) =>
  Number(
    db.run(
      "INSERT INTO inventory_items (name, unit, quantity, cost_per_unit, created_at, updated_at) VALUES (?, 'kg', ?, 500000, ?, ?)",
      [name, quantity, at, at],
    ).lastInsertRowid,
  );
const SUYA = addItem('Beef Suya', 'beef-suya', 300000);
const WATER = addItem('Water', 'water', 50000);
const FISH = addItem('Grilled Fish', 'grilled-fish', 900000);
const BEEF = addStock('Beef', 10);
const FISH_STOCK = addStock('Croaker', 1);
db.run('INSERT INTO recipe_items (menu_item_id, inventory_item_id, quantity) VALUES (?, ?, 0.25)', [SUYA, BEEF]);
db.run('INSERT INTO recipe_items (menu_item_id, inventory_item_id, quantity) VALUES (?, ?, 1)', [FISH, FISH_STOCK]);

const stockOf = (itemId) => db.get('SELECT quantity FROM inventory_items WHERE id = ?', [itemId]).quantity;

// ---------------------------------------------------------------- harness

let server;
let base;

before(async () => {
  server = createApp().listen(0);
  await once(server, 'listening');
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server.close();
  closeDb();
  fs.rmSync(dir, { recursive: true, force: true });
});

function client() {
  let cookie = '';
  return async (method, url, body) => {
    const res = await fetch(base + url, {
      method,
      headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    for (const header of res.headers.getSetCookie()) {
      const [pair] = header.split(';');
      if (pair.startsWith('fgx_session=')) cookie = pair;
    }
    const type = res.headers.get('content-type') ?? '';
    return { status: res.status, data: type.includes('json') ? await res.json() : await res.text() };
  };
}

async function staff(role) {
  const call = client();
  const res = await call('POST', '/api/auth/login', { email: `${role}@test.dev`, password: 'password123' });
  assert.equal(res.status, 200, JSON.stringify(res.data));
  return call;
}

const guest = client();
const onlineOrder = (items, extra = {}) =>
  guest('POST', '/api/public/orders', {
    type: 'delivery',
    customer: { name: 'Ada Customer', phone: '08012345678' },
    deliveryAddress: '1 Test Street',
    paymentMethod: 'cash',
    items,
    ...extra,
  });

let onlineNumber;
let onlineToken;

// ---------------------------------------------------------------- tests

test('the storefront serves the menu with live sold-out flags', async () => {
  const { status, data } = await guest('GET', '/api/public/menu');
  assert.equal(status, 200);
  const items = data.categories.flatMap((c) => c.items);
  assert.equal(items.length, 3);
  assert.equal(items.find((i) => i.id === FISH).sold_out, false);
});

test('online orders are priced by the server, not the browser', async () => {
  const res = await onlineOrder([{ menuItemId: SUYA, quantity: 2, price: 1 }]);
  assert.equal(res.status, 201, JSON.stringify(res.data));
  assert.equal(res.data.total, 2 * 300000 + 100000);
  onlineNumber = res.data.order_number;
  onlineToken = res.data.token;

  const tracked = await guest('GET', `/api/public/orders/${onlineNumber}?token=${onlineToken}`);
  assert.equal(tracked.status, 200);
  assert.equal(tracked.data.status, 'pending');
  assert.equal((await guest('GET', `/api/public/orders/${onlineNumber}?token=wrong`)).status, 404);
  // A pending order has not touched stock yet.
  assert.equal(stockOf(BEEF), 10);
});

test('dishes without enough stock cannot be ordered', async () => {
  const res = await onlineOrder([{ menuItemId: FISH, quantity: 2 }]);
  assert.equal(res.status, 409);
  assert.match(res.data.error, /sold out/);
});

test('checkout validation explains what is missing', async () => {
  const res = await onlineOrder([{ menuItemId: WATER, quantity: 1 }], { deliveryAddress: '' });
  assert.equal(res.status, 400);
  assert.match(res.data.error, /delivery address/);
});

test('roles only reach what they are allowed to', async () => {
  const cashier = await staff('cashier');
  assert.equal((await cashier('GET', '/api/admin/dashboard')).status, 403);
  assert.equal((await cashier('GET', '/api/admin/staff')).status, 403);
  assert.equal((await guest('GET', '/api/admin/orders')).status, 401);
});

test('cash cannot be taken without an open shift, and the drawer reconciles', async () => {
  const cashier = await staff('cashier');
  const order = {
    type: 'dine_in',
    tableNumber: '4',
    paymentMethod: 'cash',
    items: [{ menuItemId: SUYA, quantity: 1 }],
    payment: { method: 'cash', amount: 300000 },
  };
  const blocked = await cashier('POST', '/api/admin/orders', order);
  assert.equal(blocked.status, 409);
  // The failed attempt left nothing behind.
  assert.equal(db.get("SELECT COUNT(*) AS n FROM orders WHERE channel = 'pos'").n, 0);

  const shift = await cashier('POST', '/api/admin/shifts/open', { openingFloat: 1000000 });
  assert.equal(shift.status, 201);

  const paid = await cashier('POST', '/api/admin/orders', order);
  assert.equal(paid.status, 201, JSON.stringify(paid.data));
  assert.equal(paid.data.order.payment_status, 'paid');
  assert.equal(paid.data.order.status, 'confirmed');
  assert.equal(stockOf(BEEF), 9.75);

  const closed = await cashier('POST', `/api/admin/shifts/${shift.data.shift.id}/close`, { countedCash: 1290000 });
  assert.equal(closed.status, 200);
  assert.equal(closed.data.shift.expected_cash, 1300000);
  assert.equal(closed.data.shift.variance, -10000);
});

test('accepting an order uses stock; cancelling before cooking returns it', async () => {
  const cashier = await staff('cashier');
  const manager = await staff('manager');
  const { data } = await manager('GET', `/api/admin/orders?q=${onlineNumber}`);
  const orderId = data.rows[0].id;

  const accepted = await cashier('POST', `/api/admin/orders/${orderId}/status`, { status: 'confirmed' });
  assert.equal(accepted.status, 200);
  assert.equal(stockOf(BEEF), 9.25);

  assert.equal((await cashier('POST', `/api/admin/orders/${orderId}/cancel`, { reason: 'Customer called' })).status, 403);
  const cancelled = await manager('POST', `/api/admin/orders/${orderId}/cancel`, { reason: 'Customer called' });
  assert.equal(cancelled.status, 200);
  assert.equal(stockOf(BEEF), 9.75);

  const tracked = await guest('GET', `/api/public/orders/${onlineNumber}?token=${onlineToken}`);
  assert.equal(tracked.data.status, 'cancelled');
});

test('a paid order must be refunded before it can be cancelled', async () => {
  const manager = await staff('manager');
  const created = await manager('POST', '/api/admin/orders', {
    type: 'pickup',
    paymentMethod: 'card',
    items: [{ menuItemId: WATER, quantity: 2 }],
    payment: { method: 'card', amount: 100000 },
  });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  const orderId = created.data.order.id;

  const blocked = await manager('POST', `/api/admin/orders/${orderId}/cancel`, { reason: 'Wrong order' });
  assert.equal(blocked.status, 409);

  const refund = await manager('POST', `/api/admin/orders/${orderId}/refunds`, { method: 'card', amount: 100000, reason: 'Wrong order' });
  assert.equal(refund.status, 200);
  assert.equal(refund.data.order.payment_status, 'refunded');
  assert.equal((await manager('POST', `/api/admin/orders/${orderId}/cancel`, { reason: 'Wrong order' })).status, 200);
});

test('only managers can give discounts', async () => {
  const cashier = await staff('cashier');
  const res = await cashier('POST', '/api/admin/orders', {
    type: 'pickup',
    paymentMethod: 'card',
    items: [{ menuItemId: WATER, quantity: 1 }],
    discount: 10000,
    discountReason: 'Friend',
  });
  assert.equal(res.status, 403);
});

test('the kitchen can move orders along but cannot close them out', async () => {
  const manager = await staff('manager');
  const kitchen = await staff('kitchen');
  const { data } = await manager('POST', '/api/admin/orders', {
    type: 'dine_in',
    paymentMethod: 'card',
    items: [{ menuItemId: WATER, quantity: 1 }],
  });
  const orderId = data.order.id;
  assert.equal((await kitchen('POST', `/api/admin/orders/${orderId}/status`, { status: 'preparing' })).status, 200);
  assert.equal((await kitchen('POST', `/api/admin/orders/${orderId}/status`, { status: 'completed' })).status, 403);
  assert.equal((await kitchen('POST', `/api/admin/orders/${orderId}/payments`, { method: 'card', amount: 50000 })).status, 403);
  const queue = await kitchen('GET', '/api/admin/kitchen');
  assert.ok(queue.data.orders.some((o) => o.id === orderId && o.status === 'preparing'));
});

test('reports add up money received, refunds, cancellations and drawer shortfalls', async () => {
  const owner = await staff('owner');
  const { status, data } = await owner('GET', '/api/admin/reports');
  assert.equal(status, 200);
  assert.equal(data.totals.received, 300000 + 100000);
  assert.equal(data.totals.refunded, 100000);
  assert.equal(data.totals.collected, 300000);
  assert.equal(data.totals.cancelled, 2);
  assert.equal(data.totals.cash_variance, -10000);
  // One serving of suya: 0.25kg of beef at ₦5,000/kg.
  assert.equal(data.totals.food_cost, 125000);
  assert.ok(data.by_staff.some((s) => s.name === 'Test cashier' && s.collected === 300000));
});

test('every staff action lands in the activity log', async () => {
  const owner = await staff('owner');
  const { data } = await owner('GET', '/api/admin/audit?action=order.cancel');
  assert.equal(data.rows.length, 2);
  assert.ok(data.rows.every((r) => r.user_name === 'Test manager' && r.details.reason));
});

test('editing one field of a dish leaves the others alone, and price changes are logged', async () => {
  const manager = await staff('manager');
  db.run('UPDATE menu_items SET featured = 1, available = 1 WHERE id = ?', [WATER]);
  const res = await manager('PATCH', `/api/admin/menu-items/${WATER}`, { price: 60000 });
  assert.equal(res.status, 200, JSON.stringify(res.data));
  assert.equal(res.data.item.price, 60000);
  assert.equal(res.data.item.featured, 1);
  assert.equal(res.data.item.available, 1);
  const log = db.get("SELECT details FROM audit_logs WHERE action = 'menu.update' ORDER BY id DESC LIMIT 1");
  assert.deepEqual(JSON.parse(log.details).price, { from: 50000, to: 60000 });
});

test('a restock updates stock and can book the purchase as an expense', async () => {
  const manager = await staff('manager');
  const before = stockOf(BEEF);
  const res = await manager('POST', `/api/admin/inventory/${BEEF}/adjust`, {
    type: 'restock',
    quantity: 4,
    unitCost: 600000,
    recordExpense: true,
    expenseMethod: 'transfer',
  });
  assert.equal(res.status, 200, JSON.stringify(res.data));
  assert.equal(stockOf(BEEF), before + 4);
  const expense = db.get("SELECT * FROM expenses WHERE category = 'Ingredients & supplies' ORDER BY id DESC LIMIT 1");
  assert.equal(expense.amount, 2400000);
  // Waste needs an explanation.
  assert.equal((await manager('POST', `/api/admin/inventory/${BEEF}/adjust`, { type: 'waste', quantity: 1 })).status, 400);
});

test('only the owner changes settings, and bad values are rejected', async () => {
  const manager = await staff('manager');
  const owner = await staff('owner');
  assert.equal((await manager('PUT', '/api/admin/settings', { ordering: { deliveryFee: 0 } })).status, 403);
  assert.equal((await owner('PUT', '/api/admin/settings', { locale: { timezone: 'Mars/Olympus' } })).status, 400);
  const ok = await owner('PUT', '/api/admin/settings', { restaurant: { phone: '+234 901 000 0000' } });
  assert.equal(ok.status, 200);
  assert.equal(ok.data.settings.restaurant.phone, '+234 901 000 0000');
  // A partial update keeps the rest of the section.
  assert.equal(ok.data.settings.restaurant.name, 'Fro Grills Xperience');
});

test('search engines get a sitemap and robots rules', async () => {
  const sitemap = await guest('GET', '/sitemap.xml');
  assert.match(sitemap.data, /\/menu\/beef-suya/);
  const robots = await guest('GET', '/robots.txt');
  assert.match(robots.data, /Disallow: \/admin/);
});
