-- ============================================
-- Dogonauts Monolith — Esquema principal
-- ============================================

-- ============================================
-- PRODUCTS
-- ============================================
CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    handle TEXT UNIQUE,
    name TEXT NOT NULL,
    price REAL,
    category TEXT,
    image_url TEXT,
    perf_score REAL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

-- ============================================
-- POST HISTORY
-- ============================================
CREATE TABLE IF NOT EXISTS post_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    headline TEXT,
    caption TEXT,
    style_used TEXT,
    ab_test_group TEXT,
    ig_media_id TEXT,
    status TEXT CHECK(status IN ('PUBLISHED','FAILED')) DEFAULT 'PUBLISHED',
    like_count INTEGER DEFAULT 0,
    comments_count INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(product_id) REFERENCES products(id)
);

-- ============================================
-- JOB QUEUE
-- ============================================
CREATE TABLE IF NOT EXISTS job_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_type TEXT NOT NULL,
    payload TEXT NOT NULL,
    status TEXT CHECK(status IN ('PENDING','RUNNING','COMPLETED','FAILED')) DEFAULT 'PENDING',
    error_message TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

-- ============================================
-- PRODUCT ASSETS
-- ============================================
CREATE TABLE IF NOT EXISTS product_assets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_handle TEXT NOT NULL,
    variant TEXT NOT NULL,                  -- 'square','portrait','landscape', etc.
    format TEXT NOT NULL,                   -- 'webp','jpg','png'
    width INTEGER NOT NULL,
    height INTEGER NOT NULL,
    file_path TEXT NOT NULL,                -- ruta relativa en /assets/...
    hash TEXT,                              -- opcional: dedupe o checksum
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_product_assets_handle_variant
  ON product_assets(product_handle, variant);

-- ============================================
-- END OF SCHEMA
-- ============================================
