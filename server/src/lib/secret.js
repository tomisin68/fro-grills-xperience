import crypto from 'node:crypto';
import { config } from '../config.js';
import { db } from '../db/index.js';

let cached = null;

/**
 * Key used to sign staff sign-in cookies. JWT_SECRET wins; otherwise one is
 * generated on first boot and kept in the database, so the server runs
 * anywhere with no configuration. Changing it signs everyone out.
 */
export function sessionSecret() {
  if (config.jwtSecret) return config.jwtSecret;
  if (cached) return cached;
  const stored = db.get('SELECT value FROM settings WHERE key = ?', [SECRET_KEY]);
  if (stored) {
    cached = JSON.parse(stored.value);
    return cached;
  }
  cached = crypto.randomBytes(48).toString('hex');
  db.run('INSERT INTO settings (key, value) VALUES (?, ?)', [SECRET_KEY, JSON.stringify(cached)]);
  if (config.isProd) {
    console.warn('JWT_SECRET is not set: generated one and saved it in the database.');
  }
  return cached;
}

export const SECRET_KEY = '@session_secret';
