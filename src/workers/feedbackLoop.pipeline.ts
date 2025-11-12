// src/workers/feedbackLoop.pipeline.ts
// Pipeline FEEDBACK_LOOP (stub): simula actualización de product_performance y style_performance

import { supabase } from "../db/supabase.js";
import { logger } from "../utils/logger.js";

export async function runFeedbackLoopPipeline(job: {
  id: string;
  type: "FEEDBACK_LOOP";
  payload: any;
}) {
  logger.info({ jobId: job.id }, "[FEEDBACK_LOOP] Iniciando pipeline (stub)");

  // 1) Posts publicados en los últimos 7 días
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data: posts, error } = await supabase
    .from("generated_posts" as any)
    .select("id, product_id, style, channel_target, published_at")
    .eq("status", "PUBLISHED")
    .gte("published_at", since);

  if (error) {
    logger.error(
      { jobId: job.id, error },
      "[FEEDBACK_LOOP] Error leyendo posts PUBLISHED"
    );
    throw error;
  }

  if (!posts || posts.length === 0) {
    logger.info(
      { jobId: job.id },
      "[FEEDBACK_LOOP] No hay posts publicados recientes (stub)"
    );
    return;
  }

  logger.info(
    { jobId: job.id, count: posts.length },
    "[FEEDBACK_LOOP] Posts a procesar (stub)"
  );

  const DEFAULT_SCORE = 1;

  // 2) Simular updates de performance por producto
  const productUpdates = posts.map((p: any) => ({
    product_id: p.product_id,
    perf_score: DEFAULT_SCORE,
  }));

  if (productUpdates.length > 0) {
    const { error: prodErr } = await supabase
      .from("product_performance" as any)
      .upsert(productUpdates as any, {
        onConflict: "product_id",
      } as any);

    if (prodErr) {
      logger.error(
        { jobId: job.id, error: prodErr },
        "[FEEDBACK_LOOP] Error actualizando product_performance (stub)"
      );
    }
  }

  // 3) Simular updates de performance por estilo+canal
  const styleUpdates = posts.map((p: any) => ({
    style: p.style,
    channel: p.channel_target ?? "IG",
    perf_score: DEFAULT_SCORE,
  }));

  if (styleUpdates.length > 0) {
    const { error: styleErr } = await supabase
      .from("style_performance" as any)
      .upsert(styleUpdates as any, {
        onConflict: "style,channel",
      } as any);

    if (styleErr) {
      logger.error(
        { jobId: job.id, error: styleErr },
        "[FEEDBACK_LOOP] Error actualizando style_performance (stub)"
      );
    }
  }

  logger.info({ jobId: job.id }, "[FEEDBACK_LOOP] Pipeline stub completado");
}
