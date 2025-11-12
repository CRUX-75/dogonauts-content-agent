// src/index.ts
// Punto de entrada principal del Dogonauts Content Agent

import "dotenv/config";
import { startServer } from "./api/server.js";
import { startWorker } from "./workers/main.worker.js";
import { logger } from "./utils/logger.js";
import { supabase } from "./db/supabase.js";

async function bootstrap() {
  logger.info("🚀 Iniciando Dogonauts Content Agent");

  // Healthcheck rápido de DB (best-effort)
  try {
    const { error } = await supabase.from("job_queue").select("id").limit(1);
    if (error) {
      logger.warn({ error }, "[bootstrap] Supabase healthcheck con errores");
    } else {
      logger.info("[bootstrap] Supabase OK");
    }
  } catch (err: any) {
    logger.warn(
      { error: err?.message ?? String(err) },
      "[bootstrap] Supabase healthcheck lanzó excepción"
    );
  }

  // Server HTTP (API interna + /health + /metrics)
  await startServer();

  // Worker (job_queue)
  await startWorker();
}

bootstrap().catch((err: any) => {
  logger.error(
    { error: err?.message ?? String(err) },
    "❌ Error fatal en bootstrap"
  );
  // eslint-disable-next-line no-process-exit
  process.exit(1);
});
