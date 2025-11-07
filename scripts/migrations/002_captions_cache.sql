-- scripts/migrations/002_captions_cache.sql
CREATE TABLE IF NOT EXISTS captions_cache (
  product_id INTEGER NOT NULL,
  style TEXT NOT NULL,
  headline TEXT NOT NULL,
  caption TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (product_id, style)
);
