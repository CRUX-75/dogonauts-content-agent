// src/workers/createPost.pipeline.ts
// Pipeline CREATE_POST: elegir producto + estilo + generar caption con caption-engine + guardar DRAFT

import { supabase } from "../db/supabase.js";
import { logger } from "../utils/logger.js";
import { pickStyleWithEpsilonGreedy } from "../agent/styleSelection.js";
import {
  chooseProductForCreatePost,
  type ProductRow,
} from "../agent/productSelection.js";
import { generateCaption } from "../modules/caption.engine.js";

type CreatePostPayload = {
  channel_target?: "IG" | "FB" | "BOTH";
};

export async function runCreatePostPipeline(job: {
  id: string;
  type: "CREATE_POST";
  payload: CreatePostPayload | string | null;
}) {
  // Payload puede venir como jsonb (objeto) o como string JSON desde job_queue
  let payload: CreatePostPayload = {};

  if (typeof job.payload === "string") {
    try {
      payload = JSON.parse(job.payload) as CreatePostPayload;
    } catch {
      payload = {};
    }
  } else if (job.payload && typeof job.payload === "object") {
    payload = job.payload as CreatePostPayload;
  }

  const channelTarget = payload.channel_target ?? "BOTH";

  logger.info(
    { jobId: job.id, channelTarget },
    "[CREATE_POST] Pipeline v3 (product + style + caption-engine)"
  );

  // 1) Elegir producto con Epsilon-Greedy adaptado al schema real
  const product: ProductRow = await chooseProductForCreatePost();
  logger.info(
    { jobId: job.id, productId: product.id, productName: product.name },
    "[CREATE_POST] Producto elegido"
  );

  // 2) Elegir estilo con Epsilon-Greedy
  const primaryChannel =
    channelTarget === "BOTH" ? "IG" : (channelTarget as "IG" | "FB");

  const style = await pickStyleWithEpsilonGreedy(primaryChannel);
  logger.info(
    { jobId: job.id, style, channel: primaryChannel },
    "[CREATE_POST] Estilo elegido"
  );

  // 3) Caption usando caption-engine (con cache en Supabase)
  const captionRes = await generateCaption(
    {
      id: product.id,
      name: product.name,
      description: product.description,
      price: product.price ?? 0,
      category: product.category,
      brand: product.brand,
    } as any,
    style
  );

  const captionIG = captionRes.caption;
  const captionFB = captionRes.caption; // más adelante se puede diferenciar por canal

  const creativeBrief = `Visual basierend auf dem Stil "${style}": Produkt "${product.name}" im Fokus, klare Lesbarkeit des Headlines "${captionRes.headline}", dezentes Dogonauts-Space-Branding.`;

  const imagePrompt = `High quality product photo of "${product.name}" with a ${style} background, soft shadows, Dogonauts space-themed branding, Instagram feed ready, square format.`;

  // 4) Insertar DRAFT en generated_posts
  const { data, error } = await supabase
    .from("generated_posts" as any)
    .insert({
      product_id: product.id,
      channel_target: channelTarget,
      caption_ig: captionIG,
      caption_fb: captionFB,
      creative_brief: creativeBrief,
      image_prompt: imagePrompt,
      tone: "funny", // por ahora fijo; luego lo podrías mapear al style
      style,
      status: "DRAFT",
      job_id: job.id,
    } as any)
    .select()
    .maybeSingle();

  if (error) {
    logger.error(
      { jobId: job.id, error },
      "[CREATE_POST] Error guardando DRAFT"
    );
    throw error;
  }

  logger.info(
    {
      jobId: job.id,
      generated_post_id: data?.id,
      productId: product.id,
      productName: product.name,
      style,
    },
    "[CREATE_POST] DRAFT creado correctamente (v3)"
  );

  return data;
}
