import crypto from 'node:crypto';
import fs from 'node:fs';
import { Router } from 'express';
import multer from 'multer';
import { config } from '../../config.js';
import { db, now } from '../../db/index.js';
import { audit } from '../../lib/audit.js';
import { requirePerm } from '../../lib/auth.js';
import { badRequest, conflict, notFound } from '../../lib/errors.js';
import { uniqueSlug } from '../../lib/slug.js';
import { id, money, parse, text, z } from '../../lib/validate.js';
import { soldOutMenuItemIds } from '../../services/inventory.js';

const router = Router();

// ------------------------------------------------------------ categories

// Zod 4 applies .default() even inside .partial(), so PATCH schemas are built
// from bare fields and only the create schemas carry defaults.
const categoryFields = {
  name: text(60, 1),
  description: z.string().trim().max(300),
  sortOrder: z.number().int().min(0).max(9999),
  active: z.boolean(),
};
const createCategorySchema = z.object({
  ...categoryFields,
  description: categoryFields.description.optional().default(''),
  sortOrder: categoryFields.sortOrder.optional().default(0),
  active: categoryFields.active.optional().default(true),
});
const patchCategorySchema = z.object(categoryFields).partial();

router.get('/categories', requirePerm('menu.manage'), (_req, res) => {
  res.json({
    categories: db.all(
      `SELECT c.*, (SELECT COUNT(*) FROM menu_items m WHERE m.category_id = c.id AND m.archived = 0) AS item_count
       FROM categories c ORDER BY c.sort_order, c.name`,
    ),
  });
});

router.post('/categories', requirePerm('menu.manage'), (req, res) => {
  const body = parse(createCategorySchema, req.body);
  const { lastInsertRowid } = db.run(
    'INSERT INTO categories (name, slug, description, sort_order, active, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    [body.name, uniqueSlug('categories', body.name), body.description, body.sortOrder, body.active, now()],
  );
  audit(req, 'category.create', 'category', lastInsertRowid, { name: body.name });
  res.status(201).json({ category: db.get('SELECT * FROM categories WHERE id = ?', [lastInsertRowid]) });
});

router.patch('/categories/:id', requirePerm('menu.manage'), (req, res) => {
  const categoryId = parse(id, req.params.id);
  const current = db.get('SELECT * FROM categories WHERE id = ?', [categoryId]);
  if (!current) throw notFound('Category not found');
  const body = parse(patchCategorySchema, req.body);
  const next = {
    name: body.name ?? current.name,
    description: body.description ?? current.description,
    sort_order: body.sortOrder ?? current.sort_order,
    active: body.active ?? Boolean(current.active),
  };
  const slug = next.name !== current.name ? uniqueSlug('categories', next.name, categoryId) : current.slug;
  db.run('UPDATE categories SET name = ?, slug = ?, description = ?, sort_order = ?, active = ? WHERE id = ?', [
    next.name,
    slug,
    next.description,
    next.sort_order,
    next.active,
    categoryId,
  ]);
  audit(req, 'category.update', 'category', categoryId, body);
  res.json({ category: db.get('SELECT * FROM categories WHERE id = ?', [categoryId]) });
});

router.delete('/categories/:id', requirePerm('menu.manage'), (req, res) => {
  const categoryId = parse(id, req.params.id);
  const category = db.get('SELECT * FROM categories WHERE id = ?', [categoryId]);
  if (!category) throw notFound('Category not found');
  const { count } = db.get('SELECT COUNT(*) AS count FROM menu_items WHERE category_id = ? AND archived = 0', [categoryId]);
  if (count) throw conflict(`Move or remove the ${count} dish${count === 1 ? '' : 'es'} in this category first`);
  db.run('UPDATE menu_items SET category_id = NULL WHERE category_id = ?', [categoryId]);
  db.run('DELETE FROM categories WHERE id = ?', [categoryId]);
  audit(req, 'category.delete', 'category', categoryId, { name: category.name });
  res.json({ ok: true });
});

// ------------------------------------------------------------ menu items

const TAGS = ['spicy', 'vegetarian', 'popular', 'new', 'chef-special', 'gluten-free'];

const itemFields = {
  categoryId: z.number({ error: 'Choose a category' }).int().positive(),
  name: text(80, 1),
  description: z.string().trim().max(500),
  price: money,
  imageUrl: z.string().trim().max(500),
  available: z.boolean(),
  featured: z.boolean(),
  tags: z.array(z.enum(TAGS)).max(6),
  prepMinutes: z.number().int().min(0).max(240).nullable(),
  sortOrder: z.number().int().min(0).max(9999),
  recipe: z
    .array(z.object({ inventoryItemId: z.number().int().positive(), quantity: z.number().positive().max(100000) }))
    .max(30),
};
const createItemSchema = z.object({
  ...itemFields,
  description: itemFields.description.optional().default(''),
  imageUrl: itemFields.imageUrl.optional().default(''),
  available: itemFields.available.optional().default(true),
  featured: itemFields.featured.optional().default(false),
  tags: itemFields.tags.optional().default([]),
  prepMinutes: itemFields.prepMinutes.optional().default(null),
  sortOrder: itemFields.sortOrder.optional().default(0),
  recipe: itemFields.recipe.optional(),
});
const patchItemSchema = z.object(itemFields).partial();

function menuItemsWithCost(where = 'm.archived = 0', params = []) {
  const soldOut = soldOutMenuItemIds();
  const items = db.all(
    `SELECT m.*, c.name AS category_name FROM menu_items m LEFT JOIN categories c ON c.id = m.category_id
     WHERE ${where} ORDER BY c.sort_order, m.sort_order, m.name`,
    params,
  );
  const recipes = db.all(
    `SELECT r.menu_item_id, r.inventory_item_id, r.quantity, i.name, i.unit, i.cost_per_unit
     FROM recipe_items r JOIN inventory_items i ON i.id = r.inventory_item_id`,
  );
  return items.map((m) => {
    const recipe = recipes.filter((r) => r.menu_item_id === m.id);
    const cost = Math.round(recipe.reduce((sum, r) => sum + r.quantity * r.cost_per_unit, 0));
    return {
      ...m,
      tags: JSON.parse(m.tags),
      sold_out: soldOut.has(m.id),
      recipe,
      food_cost: cost,
      margin_pct: m.price ? Math.round(((m.price - cost) / m.price) * 1000) / 10 : 0,
    };
  });
}

function saveRecipe(menuItemId, recipe) {
  const seen = new Set();
  db.run('DELETE FROM recipe_items WHERE menu_item_id = ?', [menuItemId]);
  for (const line of recipe) {
    if (seen.has(line.inventoryItemId)) throw badRequest('Each stock item can appear only once in a recipe');
    seen.add(line.inventoryItemId);
    if (!db.get('SELECT id FROM inventory_items WHERE id = ? AND archived = 0', [line.inventoryItemId])) {
      throw badRequest('A recipe ingredient no longer exists in inventory');
    }
    db.run('INSERT INTO recipe_items (menu_item_id, inventory_item_id, quantity) VALUES (?, ?, ?)', [
      menuItemId,
      line.inventoryItemId,
      line.quantity,
    ]);
  }
}

function assertCategory(categoryId) {
  if (!db.get('SELECT id FROM categories WHERE id = ?', [categoryId])) throw badRequest('That category does not exist');
}

router.get('/menu-items', requirePerm('menu.manage'), (_req, res) => {
  res.json({ items: menuItemsWithCost(), tags: TAGS });
});

router.post('/menu-items', requirePerm('menu.manage'), (req, res) => {
  const body = parse(createItemSchema, req.body);
  assertCategory(body.categoryId);
  const at = now();
  const itemId = db.tx(() => {
    const { lastInsertRowid } = db.run(
      `INSERT INTO menu_items (category_id, name, slug, description, price, image_url, available, featured, tags,
         prep_minutes, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        body.categoryId,
        body.name,
        uniqueSlug('menu_items', body.name),
        body.description,
        body.price,
        body.imageUrl || null,
        body.available,
        body.featured,
        JSON.stringify(body.tags),
        body.prepMinutes,
        body.sortOrder,
        at,
        at,
      ],
    );
    if (body.recipe) saveRecipe(Number(lastInsertRowid), body.recipe);
    return Number(lastInsertRowid);
  });
  audit(req, 'menu.create', 'menu_item', itemId, { name: body.name, price: body.price });
  res.status(201).json({ item: menuItemsWithCost('m.id = ?', [itemId])[0] });
});

router.patch('/menu-items/:id', requirePerm('menu.manage'), (req, res) => {
  const itemId = parse(id, req.params.id);
  const current = db.get('SELECT * FROM menu_items WHERE id = ? AND archived = 0', [itemId]);
  if (!current) throw notFound('Dish not found');
  const body = parse(patchItemSchema, req.body);
  if (body.categoryId) assertCategory(body.categoryId);

  const next = {
    category_id: body.categoryId ?? current.category_id,
    name: body.name ?? current.name,
    description: body.description ?? current.description,
    price: body.price ?? current.price,
    image_url: body.imageUrl !== undefined ? body.imageUrl || null : current.image_url,
    available: body.available ?? Boolean(current.available),
    featured: body.featured ?? Boolean(current.featured),
    tags: body.tags ? JSON.stringify(body.tags) : current.tags,
    prep_minutes: body.prepMinutes !== undefined ? body.prepMinutes : current.prep_minutes,
    sort_order: body.sortOrder ?? current.sort_order,
  };
  const slug = next.name !== current.name ? uniqueSlug('menu_items', next.name, itemId) : current.slug;

  db.tx(() => {
    db.run(
      `UPDATE menu_items SET category_id = :category_id, name = :name, slug = :slug, description = :description,
         price = :price, image_url = :image_url, available = :available, featured = :featured, tags = :tags,
         prep_minutes = :prep_minutes, sort_order = :sort_order, updated_at = :updated_at WHERE id = :id`,
      { ...next, slug, updated_at: now(), id: itemId },
    );
    if (body.recipe) saveRecipe(itemId, body.recipe);
  });

  // Price changes are the ones owners most want to be able to trace.
  const changes = {};
  for (const key of ['name', 'price', 'available', 'category_id']) {
    const before = key === 'available' ? Boolean(current[key]) : current[key];
    if (before !== next[key]) changes[key] = { from: before, to: next[key] };
  }
  if (body.recipe) changes.recipe = 'updated';
  audit(req, 'menu.update', 'menu_item', itemId, { name: next.name, ...changes });
  res.json({ item: menuItemsWithCost('m.id = ?', [itemId])[0] });
});

/** Dishes are archived, never deleted, so past orders and reports keep their history. */
router.delete('/menu-items/:id', requirePerm('menu.manage'), (req, res) => {
  const itemId = parse(id, req.params.id);
  const item = db.get('SELECT * FROM menu_items WHERE id = ? AND archived = 0', [itemId]);
  if (!item) throw notFound('Dish not found');
  db.run('UPDATE menu_items SET archived = 1, available = 0, featured = 0, updated_at = ? WHERE id = ?', [now(), itemId]);
  audit(req, 'menu.archive', 'menu_item', itemId, { name: item.name });
  res.json({ ok: true });
});

// ------------------------------------------------------------ uploads

const IMAGE_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };

fs.mkdirSync(config.uploadDir, { recursive: true });
const upload = multer({
  storage: multer.diskStorage({
    destination: config.uploadDir,
    filename: (_req, file, cb) => cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}.${IMAGE_TYPES[file.mimetype]}`),
  }),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) =>
    IMAGE_TYPES[file.mimetype] ? cb(null, true) : cb(badRequest('Upload a JPG, PNG, WebP or GIF image')),
});

router.post('/uploads', requirePerm('menu.manage', 'settings.manage'), upload.single('file'), (req, res) => {
  if (!req.file) throw badRequest('Choose an image to upload');
  audit(req, 'upload.image', null, null, { file: req.file.filename, size: req.file.size });
  res.status(201).json({ url: `/uploads/${req.file.filename}` });
});

export default router;
