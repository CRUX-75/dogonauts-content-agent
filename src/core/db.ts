// src/core/db.ts
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { logger } from '../utils/logger.js';

// --- 1️⃣ RUTA Y CONEXIÓN ÚNICA ---
const dataDir = path.resolve(process.cwd(), 'data');
fs.mkdirSync(dataDir, { recursive: true });

const dbPath = process.env.DB_PATH
  ? path.resolve(process.env.DB_PATH)
  : path.join(dataDir, 'db.sqlite');

export const db = new Database(dbPath, {
  verbose: (m) => logger.debug?.({ sqlite: m }),
});

db.pragma('journal_mode = WAL'); // mejor concurrencia
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000'); // espera hasta 5s si hay lock

logger.info({ dbPath }, 'Conectado a la base de datos');

// --- 2️⃣ ESQUEMA ---
// Ejecutamos las sentencias individualmente para evitar errores "near ' '"
const schemaStatements = [
  "CREATE TABLE IF NOT EXISTS captions_cache (" +
    "product_id TEXT NOT NULL," +
    "style TEXT NOT NULL," +
    "headline TEXT NOT NULL," +
    "caption TEXT NOT NULL," +
    "updated_at TEXT NOT NULL DEFAULT (datetime('now'))," +
    "PRIMARY KEY (product_id, style)" +
  ");",
  "CREATE INDEX IF NOT EXISTS idx_captions_cache_updated_at ON captions_cache (updated_at);"
];

for (const sql of schemaStatements) {
  try {
    db.exec(sql);
  } catch (e) {
    logger.error({ sql }, "❌ Error al aplicar sentencia SQL");
    throw e;
  }
}

// --- 3️⃣ HELPERS ---
export const transaction = <T>(fn: () => T): T => db.transaction(fn)();

// --- 4️⃣ QUERIES ---
export const queries = {
  getCachedCaption: db.prepare<
    [productId: string | number, style: string],
    { headline: string; caption: string }
  >(
    `SELECT headline, caption
     FROM captions_cache
     WHERE product_id = ? AND style = ?`
  ),

  setCachedCaptionStatement: db.prepare<
    [productId: string | number, style: string, headline: string, caption: string]
  >(
    `INSERT INTO captions_cache (product_id, style, headline, caption, updated_at)
     VALUES (?, ?, ?, ?, datetime('now'))
     ON CONFLICT(product_id, style)
     DO UPDATE SET
       headline   = excluded.headline,
       caption    = excluded.caption,
       updated_at = datetime('now')`
  ),
};

/**
 * Guarda o actualiza una caption en la caché de forma síncrona.
 * Usa una transacción para serializar las escrituras.
 */
export function setCachedCaption(
  productId: string | number,
  style: string,
  headline: string,
  caption: string
) {
  db.transaction(() => {
    queries.setCachedCaptionStatement.run(productId, style, headline, caption);
  })();
}
