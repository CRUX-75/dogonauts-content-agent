// src/workers/createPost.pipeline.ts
import { supabase } from "../db/supabase.js";
import { logger } from "../utils/logger.js";
import {
  chooseProductForCreatePost,
  type ProductRow,
} from "../agent/productSelection.js";
import { pickStyleWithEpsilonGreedy } from "../agent/styleSelection.js";
import { generateCaption } from "../modules/caption.engine.js";

type CreatePostPayload = {
  channel_target?: "IG" | "FB" | "BOTH";
  source?: string;
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

function pickBestImageUrl(p: Partial<ProductRow>): string | null {
  // si productSelection ya trae first_image_url, úsala directa
  if (p.first_image_url) return p.first_image_url;

  const candidates = [
    p.image_url, p.bild2, p.bild3, p.bild4,
    p.bild5, p.bild6, p.bild7,
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

export async function runCreatePostPipeline(job: {
  id: string;
  type: "CREATE_POST";
  payload: CreatePostPayload;
}) {
  const channelTarget = job.payload.channel_target ?? "BOTH";
  const primaryChannel: "IG" | "FB" =
    channelTarget === "BOTH" ? "IG" : channelTarget;

  logger.info({ jobId: job.id, channelTarget, primaryChannel }, "[CREATE_POST] start");

  // 1) Producto
  const product = await chooseProductForCreatePost();
  if (!product) {
    logger.warn({ jobId: job.id }, "[CREATE_POST] no product found");
    return;
  }

  // 2) Estilo
  const style = await pickStyleWithEpsilonGreedy(primaryChannel);

  // 3) Caption
  const { headline, caption } = await generateCaption({
    product,
    style,
    channel: primaryChannel,
  });

  // 4) Imagen del producto → se guarda en el DRAFT
  const chosenImageUrl = pickBestImageUrl(product);
  if (!chosenImageUrl) {
    logger.warn(
      { jobId: job.id, productId: (product as any).id },
      "[CREATE_POST] no valid image url found; draft will be created without image_url"
    );
  }

  // 5) Insert DRAFT
  const { data, error } = await supabase
    .from("generated_posts" as any)
    .insert({
      status: "DRAFT",
      product_id: (product as any).id,
      style,
      caption_ig: caption,
      headline,
      channel_target: channelTarget,
      job_id: job.id,
      image_url: chosenImageUrl ?? null,
    } as any)
    .select()
    .maybeSingle();

  if (error) {
    logger.error({ err: error, jobId: job.id }, "[CREATE_POST] insert error");
    throw error;
  }

  logger.info(
    { jobId: job.id, generated_post_id: data?.id, image_url: chosenImageUrl },
    "[CREATE_POST] DRAFT created"
  );
}
