// src/workers/main.worker.ts
// Worker principal: consume job_queue en Supabase y procesa jobs del agente

import { queries, Job } from "../db/queries.js";      // 👈 volvemos a tu ruta original
import { logger } from "../utils/logger.js";
import { runCreatePostPipeline } from "./createPost.pipeline.js";

const POLL_INTERVAL_MS = 15_000; // 15s

async function handleJob(job: Job) {
  try {
    logger.info({ jobId: job.id, type: job.type }, "🧵 Empezando job");

    switch (job.type) {
      case "CREATE_POST": {
        // MARCA clara para saber que usamos el worker nuevo
        logger.info(
          { jobId: job.id },
          "[CREATE_POST] Usando pipeline NUEVO v2"
        );

        await runCreatePostPipeline({
          id: String(job.id),
          type: "CREATE_POST",
          payload: (job.payload as any) ?? {},
        });

        await queries.setJobResult(job.id);
        break;
      }

      case "FEEDBACK_LOOP": {
        logger.info(
          { jobId: job.id },
          "Procesando job FEEDBACK_LOOP (feedback TODO)"
        );
        await queries.setJobResult(job.id);
        break;
      }

      case "AB_TEST": {
        logger.info(
          { jobId: job.id },
          "Procesando job AB_TEST (A/B testing TODO)"
        );
        await queries.setJobResult(job.id);
        break;
      }

      default: {
        logger.warn(
          { jobId: job.id, type: job.type },
          "Tipo de job desconocido, marcando FAILED"
        );
        await queries.setJobFailed(job.id, `Unknown job type: ${job.type}`);
        break;
      }
    }

    logger.info({ jobId: job.id, type: job.type }, "✅ Job completado");
  } catch (err: any) {
    logger.error(
      {
        jobId: job.id,
        error: err?.message ?? String(err),
      },
      "❌ Error procesando job"
    );

    await queries.setJobFailed(
      job.id,
      err instanceof Error ? err.message : "Unknown error while processing job"
    );
  }
}

export async function startWorker() {
  logger.info("[worker] started");

  const loop = async () => {
    try {
      const job = await queries.getAndClaimJob();

      if (!job) {
        // Nada pendiente
        return;
      }

      await handleJob(job);
    } catch (err: any) {
      logger.error(
        { error: err?.message ?? String(err) },
        "❌ Error en el loop del worker"
      );
    }
  };

  // Primera pasada inmediata
  await loop();
  // Luego polling periódico
  setInterval(loop, POLL_INTERVAL_MS);
}
