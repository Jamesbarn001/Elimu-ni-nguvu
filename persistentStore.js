// ════════════════════════════════════════════════════════════
// ELINGU PERSISTENT STORE — Durable storage for data/*.json
//
// Render containers have an ephemeral filesystem: every deploy or
// restart resets data/*.json to whatever is committed in git.
// This module makes PostgreSQL (e.g. Neon) the source of truth:
//
//   1. hydrate()  — on boot, BEFORE the server listens, every document
//                   stored in Postgres is written back to data/*.json.
//                   Documents missing from Postgres are seeded from the
//                   local file (first boot only).
//   2. persist()  — every store's saveJson() calls this after writing
//                   the local file; changes are coalesced and upserted
//                   to Postgres in the background (write-through).
//   3. flush()    — on SIGTERM/SIGINT (Render sends SIGTERM on deploy)
//                   pending writes are flushed before the process exits.
//
// If DATABASE_URL is not set, everything is a no-op and the app runs
// on local JSON files exactly as before (local development).
//
// NOTE: Single-instance design (in-process cache via local files).
// Scaling to multiple web instances requires moving stores to row-level
// queries — see db/ repositories.
// ════════════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const FLUSH_DELAY_MS = 250;
const RETRY_DELAY_MS = 5000;

let pool = null;
let hydrated = false;
let flushTimer = null;
let flushChain = Promise.resolve();
const pending = new Map(); // name -> JSON string snapshot
let lastError = null;
let lastFlushAt = null;

function isEnabled() {
  return !!process.env.DATABASE_URL;
}

function getPool() {
  if (!pool) {
    const { Pool } = require('pg');
    const url = process.env.DATABASE_URL;
    const needsSsl = process.env.DATABASE_SSL === 'true' ||
      /sslmode=require|neon\.tech|supabase\.(co|com)/i.test(url);
    pool = new Pool({
      connectionString: url,
      ssl: needsSsl ? { rejectUnauthorized: false } : false,
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 15000 // Neon may need a moment to wake from scale-to-zero
    });
    pool.on('error', (err) => {
      lastError = err.message;
      console.error('[persistentStore] Idle client error:', err.message);
    });
  }
  return pool;
}

async function upsert(name, json) {
  await getPool().query(
    `INSERT INTO elingu_documents (name, data, updated_at)
     VALUES ($1, $2::jsonb, NOW())
     ON CONFLICT (name) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
    [name, json]
  );
}

/**
 * Restore data/*.json from Postgres. Must complete before the server
 * starts accepting requests.
 */
async function hydrate() {
  if (!isEnabled()) {
    console.log('[persistentStore] DATABASE_URL not set — using local JSON files only (data will NOT survive redeploys).');
    hydrated = true;
    return { mode: 'local' };
  }

  const db = getPool();
  await db.query(`
    CREATE TABLE IF NOT EXISTS elingu_documents (
      name TEXT PRIMARY KEY,
      data JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

  const { rows } = await db.query('SELECT name, data FROM elingu_documents');
  const inDb = new Set();
  for (const row of rows) {
    inDb.add(row.name);
    fs.writeFileSync(path.join(DATA_DIR, row.name), JSON.stringify(row.data, null, 2), 'utf8');
  }

  // First boot: seed Postgres from any local JSON documents it doesn't have yet
  let seeded = 0;
  for (const file of fs.readdirSync(DATA_DIR)) {
    if (!file.endsWith('.json') || inDb.has(file)) continue;
    try {
      const raw = fs.readFileSync(path.join(DATA_DIR, file), 'utf8');
      JSON.parse(raw); // validate
      await upsert(file, raw);
      seeded++;
    } catch (err) {
      console.error(`[persistentStore] Could not seed ${file}:`, err.message);
    }
  }

  hydrated = true;
  console.log(`[persistentStore] PostgreSQL mode — restored ${rows.length} document(s), seeded ${seeded} new.`);
  return { mode: 'postgres', restored: rows.length, seeded };
}

function scheduleFlush(delay = FLUSH_DELAY_MS) {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flush();
  }, delay);
}

/**
 * Queue a document for durable storage. Called by every saveJson().
 * Ignored before hydrate() finishes (hydrate reconciles that state).
 */
function persist(filePath, data) {
  if (!isEnabled() || !hydrated) return;
  const name = path.basename(filePath);
  if (!name.endsWith('.json')) return;
  try {
    pending.set(name, typeof data === 'string' ? data : JSON.stringify(data));
    scheduleFlush();
  } catch (err) {
    console.error(`[persistentStore] Could not queue ${name}:`, err.message);
  }
}

/**
 * Write all pending documents to Postgres. Serialized so writes for the
 * same document always land in order.
 */
function flush() {
  flushChain = flushChain.then(async () => {
    if (pending.size === 0) return;
    const batch = [...pending.entries()];
    pending.clear();
    for (const [name, json] of batch) {
      try {
        await upsert(name, json);
        lastFlushAt = new Date().toISOString();
        lastError = null;
      } catch (err) {
        lastError = err.message;
        console.error(`[persistentStore] Failed to save ${name}, will retry:`, err.message);
        if (!pending.has(name)) pending.set(name, json); // keep newest version if one arrived meanwhile
        scheduleFlush(RETRY_DELAY_MS);
      }
    }
  });
  return flushChain;
}

function status() {
  return {
    mode: isEnabled() ? 'postgres' : 'local',
    hydrated,
    pendingWrites: pending.size,
    lastFlushAt,
    lastError
  };
}

let hooksInstalled = false;
function installShutdownHooks() {
  if (hooksInstalled) return;
  hooksInstalled = true;
  const shutdown = async (signal) => {
    console.log(`[persistentStore] ${signal} received — flushing ${pending.size} pending write(s)...`);
    try {
      if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
      await Promise.race([flush(), new Promise(r => setTimeout(r, 8000))]);
      if (pool) await pool.end();
    } catch (err) {
      console.error('[persistentStore] Flush on shutdown failed:', err.message);
    }
    process.exit(0);
  };
  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.once('SIGINT', () => shutdown('SIGINT'));
}

module.exports = { hydrate, persist, flush, status, installShutdownHooks, isEnabled };
