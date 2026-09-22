import { db } from '../db/index.js';

export function slugify(input) {
  return (
    String(input)
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'item'
  );
}

/** Returns a slug unique within `table`, ignoring the row being edited. */
export function uniqueSlug(table, name, excludeId = 0) {
  const base = slugify(name);
  let slug = base;
  for (let n = 2; db.get(`SELECT id FROM ${table} WHERE slug = ? AND id != ?`, [slug, excludeId]); n++) {
    slug = `${base}-${n}`;
  }
  return slug;
}
