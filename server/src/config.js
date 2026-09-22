import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const SERVER_ROOT = path.resolve(here, '..');

const env = process.env;
const isProd = env.NODE_ENV === 'production';
const isTest = env.NODE_ENV === 'test';
const port = Number(env.PORT) || 4000;

export const config = {
  isProd,
  isTest,
  port,
  dbPath: env.DB_PATH || path.join(SERVER_ROOT, 'data', 'fro-grills-xperience.db'),
  uploadDir: env.UPLOAD_DIR || path.join(SERVER_ROOT, 'uploads'),
  clientDist: env.CLIENT_DIST || path.resolve(SERVER_ROOT, '..', 'client', 'dist'),
  jwtSecret: env.JWT_SECRET || (isProd ? '' : 'dev-only-secret-do-not-use-in-production'),
  // Public URL of the site. Used for canonical links, the sitemap and payment callbacks.
  siteUrl: (env.SITE_URL || (isProd ? `http://localhost:${port}` : 'http://localhost:5173')).replace(/\/$/, ''),
  paystackSecret: env.PAYSTACK_SECRET_KEY || '',
  trustProxy: env.TRUST_PROXY ? Number(env.TRUST_PROXY) || env.TRUST_PROXY : false,
  sessionHours: 12,
};

if (!config.jwtSecret) {
  throw new Error('JWT_SECRET must be set when NODE_ENV=production');
}
