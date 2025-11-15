// src/workers/feedbackLoop.pipeline.ts
// Pipeline FEEDBACK_LOOP: recoge métricas (real si hay META_*; stub si no)

import { supabase } from "../db/supabase.js";
import { logger } from "../utils/logger.js";

const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN ?? "";
const META_GRAPH_VERSION = process.env.META_GRAPH_VERSION ?? "v24.0";

type FeedbackJob = {
  id: string;
  type: "FEEDBACK_LOOP";
  payload: any;
};

async function fetchIgMetrics(mediaId: string) {
  const url = `https://graph.facebook.com/${META_GRAPH_VERSION}/${mediaId}?fields=like_count,comments_count,permalink&access_token=${encodeURIComponent(
    META_ACCESS_TOKEN
  )}`;

  const res = await fetch(url, { method: "GET" });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Graph error ${res.status}: ${text}`);
  }
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error("Graph returned non-JSON");
  }
  return {
    like_count: Number(json.like_count ?? 0),
    comments_count: Number(json.comments_count ?? 0),
    permalink: String(json.permalink ?? ""),
  };
}

export async function runFeedbackLoopPipeline(job: FeedbackJob) {
  logger.info({ jobId: job.id }, "[FEEDBACK_LOOP] start");

  // Posts publicados últimos 7 días con meta_post_id
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data: posts, error } = await supabase
    .from("generated_posts" as any)
    .select(
      "id, product_id, style, channel_target, published_at, meta_post_id"
    )
    .eq("status", "PUBLISHED")
    .not("meta_post_id", "is", null)
    .gte("published_at", since);

  if (error) {
    logger.error(
      { jobId: job.id, error },
      "[FEEDBACK_LOOP] read PUBLISHED error"
    );
    throw error;
  }

  if (!posts || posts.length === 0) {
    logger.info({ jobId: job.id }, "[FEEDBACK_LOOP] nothing to collect");
    return;
  }

  const results: Array<{
    post_id: string;
    product_id: number;
    style: string;
    channel: string;
    meta_post_id: string;
    metrics: {
      like_count: number;
      comments_count: number;
      permalink?: string;
    };
  }> = [];

  const metaEnabled = !!META_ACCESS_TOKEN;

  for (const p of posts as any[]) {
    try {
      if (metaEnabled) {
        const m = await fetchIgMetrics(String(p.meta_post_id));
        results.push({
          post_id: p.id,
          product_id: p.product_id,
          style: p.style,
          channel: "IG",
          meta_post_id: String(p.meta_post_id),
          metrics: {
            like_count: m.like_count,
            comments_count: m.comments_count,
            permalink: m.permalink,
          },
        });
      } else {
        // STUB: en caso de no tener token, metemos algo mínimo
        results.push({
          post_id: p.id,
          product_id: p.product_id,
          style: p.style,
          channel: "IG",
          meta_post_id: String(p.meta_post_id),
          metrics: { like_count: 1, comments_count: 0 },
        });
      }
    } catch (e: any) {
      logger.warn(
        { jobId: job.id, post_id: p.id, err: e?.message },
        "[FEEDBACK_LOOP] metrics fetch failed"
      );
    }
    // Throttle suave para no saturar Graph
    await new Promise((r) => setTimeout(r, 200));
  }

  // Upsert en post_feedback
  for (const r of results) {
    try {
      await supabase.from("post_feedback" as any).upsert(
        {
          generated_post_id: r.post_id,
          channel: r.channel,
          // IMPORTANTE: aquí guardamos el media_id real
          // Si tu columna en Postgres se llama ig_media_id en vez de meta_post_id,
          // cambia esta línea a 'ig_media_id: r.meta_post_id'
          meta_post_id: r.meta_post_id,
          metrics: r.metrics as any,
          collected_at: new Date().toISOString(),
        } as any,
        { onConflict: "generated_post_id" } as any
      );
    } catch (e: any) {
      logger.warn(
        { jobId: job.id, post_id: r.post_id, err: e?.message },
        "[FEEDBACK_LOOP] upsert feedback failed"
      );
    }
  }

  // Calcular perf_score simple y actualizar product/style performance
  // Regla placeholder: perf = likes + 2*comments
  const prodMap = new Map<number, number>();
  const styleMap = new Map<string, number>();

  for (const r of results) {
    const perf =
      (r.metrics.like_count ?? 0) + 2 * (r.metrics.comments_count ?? 0);

    prodMap.set(r.product_id, (prodMap.get(r.product_id) ?? 0) + perf);

    const styleKey = `${r.style || "unknown"}|${r.channel}`;
    styleMap.set(styleKey, (styleMap.get(styleKey) ?? 0) + perf);
  }

  if (prodMap.size) {
    const productUpdates = Array.from(prodMap.entries()).map(
      ([product_id, perf_score]) => ({
        product_id,
        perf_score,
        // ⚠️ Si tu tabla se llama updated_at en vez de last_updated, ajusta el nombre aquí.
        last_updated: new Date().toISOString(),
      })
    );
    const { error: prodErr } = await supabase
      .from("product_performance" as any)
      .upsert(productUpdates as any, { onConflict: "product_id" } as any);
    if (prodErr)
      logger.warn(
        { jobId: job.id, err: prodErr },
        "[FEEDBACK_LOOP] product_performance upsert failed"
      );
  }

  if (styleMap.size) {
    const styleUpdates = Array.from(styleMap.entries()).map(
      ([key, perf_score]) => {
        const [style, channel] = key.split("|");
        return {
          style,
          channel,
          perf_score,
          // igual que arriba: last_updated vs updated_at según tu tabla
          last_updated: new Date().toISOString(),
        };
      }
    );
    const { error: styleErr } = await supabase
      .from("style_performance" as any)
      .upsert(styleUpdates as any, { onConflict: "style,channel" } as any);
    if (styleErr)
      logger.warn(
        { jobId: job.id, err: styleErr },
        "[FEEDBACK_LOOP] style_performance upsert failed"
      );
  }

  logger.info(
    { jobId: job.id, collected: results.length },
    "[FEEDBACK_LOOP] done"
  );
}
