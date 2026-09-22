import { createApp } from './app.js';
import { config } from './config.js';
import { openDb } from './db/index.js';

openDb(config.dbPath);

const app = createApp();
app.listen(config.port, () => {
  console.log(`API listening on http://localhost:${config.port}`);
  if (!config.isProd) console.log(`Storefront (dev): ${config.siteUrl}   Admin: ${config.siteUrl}/admin`);
});
