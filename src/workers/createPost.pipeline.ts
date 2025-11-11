// src/workers/createPost.pipeline.ts
// Pipeline CREATE_POST v2: elegir producto real + guardar DRAFT con caption estático

import { supabase } from "../db/supabase.js";
import { logger } from "../utils/logger.js";
import {
  chooseProductForCreatePost,
  type ProductRow,
} from "../agent/productSelection.js";

type CreatePostPayload = {
  channel_target?: "IG" | "FB" | "BOTH";
};

export async function runCreatePostPipeline(job: {
  id: string;
  type: "CREATE_POST";
  payload: CreatePostPayload;
}) {
  const channelTarget = job.payload?.channel_target ?? "BOTH";

  logger.info(
    { jobId: job.id, channelTarget },
    "[CREATE_POST] Pipeline v2 (product + static caption)"
  );

  // 1) Elegir producto con Epsilon-Greedy adaptado al schema real
  const product: ProductRow = await chooseProductForCreatePost();
  logger.info(
    { jobId: job.id, productId: product.id, productName: product.name },
    "[CREATE_POST] Producto elegido"
  );

  // 2) Caption estático sencillo (sin OpenAI todavía)
  const baseCaption = `AUTOTEST: Neues Dogonauts-Posting für Produkt ${product.name}.`;
  const captionIG = `${baseCaption} #dogonauts #orchideen #test`;
  const captionFB = baseCaption;

  const creativeBrief = `Test-Post für Produkt "${product.name}" (ID ${product.id}). Nur zum Prüfen des Pipelines.`;
  const imagePrompt = `Simple test image prompt for product ${product.name}.`;

  // 3) Insertar DRAFT en generated_posts
  const { data, error } = await supabase
    .from("generated_posts" as any)
    .insert({
      product_id: product.id,
      channel_target: channelTarget,
      caption_ig: captionIG,
      caption_fb: captionFB,
      creative_brief: creativeBrief,
      image_prompt: imagePrompt,
      tone: "test",
      style: "test-static",
      status: "DRAFT",
      job_id: job.id,
    } as any)
    .select()
    .maybeSingle();

  if (error) {
    logger.error(
      { jobId: job.id, error },
      "[CREATE_POST] Error guardando DRAFT (v2)"
    );
    throw error;
  }

  logger.info(
    {
      jobId: job.id,
      generated_post_id: data?.id,
      productId: product.id,
      productName: product.name,
    },
    "[CREATE_POST] DRAFT creado correctamente (v2, static caption)"
  );

  return data;
}
