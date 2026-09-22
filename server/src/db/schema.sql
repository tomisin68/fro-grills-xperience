-- All money columns are integers in the currency's minor unit (kobo for NGN).
-- business_date columns hold the calendar date in the restaurant's timezone,
-- so daily reports never drift across midnight UTC.

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner', 'manager', 'cashier', 'kitchen')),
  active INTEGER NOT NULL DEFAULT 1,
  token_version INTEGER NOT NULL DEFAULT 0,
  last_login_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS menu_items (
  id INTEGER PRIMARY KEY,
  category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  price INTEGER NOT NULL CHECK (price >= 0),
  image_url TEXT,
  available INTEGER NOT NULL DEFAULT 1,
  featured INTEGER NOT NULL DEFAULT 0,
  tags TEXT NOT NULL DEFAULT '[]',
  prep_minutes INTEGER,
  sort_order INTEGER NOT NULL DEFAULT 0,
  archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS menu_items_category ON menu_items(category_id);

CREATE TABLE IF NOT EXISTS inventory_items (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  unit TEXT NOT NULL,
  quantity REAL NOT NULL DEFAULT 0,
  reorder_level REAL NOT NULL DEFAULT 0,
  cost_per_unit INTEGER NOT NULL DEFAULT 0,
  archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- How much of each stock item one serving of a menu item uses.
CREATE TABLE IF NOT EXISTS recipe_items (
  menu_item_id INTEGER NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  inventory_item_id INTEGER NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  quantity REAL NOT NULL CHECK (quantity > 0),
  PRIMARY KEY (menu_item_id, inventory_item_id)
);

CREATE TABLE IF NOT EXISTS shifts (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  opening_float INTEGER NOT NULL DEFAULT 0,
  opened_at TEXT NOT NULL,
  closed_at TEXT,
  expected_cash INTEGER,
  counted_cash INTEGER,
  variance INTEGER,
  note TEXT,
  business_date TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS shifts_one_open_per_user ON shifts(user_id) WHERE status = 'open';

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY,
  order_number TEXT NOT NULL UNIQUE,
  tracking_token TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('online', 'pos')),
  type TEXT NOT NULL CHECK (type IN ('delivery', 'pickup', 'dine_in')),
  status TEXT NOT NULL CHECK (status IN ('pending', 'confirmed', 'preparing', 'ready', 'out_for_delivery', 'completed', 'cancelled')),
  customer_name TEXT,
  customer_phone TEXT,
  customer_email TEXT,
  delivery_address TEXT,
  table_number TEXT,
  notes TEXT,
  subtotal INTEGER NOT NULL,
  delivery_fee INTEGER NOT NULL DEFAULT 0,
  tax INTEGER NOT NULL DEFAULT 0,
  discount INTEGER NOT NULL DEFAULT 0,
  discount_reason TEXT,
  total INTEGER NOT NULL,
  payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'card', 'transfer', 'online')),
  payment_status TEXT NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'partial', 'paid', 'refunded')),
  amount_paid INTEGER NOT NULL DEFAULT 0,
  payment_reference TEXT,
  stock_deducted INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER REFERENCES users(id),
  cancel_reason TEXT,
  business_date TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT
);
CREATE INDEX IF NOT EXISTS orders_business_date ON orders(business_date);
CREATE INDEX IF NOT EXISTS orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS orders_payment_reference ON orders(payment_reference);

CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  menu_item_id INTEGER REFERENCES menu_items(id),
  name TEXT NOT NULL,
  category_name TEXT,
  unit_price INTEGER NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  line_total INTEGER NOT NULL,
  notes TEXT
);
CREATE INDEX IF NOT EXISTS order_items_order ON order_items(order_id);

CREATE TABLE IF NOT EXISTS order_events (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  status TEXT NOT NULL,
  note TEXT,
  user_id INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS order_events_order ON order_events(order_id);

CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  kind TEXT NOT NULL CHECK (kind IN ('payment', 'refund')),
  method TEXT NOT NULL CHECK (method IN ('cash', 'card', 'transfer', 'online')),
  amount INTEGER NOT NULL CHECK (amount > 0),
  reference TEXT,
  note TEXT,
  user_id INTEGER REFERENCES users(id),
  shift_id INTEGER REFERENCES shifts(id),
  business_date TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS payments_business_date ON payments(business_date);
CREATE INDEX IF NOT EXISTS payments_order ON payments(order_id);
-- A gateway reference can only ever be credited once.
CREATE UNIQUE INDEX IF NOT EXISTS payments_online_reference ON payments(reference) WHERE method = 'online' AND kind = 'payment';

CREATE TABLE IF NOT EXISTS stock_movements (
  id INTEGER PRIMARY KEY,
  inventory_item_id INTEGER NOT NULL REFERENCES inventory_items(id),
  change REAL NOT NULL,
  balance_after REAL NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('restock', 'sale', 'waste', 'correction', 'return')),
  unit_cost INTEGER NOT NULL DEFAULT 0,
  order_id INTEGER REFERENCES orders(id),
  note TEXT,
  user_id INTEGER REFERENCES users(id),
  business_date TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS stock_movements_item ON stock_movements(inventory_item_id);
CREATE INDEX IF NOT EXISTS stock_movements_date ON stock_movements(business_date);

CREATE TABLE IF NOT EXISTS expenses (
  id INTEGER PRIMARY KEY,
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK (amount > 0),
  method TEXT NOT NULL CHECK (method IN ('cash', 'card', 'transfer')),
  from_drawer INTEGER NOT NULL DEFAULT 0,
  shift_id INTEGER REFERENCES shifts(id),
  user_id INTEGER REFERENCES users(id),
  business_date TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS expenses_business_date ON expenses(business_date);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  user_name TEXT,
  action TEXT NOT NULL,
  entity TEXT,
  entity_id TEXT,
  details TEXT,
  ip TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS audit_logs_created ON audit_logs(created_at);
