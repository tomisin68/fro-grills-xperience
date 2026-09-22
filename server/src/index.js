import { createApp } from './app.js';
import { config } from './config.js';
import { db, openDb } from './db/index.js';
import { seedDatabase } from './db/seed.js';

openDb(config.dbPath);

// A brand-new database would have nobody to sign in with, so set up the owner
// account and starter menu on first boot. Existing data is never touched.
if (db.get('SELECT COUNT(*) AS n FROM users').n === 0) {
  console.log('Empty database: creating the owner account and starter menu…');
  seedDatabase();
}

const app = createApp();
app.listen(config.port, () => {
  console.log(`API listening on http://localhost:${config.port}`);
  if (!config.isProd) console.log(`Storefront (dev): ${config.siteUrl}   Admin: ${config.siteUrl}/admin`);
});
