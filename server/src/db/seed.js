/**
 * npm run seed            owner account + starter menu and stock (safe to re-run)
 * npm run seed:demo       the above plus 30 days of sample orders, payments, shifts and expenses
 * add -- --reset          wipe the database first
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import bcrypt from 'bcryptjs';
import { config } from '../config.js';
import { addDays, businessDate, startOfLocalDay } from '../lib/time.js';
import { slugify } from '../lib/slug.js';
import { db, openDb } from './index.js';

const args = new Set(process.argv.slice(2));
const DEMO = args.has('--demo');

if (args.has('--reset')) {
  for (const suffix of ['', '-wal', '-shm']) fs.rmSync(config.dbPath + suffix, { force: true });
  console.log('Database wiped.');
}
openDb(config.dbPath);

const TZ = 'Africa/Lagos';
const naira = (n) => Math.round(n * 100);
const iso = () => new Date().toISOString();

// ---------------------------------------------------------------- staff

const created = [];
function ensureUser(name, email, role, password) {
  if (db.get('SELECT id FROM users WHERE email = ?', [email])) return db.get('SELECT id FROM users WHERE email = ?', [email]).id;
  const { lastInsertRowid } = db.run(
    'INSERT INTO users (name, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)',
    [name, email, bcrypt.hashSync(password, 10), role, iso()],
  );
  created.push({ role, email, password });
  return Number(lastInsertRowid);
}

const hasUsers = db.get('SELECT COUNT(*) AS n FROM users').n > 0;
const ownerEmail = process.env.OWNER_EMAIL || 'owner@frogrillsxperience.com';
const ownerPassword =
  process.env.OWNER_PASSWORD || (DEMO ? 'demo1234' : crypto.randomBytes(9).toString('base64url'));
const ownerId = hasUsers
  ? db.get("SELECT id FROM users WHERE role = 'owner' ORDER BY id LIMIT 1").id
  : ensureUser(process.env.OWNER_NAME || 'Fro Grills Xperience Owner', ownerEmail, 'owner', ownerPassword);

let managerId = ownerId;
let cashierId = ownerId;
if (DEMO) {
  managerId = ensureUser('Adaeze Okafor', 'manager@frogrillsxperience.com', 'manager', 'demo1234');
  cashierId = ensureUser('Tunde Bakare', 'cashier@frogrillsxperience.com', 'cashier', 'demo1234');
  ensureUser('Musa Ibrahim', 'kitchen@frogrillsxperience.com', 'kitchen', 'demo1234');
}

// ---------------------------------------------------------------- menu & stock

const STOCK = [
  // name, unit, cost per unit (₦), reorder level, quantity on hand
  ['Whole chicken', 'pcs', 6000, 10, 34],
  ['Beef', 'kg', 7000, 5, 14],
  ['Goat meat', 'kg', 8500, 4, 3.2],
  ['Croaker fish', 'pcs', 5000, 6, 12],
  ['Catfish', 'pcs', 6500, 4, 8],
  ['Turkey wings', 'kg', 7500, 4, 10],
  ['Gizzard', 'kg', 5000, 2, 6],
  ['Rice', 'kg', 1600, 20, 45],
  ['Plantain', 'pcs', 350, 30, 22],
  ['Potatoes', 'kg', 1500, 10, 18],
  ['Vegetable oil', 'L', 2800, 10, 25],
  ['Suya spice (yaji)', 'kg', 6000, 1, 2.5],
  ['Grill marinade', 'kg', 3000, 3, 7],
  ['Tomato & pepper base', 'kg', 2500, 5, 12],
  ['Onions', 'kg', 1200, 3, 8],
  ['Charcoal', 'kg', 600, 25, 60],
  ['Coca-Cola 50cl', 'bottles', 400, 24, 40],
  ['Bottled water 75cl', 'bottles', 200, 24, 60],
  ['Malt', 'bottles', 450, 24, 30],
  ['Zobo leaves', 'kg', 2500, 1, 3],
];

const MENU = [
  {
    category: 'Grills & Barbecue',
    description: 'Marinated overnight and cooked slow over real charcoal.',
    items: [
      ['Fro Signature Grilled Chicken (Half)', 7500, 'Half a chicken in our house marinade, flame-grilled until smoky and charred at the edges. Served with pepper sauce.', ['popular', 'spicy'], true, { 'Whole chicken': 0.5, 'Grill marinade': 0.08, Charcoal: 0.4 }],
      ['Grilled Chicken (Quarter)', 4000, 'A quarter of our signature grilled chicken, perfect with a side.', ['spicy'], false, { 'Whole chicken': 0.25, 'Grill marinade': 0.04, Charcoal: 0.2 }],
      ['Beef Suya (Full Wrap)', 3500, 'Thin-sliced beef coated in yaji spice, grilled on skewers and wrapped with onions, tomatoes and cabbage.', ['popular', 'spicy'], true, { Beef: 0.25, 'Suya spice (yaji)': 0.03, Onions: 0.05, Charcoal: 0.15 }],
      ['Chicken Suya', 3500, 'Boneless chicken thigh in yaji spice, grilled on skewers.', ['spicy'], false, { 'Whole chicken': 0.3, 'Suya spice (yaji)': 0.03, Onions: 0.05, Charcoal: 0.15 }],
      ['Asun (Spicy Goat Meat)', 5000, 'Smoked goat meat tossed in a fiery pepper and onion sauce. Not for the faint-hearted.', ['popular', 'spicy'], true, { 'Goat meat': 0.3, 'Tomato & pepper base': 0.05, Onions: 0.05, Charcoal: 0.15 }],
      ['Grilled Croaker Fish', 9500, 'Whole croaker stuffed with herbs, grilled and finished with our pepper sauce.', ['chef-special'], true, { 'Croaker fish': 1, 'Grill marinade': 0.1, Charcoal: 0.4 }],
      ['Grilled Catfish (Point & Kill)', 12000, 'Fresh catfish, grilled whole and served with spicy sauce and plantain.', ['chef-special', 'spicy'], false, { Catfish: 1, 'Grill marinade': 0.12, Charcoal: 0.5 }],
      ['Barbecue Turkey Wings', 6500, 'Sticky, smoky turkey wings glazed with our barbecue sauce.', [], false, { 'Turkey wings': 0.4, 'Grill marinade': 0.06, Charcoal: 0.3 }],
    ],
  },
  {
    category: 'Grill Platters',
    description: 'Built for sharing. Every platter comes with dodo and fries.',
    items: [
      ['Xperience Platter for Two', 22000, 'Half chicken, beef suya, asun, dodo and fries on one board.', ['chef-special', 'popular'], true, { 'Whole chicken': 0.5, Beef: 0.2, 'Goat meat': 0.2, Plantain: 2, Potatoes: 0.3, 'Vegetable oil': 0.1, 'Suya spice (yaji)': 0.03, Charcoal: 0.6 }],
      ['Family Grill Box (4–5 people)', 45000, 'A whole chicken, suya, asun, turkey wings, dodo and fries. Feeds the whole crew.', ['new'], false, { 'Whole chicken': 1, Beef: 0.5, 'Goat meat': 0.4, 'Turkey wings': 0.4, Plantain: 4, Potatoes: 0.6, 'Vegetable oil': 0.2, Charcoal: 1.2 }],
      ['Suya & Asun Combo', 8000, 'The best of both: a full suya wrap and a bowl of asun.', ['spicy'], false, { Beef: 0.2, 'Goat meat': 0.2, 'Suya spice (yaji)': 0.03, Charcoal: 0.2 }],
    ],
  },
  {
    category: 'Rice & Mains',
    description: 'The perfect partner for anything off the grill.',
    items: [
      ['Smoky Party Jollof', 2500, 'Firewood-style jollof with that bottom-of-the-pot smokiness.', ['popular'], true, { Rice: 0.15, 'Tomato & pepper base': 0.08, 'Vegetable oil': 0.02 }],
      ['Fried Rice', 2800, 'Nigerian-style fried rice with mixed vegetables and liver.', [], false, { Rice: 0.15, 'Vegetable oil': 0.03 }],
      ['Ofada Rice & Ayamase', 4500, 'Local ofada rice with green pepper ayamase stew and assorted meat.', ['spicy'], false, { Rice: 0.15, 'Tomato & pepper base': 0.1, 'Vegetable oil': 0.04 }],
      ['Spaghetti Stir-fry', 2500, 'Spicy stir-fried spaghetti with peppers and onions.', [], false, null],
    ],
  },
  {
    category: 'Sides',
    description: '',
    items: [
      ['Fried Plantain (Dodo)', 1500, 'Sweet ripe plantain, fried golden.', ['vegetarian'], false, { Plantain: 1.5, 'Vegetable oil': 0.05 }],
      ['Gizdodo', 3500, 'Gizzard and dodo in a spicy pepper sauce.', ['spicy'], false, { Gizzard: 0.2, Plantain: 1, 'Tomato & pepper base': 0.05, 'Vegetable oil': 0.03 }],
      ['French Fries', 1800, 'Crispy fries, lightly salted.', ['vegetarian'], false, { Potatoes: 0.25, 'Vegetable oil': 0.05 }],
      ['Boli & Groundnut', 1500, 'Roasted plantain with roasted groundnuts. A street classic.', ['vegetarian'], false, null],
      ['Yam Chips', 1500, 'Fried yam chips with pepper sauce.', ['vegetarian'], false, null],
      ['Coleslaw', 1000, 'Creamy, crunchy and cooling.', ['vegetarian'], false, null],
    ],
  },
  {
    category: 'Drinks',
    description: 'Served chilled.',
    items: [
      ['Chapman', 2500, 'The classic Nigerian party mocktail with cucumber and citrus.', ['popular'], false, null],
      ['Zobo (50cl)', 1200, 'Hibiscus drink with ginger and pineapple.', ['vegetarian'], false, { 'Zobo leaves': 0.02 }],
      ['Fresh Pineapple Juice', 2000, 'Pressed daily.', ['vegetarian'], false, null],
      ['Coca-Cola (50cl)', 700, '', [], false, { 'Coca-Cola 50cl': 1 }],
      ['Malt', 800, '', [], false, { Malt: 1 }],
      ['Bottled Water (75cl)', 500, '', [], false, { 'Bottled water 75cl': 1 }],
    ],
  },
];

const hasMenu = db.get('SELECT COUNT(*) AS n FROM categories').n > 0;
const stockIds = new Map();
const menuItems = [];

if (!hasMenu) {
  db.tx(() => {
    const at = iso();
    for (const [name, unit, cost, reorder] of STOCK) {
      const { lastInsertRowid } = db.run(
        'INSERT INTO inventory_items (name, unit, quantity, reorder_level, cost_per_unit, created_at, updated_at) VALUES (?, ?, 0, ?, ?, ?, ?)',
        [name, unit, reorder, naira(cost), at, at],
      );
      stockIds.set(name, Number(lastInsertRowid));
    }
    MENU.forEach((section, ci) => {
      const { lastInsertRowid: categoryId } = db.run(
        'INSERT INTO categories (name, slug, description, sort_order, created_at) VALUES (?, ?, ?, ?, ?)',
        [section.category, slugify(section.category), section.description, ci, at],
      );
      section.items.forEach(([name, price, description, tags, featured, recipe], ii) => {
        const { lastInsertRowid: itemId } = db.run(
          `INSERT INTO menu_items (category_id, name, slug, description, price, featured, tags, sort_order, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [categoryId, name, slugify(name), description, naira(price), featured, JSON.stringify(tags), ii, at, at],
        );
        for (const [stockName, qty] of Object.entries(recipe ?? {})) {
          db.run('INSERT INTO recipe_items (menu_item_id, inventory_item_id, quantity) VALUES (?, ?, ?)', [
            itemId,
            stockIds.get(stockName),
            qty,
          ]);
        }
        menuItems.push({ id: Number(itemId), name, price: naira(price), category: section.category, recipe: recipe ?? {}, popular: tags.includes('popular') || featured });
      });
    });
  });
  console.log(`Menu created: ${menuItems.length} dishes in ${MENU.length} categories, ${STOCK.length} stock items.`);
}

// ---------------------------------------------------------------- demo history

// Seeded PRNG so every demo database looks the same.
let seed = 20260922;
const rand = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const pick = (list) => list[Math.floor(rand() * list.length)];
const weighted = (pairs) => {
  const total = pairs.reduce((s, [, w]) => s + w, 0);
  let r = rand() * total;
  for (const [value, w] of pairs) if ((r -= w) <= 0) return value;
  return pairs[0][0];
};

function generateHistory() {
  const today = businessDate(TZ);
  const nowMs = Date.now();
  const HOURS = [[10, 1], [11, 2], [12, 4], [13, 5], [14, 3], [15, 2], [16, 2], [17, 3], [18, 5], [19, 6], [20, 5], [21, 2]];
  const mains = menuItems.filter((m) => !['Drinks', 'Sides'].includes(m.category));
  const sides = menuItems.filter((m) => m.category === 'Sides');
  const drinks = menuItems.filter((m) => m.category === 'Drinks');
  const mainWeights = mains.map((m) => [m, m.popular ? 4 : 1]);
  const names = ['Chioma', 'Emeka', 'Bola', 'Ifeanyi', 'Kemi', 'Segun', 'Aisha', 'Femi', 'Ngozi', 'Yusuf', 'Tolu', 'Zainab', 'Dayo', 'Uche', 'Halima'];
  const streets = ['14 Admiralty Way, Lekki', '3 Fola Osibo St, Lekki Phase 1', '22 Bourdillon Rd, Ikoyi', '7 Ajose Adeogun St, VI', '41 Chevron Drive, Lekki'];

  const orders = [];
  for (let offset = -30; offset <= 0; offset++) {
    const day = addDays(today, offset);
    const weekday = new Date(`${day}T12:00:00Z`).getUTCDay();
    const count = 18 + ([0, 5, 6].includes(weekday) ? 10 : 0) + Math.floor(rand() * 9);
    const dayStart = startOfLocalDay(TZ, day).getTime();
    for (let n = 0; n < count; n++) {
      const minute = weighted(HOURS) * 60 + Math.floor(rand() * 60);
      const at = dayStart + minute * 60000;
      if (at > nowMs - 5 * 60000) continue;
      const channel = rand() < 0.4 ? 'online' : 'pos';
      const type = channel === 'online' ? weighted([['delivery', 65], ['pickup', 35]]) : weighted([['dine_in', 55], ['pickup', 35], ['delivery', 10]]);
      const lines = [{ item: weighted(mainWeights), quantity: rand() < 0.2 ? 2 : 1 }];
      if (rand() < 0.35) lines.push({ item: weighted(mainWeights), quantity: 1 });
      if (rand() < 0.5) lines.push({ item: pick(sides), quantity: 1 });
      if (rand() < 0.65) lines.push({ item: pick(drinks), quantity: rand() < 0.3 ? 2 : 1 });
      const merged = new Map();
      for (const l of lines) merged.set(l.item.id, { item: l.item, quantity: (merged.get(l.item.id)?.quantity ?? 0) + l.quantity });
      orders.push({ day, at, channel, type, lines: [...merged.values()], name: pick(names), address: pick(streets), offset });
    }
  }
  orders.sort((a, b) => a.at - b.at);

  // Most of today's orders are done; the latest few are still moving through the kitchen.
  const todays = orders.filter((o) => o.offset === 0);
  const liveStatuses = ['pending', 'confirmed', 'preparing', 'preparing', 'ready', 'out_for_delivery'];
  todays.slice(-liveStatuses.length).forEach((o, i) => {
    o.status = liveStatuses[i];
    if (o.status === 'out_for_delivery') o.type = 'delivery';
    if (o.status === 'pending') o.channel = 'online';
  });
  for (const o of orders) {
    if (o.status) continue;
    o.status = rand() < 0.04 ? 'cancelled' : 'completed';
    // A handful of served-but-unpaid orders, so the leakage warnings have something to show.
    o.unpaid = o.status === 'completed' && o.offset > -6 && rand() < 0.03;
    o.discount = o.channel === 'pos' && rand() < 0.04;
  }

  // Opening stock = what is left today + everything the demo orders will use.
  const usage = new Map();
  for (const o of orders) {
    if (o.status === 'cancelled' || o.status === 'pending') continue;
    for (const l of o.lines) {
      for (const [stockName, qty] of Object.entries(l.item.recipe)) {
        usage.set(stockName, (usage.get(stockName) ?? 0) + qty * l.quantity);
      }
    }
  }
  const balances = new Map();
  const openingDay = addDays(today, -31);
  const openingAt = new Date(startOfLocalDay(TZ, openingDay).getTime() + 9 * 3600000).toISOString();
  for (const [name, , cost, , onHand] of STOCK) {
    const opening = Math.round((onHand + (usage.get(name) ?? 0)) * 1000) / 1000;
    balances.set(name, opening);
    db.run('UPDATE inventory_items SET quantity = ? WHERE id = ?', [opening, stockIds.get(name)]);
    db.run(
      `INSERT INTO stock_movements (inventory_item_id, change, balance_after, reason, unit_cost, note, user_id, business_date, created_at)
       VALUES (?, ?, ?, 'correction', ?, 'Opening stock', ?, ?, ?)`,
      [stockIds.get(name), opening, opening, naira(cost), managerId, openingDay, openingAt],
    );
  }

  // One cash shift per day for the cashier.
  const shifts = new Map();
  for (let offset = -30; offset <= 0; offset++) {
    const day = addDays(today, offset);
    const opened = new Date(startOfLocalDay(TZ, day).getTime() + 9.5 * 3600000);
    if (opened.getTime() > nowMs) continue;
    // Only today's shift is still open; past ones are reconciled further down.
    const { lastInsertRowid } = db.run(
      'INSERT INTO shifts (user_id, status, opening_float, opened_at, business_date) VALUES (?, ?, ?, ?, ?)',
      [cashierId, offset === 0 ? 'open' : 'closed', naira(20000), opened.toISOString(), day],
    );
    shifts.set(day, { id: Number(lastInsertRowid), cash: 0, payouts: 0 });
  }

  const insertEvent = (orderId, status, atMs, userId, note = null) =>
    db.run('INSERT INTO order_events (order_id, status, note, user_id, created_at) VALUES (?, ?, ?, ?, ?)', [
      orderId,
      status,
      note,
      userId,
      new Date(atMs).toISOString(),
    ]);

  let id = 0;
  for (const o of orders) {
    id += 1;
    const subtotal = o.lines.reduce((s, l) => s + l.item.price * l.quantity, 0);
    const discount = o.discount ? Math.round(subtotal * 0.1 / 100) * 100 : 0;
    const deliveryFee = o.type === 'delivery' ? naira(1500) : 0;
    const total = subtotal - discount + deliveryFee;
    const staff = o.channel === 'pos' ? (rand() < 0.8 ? cashierId : managerId) : null;
    const method = o.channel === 'pos' ? weighted([['cash', 45], ['card', 30], ['transfer', 25]]) : weighted([['cash', 50], ['transfer', 50]]);
    const paid = o.status === 'completed' && !o.unpaid;
    const createdIso = new Date(o.at).toISOString();
    const progress = ['confirmed', 'preparing', 'ready', ...(o.type === 'delivery' ? ['out_for_delivery'] : []), 'completed'];
    const finalIdx = o.status === 'completed' ? progress.length - 1 : progress.indexOf(o.status);
    const lastAt = o.at + Math.max(finalIdx, 0) * 7 * 60000;

    db.run(
      `INSERT INTO orders (id, order_number, tracking_token, channel, type, status, customer_name, customer_phone, delivery_address,
         table_number, subtotal, delivery_fee, tax, discount, discount_reason, total, payment_method, payment_status, amount_paid,
         stock_deducted, created_by, cancel_reason, business_date, created_at, updated_at, completed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, String(1000 + id), crypto.randomBytes(12).toString('base64url'), o.channel, o.type, o.status,
        o.channel === 'online' || rand() < 0.3 ? o.name : null,
        o.channel === 'online' ? `080${Math.floor(10000000 + rand() * 89999999)}` : null,
        o.type === 'delivery' ? o.address : null,
        o.type === 'dine_in' ? String(1 + Math.floor(rand() * 12)) : null,
        subtotal, deliveryFee, discount, discount ? 'Regular customer' : null, total, method,
        paid ? 'paid' : 'unpaid', paid ? total : 0,
        !['cancelled', 'pending'].includes(o.status), staff,
        o.status === 'cancelled' ? pick(['Customer changed their mind', 'Could not reach customer', 'Duplicate order']) : null,
        o.day, createdIso, new Date(lastAt).toISOString(), o.status === 'completed' ? new Date(lastAt).toISOString() : null,
      ],
    );
    for (const l of o.lines) {
      db.run(
        `INSERT INTO order_items (order_id, menu_item_id, name, category_name, unit_price, quantity, line_total)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [id, l.item.id, l.item.name, l.item.category, l.item.price, l.quantity, l.item.price * l.quantity],
      );
    }

    // Timeline
    if (o.channel === 'online') insertEvent(id, 'pending', o.at, null, 'Order placed online');
    if (o.status === 'cancelled') {
      insertEvent(id, 'cancelled', o.at + 4 * 60000, managerId, null);
      db.run("UPDATE order_events SET note = (SELECT cancel_reason FROM orders WHERE id = ?) WHERE order_id = ? AND status = 'cancelled'", [id, id]);
      continue;
    }
    if (o.status === 'pending') continue;
    progress.slice(0, finalIdx + 1).forEach((status, i) => {
      insertEvent(id, status, o.at + (i + (o.channel === 'online' ? 1 : 0)) * 7 * 60000, i === 0 ? staff ?? cashierId : cashierId, i === 0 && o.channel === 'pos' ? 'Created at the counter' : null);
    });

    // Stock used
    const usageForOrder = new Map();
    for (const l of o.lines) {
      for (const [stockName, qty] of Object.entries(l.item.recipe)) {
        usageForOrder.set(stockName, (usageForOrder.get(stockName) ?? 0) + qty * l.quantity);
      }
    }
    for (const [stockName, qty] of usageForOrder) {
      const balance = Math.round((balances.get(stockName) - qty) * 1000) / 1000;
      balances.set(stockName, balance);
      const cost = STOCK.find((s) => s[0] === stockName)[2];
      db.run(
        `INSERT INTO stock_movements (inventory_item_id, change, balance_after, reason, unit_cost, order_id, user_id, business_date, created_at)
         VALUES (?, ?, ?, 'sale', ?, ?, ?, ?, ?)`,
        [stockIds.get(stockName), -Math.round(qty * 1000) / 1000, balance, naira(cost), id, staff ?? cashierId, o.day, createdIso],
      );
    }

    if (paid) {
      const shift = shifts.get(o.day);
      db.run(
        `INSERT INTO payments (order_id, kind, method, amount, user_id, shift_id, business_date, created_at)
         VALUES (?, 'payment', ?, ?, ?, ?, ?, ?)`,
        [id, method, total, cashierId, shift?.id ?? null, o.day, new Date(lastAt).toISOString()],
      );
      if (method === 'cash' && shift) shift.cash += total;
    }
  }

  for (const [name, balance] of balances) {
    db.run('UPDATE inventory_items SET quantity = ? WHERE id = ?', [balance, stockIds.get(name)]);
  }

  // Expenses: diesel every day, market runs, weekly meat supplier, packaging, monthly salaries.
  const expense = (day, category, description, amount, method, userId = managerId, fromDrawer = false) => {
    const shift = fromDrawer ? shifts.get(day) : null;
    db.run(
      `INSERT INTO expenses (category, description, amount, method, from_drawer, shift_id, user_id, business_date, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [category, description, amount, method, fromDrawer, shift?.id ?? null, userId, day, new Date(startOfLocalDay(TZ, day).getTime() + 11 * 3600000).toISOString()],
    );
    if (shift) shift.payouts += amount;
  };
  for (let offset = -30; offset <= 0; offset++) {
    const day = addDays(today, offset);
    const dom = Number(day.slice(8));
    expense(day, 'Gas & fuel', 'Diesel for generator', naira(15000 + Math.round(rand() * 10) * 1000), 'cash', cashierId, true);
    if (offset === 0) continue;
    if (offset % 3 === 0) expense(day, 'Ingredients & supplies', 'Market run: peppers, onions, tomatoes', naira(20000 + Math.round(rand() * 20) * 1000), 'transfer');
    if (offset % 7 === 0) expense(day, 'Ingredients & supplies', 'Meat supplier: chicken, beef and goat', naira(180000 + Math.round(rand() * 80) * 1000), 'transfer');
    if (offset % 7 === -3) expense(day, 'Packaging', 'Takeaway packs and nylon bags', naira(25000), 'transfer');
    if (offset % 5 === 0) expense(day, 'Ingredients & supplies', 'Charcoal (10 bags)', naira(30000), 'cash', cashierId, true);
    if (dom === 28) expense(day, 'Salaries & wages', 'Monthly staff salaries', naira(1450000), 'transfer', ownerId);
  }

  // Close every past shift. Most balance; a few come up short, which is what the report is for.
  for (const [day, shift] of shifts) {
    if (day === today) continue;
    const expected = naira(20000) + shift.cash - shift.payouts;
    const variance = weighted([[0, 80], [-naira(500), 8], [-naira(2000), 6], [naira(200), 4], [-naira(5000), 2]]);
    const closedAt = new Date(startOfLocalDay(TZ, day).getTime() + 22.5 * 3600000).toISOString();
    db.run(
      `UPDATE shifts SET status = 'closed', closed_at = ?, expected_cash = ?, counted_cash = ?, variance = ?, note = ? WHERE id = ?`,
      [closedAt, expected, expected + variance, variance, variance < 0 ? 'Drawer came up short' : null, shift.id],
    );
  }

  db.run(
    `INSERT INTO audit_logs (user_id, user_name, action, entity, details, created_at) VALUES (?, 'System', 'demo.seed', 'database', ?, ?)`,
    [ownerId, JSON.stringify({ orders: orders.length }), iso()],
  );
  return orders.length;
}

if (DEMO) {
  if (!menuItems.length) {
    console.log('Demo history skipped: the menu already existed. Run with --reset to rebuild everything.');
  } else if (db.get('SELECT COUNT(*) AS n FROM orders').n > 0) {
    console.log('Demo history skipped: orders already exist.');
  } else {
    const count = db.tx(generateHistory);
    console.log(`Demo history created: ${count} orders over the last 30 days.`);
  }
} else if (!hasMenu) {
  // Without demo history, give the starter stock its on-hand quantities directly.
  db.tx(() => {
    for (const [name, , cost, , onHand] of STOCK) {
      const itemId = stockIds.get(name);
      db.run('UPDATE inventory_items SET quantity = ? WHERE id = ?', [onHand, itemId]);
      db.run(
        `INSERT INTO stock_movements (inventory_item_id, change, balance_after, reason, unit_cost, note, user_id, business_date, created_at)
         VALUES (?, ?, ?, 'correction', ?, 'Opening stock', ?, ?, ?)`,
        [itemId, onHand, onHand, naira(cost), ownerId, businessDate(TZ), iso()],
      );
    }
  });
}

if (created.length) {
  console.log('\nStaff accounts created (change these passwords after first sign-in):');
  for (const u of created) console.log(`  ${u.role.padEnd(8)} ${u.email.padEnd(36)} ${u.password}`);
} else {
  console.log('\nNo new staff accounts were needed.');
}
console.log(`\nDatabase: ${config.dbPath}`);
