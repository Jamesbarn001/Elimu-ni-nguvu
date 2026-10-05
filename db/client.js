// ══════════════════════════════════════════════════════════════
// ELINGU DATABASE CLIENT (DUAL ADAPTER: POSTGRESQL & SQLITE)
// Supports multi-container institutional scaling via PostgreSQL
// with zero-config embedded SQLite fallback for local development.
// ══════════════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');
require('dotenv').config();

function checkPostgres() {
  return !!process.env.DATABASE_URL;
}

let pgPool = null;
let sqliteDb = null;

const DB_FILE = path.resolve(__dirname, '../data/elingu.sqlite');

function getClient() {
  if (checkPostgres()) {
    if (!pgPool) {
      const { Pool } = require('pg');
      pgPool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000
      });
      pgPool.on('error', (err) => {
        console.error('Unexpected error on idle PostgreSQL client:', err);
      });
    }
    return { type: 'postgres', pool: pgPool };
  } else {
    if (!sqliteDb) {
      const { DatabaseSync } = require('node:sqlite');
      const dataDir = path.dirname(DB_FILE);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      sqliteDb = new DatabaseSync(DB_FILE);
      sqliteDb.exec('PRAGMA foreign_keys = ON;');
      sqliteDb.exec('PRAGMA journal_mode = WAL;');
      sqliteDb.exec('PRAGMA synchronous = NORMAL;');
    }
    return { type: 'sqlite', db: sqliteDb };
  }
}

function querySync(sqlText, params = []) {
  const client = getClient();
  if (client.type === 'postgres') {
    throw new Error('querySync is only supported in SQLite mode. Use async query() for PostgreSQL.');
  }

  const orderedParams = [];
  const translatedSql = sqlText.replace(/\$(\d+)/g, (_, idx) => {
    const paramIndex = parseInt(idx, 10) - 1;
    let p = params[paramIndex];
    if (p === undefined) p = null;
    if (typeof p === 'boolean') p = p ? 1 : 0;
    orderedParams.push(p);
    return '?';
  });

  const normalizedParams = orderedParams;

  const trimmed = translatedSql.trim().toUpperCase();
  if (trimmed.startsWith('SELECT') || trimmed.startsWith('PRAGMA')) {
    const stmt = client.db.prepare(translatedSql);
    const rows = stmt.all(...normalizedParams);
    return { rows, rowCount: rows.length };
  } else {
    const stmt = client.db.prepare(translatedSql);
    const info = stmt.run(...normalizedParams);
    return { rows: [], rowCount: info.changes, lastInsertRowid: info.lastInsertRowid };
  }
}

/**
 * Execute parameterized query
 * Uses standard $1, $2, $3 notation which translates to ? in SQLite.
 * Returns { rows: [...], rowCount: n }
 */
async function query(sqlText, params = []) {
  const client = getClient();

  if (client.type === 'postgres') {
    const res = await client.pool.query(sqlText, params);
    return { rows: res.rows, rowCount: res.rowCount };
  } else {
    return querySync(sqlText, params);
  }
}

/**
 * Initialize database schema from db/schema.sql
 */
async function initSchema() {
  const schemaPath = path.resolve(__dirname, 'schema.sql');
  const ddl = fs.readFileSync(schemaPath, 'utf8');

  const client = getClient();
  if (client.type === 'postgres') {
    await client.pool.query(ddl);
  } else {
    client.db.exec(ddl);
  }
  return true;
}

/**
 * JSON serialization & deserialization helpers
 */
function toJson(val, defaultVal = null) {
  if (val === null || val === undefined) {
    return defaultVal !== null ? JSON.stringify(defaultVal) : null;
  }
  if (typeof val === 'string') return val;
  try {
    return JSON.stringify(val);
  } catch (e) {
    return defaultVal !== null ? JSON.stringify(defaultVal) : null;
  }
}

function fromJson(val, defaultVal = null) {
  if (!val) return defaultVal;
  if (typeof val === 'object') return val;
  try {
    return JSON.parse(val);
  } catch (e) {
    return defaultVal;
  }
}

/**
 * Cleanly close database connections
 */
async function close() {
  if (pgPool) {
    await pgPool.end();
    pgPool = null;
  }
  if (sqliteDb) {
    sqliteDb.close();
    sqliteDb = null;
  }
}

module.exports = {
  query,
  querySync,
  initSchema,
  toJson,
  fromJson,
  close,
  isPostgres: () => checkPostgres(),
  DB_FILE
};
