// src/workers/createPost.pipeline.ts
// MODO TEST: pipeline mínimo para verificar que el worker + Supabase insertan bien en generated_posts

import { supabase } from "../db/supabase.js";
import { logger } from "../utils/logger.js";

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
    "🚧 runCreatePostPipeline() TEST MODE"
  );

  // 👇 Usa un ID REAL de la tabla products (int8)
  const TEST_PRODUCT_ID = 15751; // este id existe en tu captura

  const { error } = await supabase
    .from("generated_posts" as any)
    .insert({
      product_id: TEST_PRODUCT_ID,
      channel_target: channelTarget,
      caption_ig: "TEST CAPTION IG",
      caption_fb: "TEST CAPTION FB",
      creative_brief: "TEST BRIEF",
      image_prompt: "TEST IMAGE PROMPT",
      tone: "test",
      style: "test-style",
      status: "DRAFT",
      job_id: job.id,
    } as any);

  if (error) {
    logger.error(
      { jobId: job.id, error: error.message ?? error },
      "❌ Error insertando generated_posts TEST"
    );
    throw error;
  }

  logger.info(
    { jobId: job.id },
    "✅ generated_posts TEST creado correctamente (TEST MODE)"
  );
}
