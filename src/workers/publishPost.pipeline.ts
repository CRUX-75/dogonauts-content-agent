// src/workers/publishPost.pipeline.ts
// Pipeline PUBLISH_POST: usa generated_posts.image_url (o fallback a products),
// normaliza URL y reintenta si code 9007

import { supabase } from "../db/supabase.js";
import { logger } from "../utils/logger.js";
import { postImageToInstagram } from "../integrations/meta/instagram.js"; // <- sin extensión

type PublishPayload = {
  generated_post_id: string;
};

function normalizeUrl(u?: string | null): string | null {
  if (!u) return null;
  let s = u.trim();
  if (!s) return null;
  if (s.startsWith("//")) s = "https:" + s;
  if (!/^https?:\/\//i.test(s)) return null;
  return s;
}

function isLikelyImage(u: string): boolean {
  return /\.(png|jpe?g|webp|gif|bmp|tiff?)($|\?)/i.test(u);
}

async function getPostWithProduct(generated_post_id: string) {
  const { data, error } = await supabase
    .from("generated_posts" as any)
    .select(
      `
      id, caption_ig, style, product_id, image_url,
      products:product_id (
        id, product_name, image_url, bild2, bild3, bild4, bild5, bild6, bild7
      )
    `
    )
    .eq("id", generated_post_id)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("Draft not found");
  return data as any;
}

function pickBestFromRow(row: any): { url: string | null; source: "DRAFT" | "PRODUCT" | "NONE" } {
  // 1) Preferimos la que ya guardamos en el DRAFT
  const fromDraft = normalizeUrl(row?.image_url);
  if (fromDraft && isLikelyImage(fromDraft)) return { url: fromDraft, source: "DRAFT" };

  // 2) Fallback a products.*
  const p = row?.products ?? {};
  const candidates = [p.image_url, p.bild2, p.bild3, p.bild4, p.bild5, p.bild6, p.bild7];

  for (const c of candidates) {
    const n = normalizeUrl(c);
    if (n && isLikelyImage(n)) return { url: n, source: "PRODUCT" };
  }
  for (const c of candidates) {
    const n = normalizeUrl(c);
    if (n) return { url: n, source: "PRODUCT" };
  }
  return { url: null, source: "NONE" };
}

async function publishWithRetry(params: {
  imageUrl: string;
  caption: string;
  maxRetries?: number;
  waitMs?: number;
}) {
  const { imageUrl, caption } = params;
  const maxRetries = params.maxRetries ?? 3;
  const waitMs = params.waitMs ?? 3500;

  let lastErr: any = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const res = await postImageToInstagram({ image_url: imageUrl, caption });
      return res; // { id/media_id, permalink, ... }
    } catch (err: any) {
      lastErr = err;
      const code =
        err?.code ??
        err?.error_code ??
        err?.response?.data?.error?.code ??
        err?.response?.data?.error?.error_subcode;

      logger.warn({ attempt, code, err: err?.message ?? String(err) }, "[PUBLISH_POST] IG publish failed");

      // 9007: "Media ID is not available" → esperar y reintentar
      if (String(code) === "9007" && attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

export async function runPublishPostPipeline(job: {
  id: string;
  type: "PUBLISH_POST";
  payload: PublishPayload | string | null;
}) {
  logger.info({ jobId: job.id }, "[PUBLISH_POST] start");

  let payload: PublishPayload | null = null;
  if (typeof job.payload === "string") {
    try {
      payload = JSON.parse(job.payload) as PublishPayload;
    } catch {
      payload = null;
    }
  } else if (job.payload && typeof job.payload === "object") {
    payload = job.payload as PublishPayload;
  }
  if (!payload?.generated_post_id) throw new Error("Missing generated_post_id in payload");

  const row = await getPostWithProduct(payload.generated_post_id);
  const caption = (row.caption_ig ?? "").trim();
  const { url: imageUrl, source } = pickBestFromRow(row);

  if (!imageUrl) {
    logger.error({ jobId: job.id, generated_post_id: row.id }, "[PUBLISH_POST] no image url available");
    throw new Error("No image URL available for publishing.");
  }

  logger.info({ jobId: job.id, source, imageUrl }, "[PUBLISH_POST] using image source");

  const res = await publishWithRetry({ imageUrl, caption });

  // Marca como PUBLISHED + guarda meta ids/permalink
  const { error: updErr } = await supabase
    .from("generated_posts" as any)
    .update({
      status: "PUBLISHED",
      published_at: new Date().toISOString(),
      meta_post_id: res?.id ?? res?.media_id ?? null,
      permalink: res?.permalink ?? null,
      channel_published: "IG",
    } as any)
    .eq("id", row.id);

  if (updErr) {
    logger.error({ jobId: job.id, err: updErr }, "[PUBLISH_POST] update error");
    throw updErr;
  }

  // Seed inicial de feedback (opcional, no crítico)
  try {
    await supabase.from("post_feedback" as any).upsert(
      {
        generated_post_id: row.id,
        channel: "IG",
        meta_post_id: res?.id ?? res?.media_id ?? null,
        metrics: {},
        collected_at: null,
      } as any,
      { onConflict: "generated_post_id" } as any
    );
  } catch (e: any) {
    logger.warn({ jobId: job.id, err: e?.message }, "[PUBLISH_POST] post_feedback seed failed (non-critical)");
  }

  logger.info(
    { jobId: job.id, generated_post_id: row.id, image_url: imageUrl, meta_post_id: res?.id ?? res?.media_id },
    "[PUBLISH_POST] done"
  );
}
