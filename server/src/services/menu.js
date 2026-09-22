import { db } from '../db/index.js';
import { notFound } from '../lib/errors.js';
import { soldOutMenuItemIds } from './inventory.js';

const ITEM_COLUMNS = `m.id, m.category_id, m.name, m.slug, m.description, m.price, m.image_url, m.available,
  m.featured, m.tags, m.prep_minutes, m.updated_at`;

function shape(item, soldOut) {
  return { ...item, tags: JSON.parse(item.tags || '[]'), sold_out: !item.available || soldOut.has(item.id) };
}

/** Active categories with their dishes, as customers see them. */
export function publicMenu() {
  const soldOut = soldOutMenuItemIds();
  const categories = db.all(
    'SELECT id, name, slug, description FROM categories WHERE active = 1 ORDER BY sort_order, name',
  );
  const items = db
    .all(`SELECT ${ITEM_COLUMNS} FROM menu_items m WHERE m.archived = 0 ORDER BY m.sort_order, m.name`)
    .map((i) => shape(i, soldOut));
  return categories
    .map((c) => ({ ...c, items: items.filter((i) => i.category_id === c.id) }))
    .filter((c) => c.items.length > 0);
}

export function publicMenuItem(slug) {
  const item = db.get(
    `SELECT ${ITEM_COLUMNS}, c.name AS category_name, c.slug AS category_slug
     FROM menu_items m JOIN categories c ON c.id = m.category_id
     WHERE m.slug = ? AND m.archived = 0 AND c.active = 1`,
    [slug],
  );
  if (!item) throw notFound('That dish is not on the menu');
  const soldOut = soldOutMenuItemIds();
  const related = db
    .all(
      `SELECT ${ITEM_COLUMNS} FROM menu_items m
       WHERE m.category_id = ? AND m.id != ? AND m.archived = 0 ORDER BY m.featured DESC, m.sort_order LIMIT 4`,
      [item.category_id, item.id],
    )
    .map((i) => shape(i, soldOut));
  return { item: shape(item, soldOut), related };
}
