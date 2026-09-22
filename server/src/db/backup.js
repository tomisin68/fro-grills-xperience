/**
 * npm run backup — writes a consistent copy of the database (safe while the
 * server is running). Schedule it daily and copy the folder off the server.
 */
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { db, openDb } from './index.js';

openDb(config.dbPath);
const dir = process.env.BACKUP_DIR || path.join(path.dirname(config.dbPath), 'backups');
fs.mkdirSync(dir, { recursive: true });
const file = path.join(dir, `fro-grills-xperience-${new Date().toISOString().replace(/[:.]/g, '-')}.db`);
db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
console.log(`Backup written to ${file}`);
