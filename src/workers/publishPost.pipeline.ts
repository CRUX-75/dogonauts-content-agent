// Pipeline PUBLISH_POST: usa generated_posts.image_url (o fallback a products), normaliza URL y reintenta si code 9007
import { supabase } from "../db/supabase.js";
import { logger } from "../utils/logger.js";
import { postImageToInstagram } from "../integrations/meta/instagram.js"; // <- sin extensión// ^ asume que ya tienes algo como: create container -> publish -> returns media_id / error

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
    .from("generated_posts")
    .select(
      `
      id, caption_ig, style, product_id, image_url,
      products:product_id (
        id, product_name, image_url, bild2, bild3, bild4, bild5, bild6, bild7
      )
    `
    )
    .eq("id", generated_post_id)
    .single();

  if (error) {
    throw error;
  }
  return data as any; // tipa si quieres
}

function pickBestFromRow(row: any): string | null {
  // Preferimos la que ya guardamos en el DRAFT
  const fromDraft = normalizeUrl(row?.image_url);
  if (fromDraft) return fromDraft;

  // Fallback a products.*
  const p = row?.products ?? {};
  const candidates = [
    p.image_url, p.bild2, p.bild3, p.bild4, p.bild5, p.bild6, p.bild7,
  ];
  for (const c of candidates) {
    const n = normalizeUrl(c);
    if (n && isLikelyImage(n)) return n;
  }
  for (const c of candidates) {
    const n = normalizeUrl(c);
    if (n) return n;
  }
  return null;
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
      const res = await postImageToInstagram({
        image_url: imageUrl,
        caption,
      });
      // asume que tu wrapper lanza error con code si falla
      return res; // { media_id, id, permalink, ... }
    } catch (err: any) {
      lastErr = err;
      const code = err?.code ?? err?.error_code ?? err?.response?.data?.error?.code;
      logger.warn({ attempt, code, err }, "[PUBLISH_POST] IG publish failed");
      // 9007: "Media ID is not available" (espera/propaga)
      if (code === 9007 && attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }
      // otros errores: si hay más reintentos, reintenta 1 vez igual; si no, rompe
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
  payload: PublishPayload;
}) {
  logger.info({ jobId: job.id }, "[PUBLISH_POST] start");

  const row = await getPostWithProduct(job.payload.generated_post_id);
  if (!row) {
    logger.error({ jobId: job.id }, "[PUBLISH_POST] draft not found");
    return;
  }

  const caption = (row.caption_ig ?? "").trim();
  const imageUrl = pickBestFromRow(row);

  if (!imageUrl) {
    logger.error(
      { jobId: job.id, generated_post_id: row.id },
      "[PUBLISH_POST] no image url available"
    );
    throw new Error("No image URL available for publishing.");
  }

  const res = await publishWithRetry({
    imageUrl,
    caption,
  });

  // Marca como PUBLISHED
  const { error } = await supabase
    .from("generated_posts")
    .update({
      status: "PUBLISHED",
      published_at: new Date().toISOString(),
      meta_post_id: res?.id ?? res?.media_id ?? null,
      permalink: res?.permalink ?? null,
    })
    .eq("id", row.id);

  if (error) {
    logger.error({ jobId: job.id, err: error }, "[PUBLISH_POST] update error");
    throw error;
  }

  logger.info(
    {
      jobId: job.id,
      generated_post_id: row.id,
      image_url: imageUrl,
      meta_post_id: res?.id ?? res?.media_id,
    },
    "[PUBLISH_POST] done"
  );
}
