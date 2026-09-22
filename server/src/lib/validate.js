import { z } from 'zod';
import { badRequest } from './errors.js';

export { z };

/** Parses data against a zod schema, throwing a 400 with the first readable issue. */
export function parse(schema, data) {
  const result = schema.safeParse(data ?? {});
  if (result.success) return result.data;
  const issue = result.error.issues[0];
  const field = issue.path.join('.');
  throw badRequest(field && !issue.message.includes(field) ? `${field}: ${issue.message}` : issue.message);
}

// Money always travels as an integer count of minor units (kobo, cents).
export const money = z.number().int().min(0).max(1_000_000_000_00);
export const positiveMoney = z.number().int().min(1).max(1_000_000_000_00);
export const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the YYYY-MM-DD date format');
export const id = z.coerce.number().int().positive();
export const text = (max, min = 0) => z.string().trim().min(min).max(max);
export const optionalText = (max) => z.string().trim().max(max).optional().default('');
