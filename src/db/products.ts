// src/db/products.ts
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

  // Asegura tabla de productos (mínima)
  db.exec(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      handle TEXT UNIQUE,
      name TEXT,
      category TEXT,
      image_url TEXT,
      price REAL
    );
  `);
  return db;
}

export type ProductRow = {
  id?: number;
  handle: string;
  name: string;
  category: string;
  image_url: string;
  price: number;
};

export function getProductByHandle(handle: string): ProductRow | null {
  const row = getDB()
    .prepare(`SELECT * FROM products WHERE handle = ?`)
    .get(handle) as ProductRow | undefined;
  return row ?? null;
}

export function listProducts(limit = 20): ProductRow[] {
  return getDB()
    .prepare(`SELECT * FROM products ORDER BY id DESC LIMIT ?`)
    .all(limit) as ProductRow[];
}
