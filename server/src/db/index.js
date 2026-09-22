import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const schemaPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'schema.sql');

let conn = null;
const statements = new Map();
const paramNames = new Map();

export function openDb(file) {
  if (conn) return conn;
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  conn = new DatabaseSync(file);
  conn.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  conn.exec(fs.readFileSync(schemaPath, 'utf8'));
  return conn;
}

export function closeDb() {
  statements.clear();
  conn?.close();
  conn = null;
}

// node:sqlite cannot bind undefined or booleans, and rejects named
// parameters the statement does not use, so every call goes through here.
function normalize(value) {
  if (value === undefined) return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  return value;
}

function namesIn(sql) {
  let names = paramNames.get(sql);
  if (!names) {
    names = new Set([...sql.matchAll(/[:@$]([A-Za-z_]\w*)/g)].map((m) => m[1]));
    paramNames.set(sql, names);
  }
  return names;
}

function bind(sql, params) {
  if (params === undefined || params === null) return [];
  if (Array.isArray(params)) return params.map(normalize);
  if (typeof params === 'object') {
    const out = {};
    for (const name of namesIn(sql)) {
      if (Object.hasOwn(params, name)) out[name] = normalize(params[name]);
    }
    return [out];
  }
  return [normalize(params)];
}

function prepare(sql) {
  if (!conn) throw new Error('Database is not open');
  let stmt = statements.get(sql);
  if (!stmt) {
    stmt = conn.prepare(sql);
    statements.set(sql, stmt);
  }
  return stmt;
}

export const db = {
  get: (sql, params) => prepare(sql).get(...bind(sql, params)) ?? null,
  all: (sql, params) => prepare(sql).all(...bind(sql, params)),
  run: (sql, params) => prepare(sql).run(...bind(sql, params)),
  exec: (sql) => conn.exec(sql),
  /** Runs fn inside a transaction. fn must be synchronous. Nested calls join the outer transaction. */
  tx(fn) {
    if (conn.isTransaction) return fn();
    conn.exec('BEGIN IMMEDIATE');
    let result;
    try {
      result = fn();
      conn.exec('COMMIT');
    } catch (err) {
      conn.exec('ROLLBACK');
      pendingAfterCommit.length = 0;
      throw err;
    }
    for (const cb of pendingAfterCommit.splice(0)) cb();
    return result;
  },
  /** Defers side effects (live events) until the surrounding transaction commits. */
  afterCommit(cb) {
    if (conn.isTransaction) pendingAfterCommit.push(cb);
    else cb();
  },
};

const pendingAfterCommit = [];

export const now = () => new Date().toISOString();
