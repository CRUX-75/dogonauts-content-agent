// scripts/migrations/002_job_queue_add_error.ts
import Database from "better-sqlite3";

const db = new Database("./data/db.sqlite");

const cols = db.prepare("PRAGMA table_info(job_queue)").all().map((r:any)=>r.name);

// añade 'error' si no existe
if (!cols.includes("error")) {
  db.exec("ALTER TABLE job_queue ADD COLUMN error TEXT");
  console.log("✅ Added column job_queue.error");
} else {
  console.log("ℹ️ Column job_queue.error already exists");
}

// (opcional) por si tu esquema usa también estas columnas:
if (!cols.includes("retry_count")) {
  db.exec("ALTER TABLE job_queue ADD COLUMN retry_count INTEGER DEFAULT 0");
  console.log("✅ Added column job_queue.retry_count");
}
if (!cols.includes("next_attempt_at")) {
  db.exec("ALTER TABLE job_queue ADD COLUMN next_attempt_at TEXT");
  console.log("✅ Added column job_queue.next_attempt_at");
}
