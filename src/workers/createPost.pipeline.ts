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

// Normaliza cualquier cosa que nos devuelva caption-engine (objeto, string JSON, etc.)
// y garantiza que SIEMPRE haya headline y caption no vacíos.
function normalizeCaption(
  raw: any,
  productName: string,
  style: string
): { headline: string; caption: string } {
  let res: any = raw;

  // Si viene un string, intentamos parsearlo como JSON
  if (typeof res === "string") {
    try {
      const parsed = JSON.parse(res);
      res = {
        headline: parsed?.headline,
        caption: parsed?.caption,
      };
    } catch {
      // No es JSON, lo tratamos como caption crudo
      res = { headline: "", caption: String(raw) };
    }
  }

  let headline = String(res?.headline ?? "").trim();
  let caption = String(res?.caption ?? "").trim();

  // Si ambos vienen vacíos, usamos un fallback razonable
  if (!headline && !caption) {
    headline = `Neues ${style} Highlight: ${productName}`;
    caption = `Entdecke ${productName} – kuratiert im Stil „${style}“. #dogonauts`;
  } else {
    if (!headline) {
      headline = "Dogonauts Post";
    }
    if (!caption) {
      caption = headline;
    }
  }

  return { headline, caption };
}

export async function runCreatePostPipeline(job: {
  id: string;
  type: "CREATE_POST";
  payload: CreatePostPayload | string | null;
}) {
  // Payload puede venir como objeto o como string JSON desde job_queue (n8n)
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
  const rawCaptionRes = await generateCaption(
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

  // Normalizamos por si viene raro (objeto, string JSON, vacío, etc.)
  const { headline, caption } = normalizeCaption(
    rawCaptionRes as any,
    product.name,
    style
  );

  const captionIG = caption;
  const captionFB = caption; // más adelante se puede diferenciar por canal

  const creativeBrief = `Visual basierend auf dem Stil "${style}": Produkt "${product.name}" im Fokus, klare Lesbarkeit des Headlines "${headline}", dezentes Dogonauts-Space-Branding.`;

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
      tone: "funny", // por ahora fijo; luego lo puedes ligar a style
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
