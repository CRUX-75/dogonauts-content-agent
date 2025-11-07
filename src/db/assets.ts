// src/db/assets.ts
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), 'data', 'db.sqlite');

function ensureDir(p: string) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

let db: Database.Database | null = null;
function getDB() {
  if (db) return db;
  ensureDir(path.dirname(DB_PATH));
  db = new Database(DB_PATH);

  db.exec(`
    CREATE TABLE IF NOT EXISTS product_assets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_handle TEXT,
      variant TEXT,
      format TEXT,
      width INTEGER,
      height INTEGER,
      file_path TEXT,
      hash TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  return db;
}

export type ProductAsset = {
  id?: number;
  product_handle: string;
  variant: string;
  format: string;
  width: number;
  height: number;
  file_path: string;
  hash: string;
};

export function insertProductAsset(asset: ProductAsset) {
  const db = getDB();
  const stmt = db.prepare(`
    INSERT INTO product_assets (product_handle, variant, format, width, height, file_path, hash)
    VALUES (@product_handle, @variant, @format, @width, @height, @file_path, @hash)
  `);
  stmt.run(asset);
}
