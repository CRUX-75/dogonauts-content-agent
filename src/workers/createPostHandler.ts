// src/workers/createPostHandler.ts
import { supabase } from "../db/supabase.js";
import { chooseProductForCreatePost } from "../agent/productSelection.js";
import { pickStyleWithEpsilonGreedy } from "../agent/styleSelection.js";
import { generateCaption } from "../modules/caption.engine.js";
import type { ProductRow } from "../agent/productSelection.js";

type CreatePostPayload = {
  channel_target?: "IG" | "FB" | "BOTH";
};

export async function handleCreatePostJob(job: {
  id: string;
  type: "CREATE_POST";
  payload: CreatePostPayload;
}) {
  const channelTarget = job.payload.channel_target ?? "BOTH";

  // 1) Elegir producto
  const product: ProductRow = await chooseProductForCreatePost();

  // 2) Elegir estilo (basado en IG por defecto si BOTH)
  const primaryChannel =
    channelTarget === "BOTH" ? "IG" : channelTarget;
  const style = await pickStyleWithEpsilonGreedy(
    primaryChannel as "IG" | "FB"
  );

  // 3) Generar headline + caption usando TU caption-engine (con caché)
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

  // 4) Derivar campos para generated_posts
  const captionIG = captionRes.caption;
  const captionFB = captionRes.caption; // de momento igual, luego podemos tunearlo

  // creative_brief e image_prompt simples por ahora (placeholder)
  const creativeBrief = `Visual basierend auf dem Stil "${style}": Produkt "${product.name}" im Fokus, klare Lesbarkeit des Headlines "${captionRes.headline}", Dogonauts-Branding dezent im Hintergrund.`;
  const imagePrompt = `High quality product photo of "${product.name}" with a ${style} background, Dogonauts space-themed branding, soft lighting, Instagram-ready, 1:1 aspect ratio.`;

  // 5) Insertar DRAFT en generated_posts
  const { data, error } = await supabase
    .from("generated_posts" as any)
    .insert({
      product_id: product.id,
      channel_target: channelTarget,
      caption_ig: captionIG,
      caption_fb: captionFB,
      creative_brief: creativeBrief,
      image_prompt: imagePrompt,
      tone: "funny",        // si luego quieres mapearlo desde captionRes, lo cambiamos
      style,
      status: "DRAFT",
      job_id: job.id,
    } as any)
    .select()
    .maybeSingle();

  if (error) {
    console.error("Error inserting generated_post:", error);
    throw error;
  }

  console.log(
    "[CREATE_POST] Draft created →",
    data?.id,
    "product:",
    product.id,
    "style:",
    style
  );

  return data;
}
