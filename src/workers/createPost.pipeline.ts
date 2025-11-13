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
  const pp: any = p; // evitar TS sobre campos dinámicos
  const candidates = [
    pp.image_url, pp.bild2, pp.bild3, pp.bild4,
    pp.bild5, pp.bild6, pp.bild7,
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

  // 2) Estilo (solo 1 declaración)
  const style = await pickStyleWithEpsilonGreedy(primaryChannel);

  // 3) Caption
  const { headline, caption } = await generateCaption({
    product,
    style,
    channel: primaryChannel,
  });

  // 4) Imagen del producto
  const chosenImageUrl = pickBestImageUrl(product);
  if (!chosenImageUrl) {
    logger.warn(
      { jobId: job.id, productId: (product as any).id },
      "[CREATE_POST] no valid image url found; draft will be created without image_url"
    );
  }

  // 5) Insert DRAFT
  const { data, error } = await supabase
    .from("generated_posts")
    .insert({
      status: "DRAFT",
      product_id: (product as any).id,
      style,
      caption_ig: caption,
      headline,
      channel_target: channelTarget,
      job_id: job.id,
      image_url: chosenImageUrl ?? null,
    })
    .select()
    .single();

  if (error) {
    logger.error({ err: error, jobId: job.id }, "[CREATE_POST] insert error");
    throw error;
  }

  logger.info(
    { jobId: job.id, generated_post_id: data.id, image_url: chosenImageUrl },
    "[CREATE_POST] DRAFT created"
  );
}
