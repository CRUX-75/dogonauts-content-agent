import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), 'data', 'db.sqlite');
if (!fs.existsSync(path.dirname(DB_PATH))) fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const db = new Database(DB_PATH);

db.exec(`CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  handle TEXT UNIQUE,
  name TEXT,
  category TEXT,
  image_url TEXT,
  price REAL
);`);

const data = [
  { handle: 'demo-1', name: 'Demo One', category: 'Misc', image_url: 'https://picsum.photos/seed/dogo1/800', price: 19.9 },
  { handle: 'demo-2', name: 'Demo Two', category: 'Misc', image_url: 'https://picsum.photos/seed/dogo2/800', price: 24.9 }
];

const stmt = db.prepare(`INSERT OR IGNORE INTO products (handle,name,category,image_url,price) VALUES (@handle,@name,@category,@image_url,@price)`);
for (const p of data) stmt.run(p);

console.log('Seed OK');
