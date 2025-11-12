// src/workers/publishPost.pipeline.ts
// Pipeline PUBLISH_POST: publicar un generated_post en Instagram (o simularlo en DRY_RUN)

import { supabase } from "../db/supabase.js";
import { logger } from "../utils/logger.js";

const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN ?? "";
const IG_ACCOUNT_ID = process.env.IG_ACCOUNT_ID ?? "";
const META_GRAPH_VERSION = process.env.META_GRAPH_VERSION ?? "v19.0";
const META_PUBLISH_DRY_RUN = process.env.META_PUBLISH_DRY_RUN === "true";
const META_DEFAULT_IMAGE_URL = process.env.META_DEFAULT_IMAGE_URL ?? "";

type PublishPostPayload = {
  generated_post_id: string;
  // en el futuro: publish_target?: "IG" | "FB" | "BOTH";
};

async function publishToInstagram(
  caption: string
): Promise<{ meta_post_id: string; dryRun: boolean }> {
  if (!META_ACCESS_TOKEN || !IG_ACCOUNT_ID) {
    logger.warn(
      {
        hasAccessToken: !!META_ACCESS_TOKEN,
        hasIgAccountId: !!IG_ACCOUNT_ID,
      },
      "[PUBLISH_POST] Configuración Meta incompleta, usando DRY_RUN"
    );
    return {
      meta_post_id: "DRY_RUN_NO_CONFIG",
      dryRun: true,
    };
  }

  if (!META_DEFAULT_IMAGE_URL) {
    logger.warn(
      {},
      "[PUBLISH_POST] META_DEFAULT_IMAGE_URL vacío, usando DRY_RUN"
    );
    return {
      meta_post_id: "DRY_RUN_NO_IMAGE_URL",
      dryRun: true,
    };
  }

  if (META_PUBLISH_DRY_RUN) {
    logger.info(
      {},
      "[PUBLISH_POST] META_PUBLISH_DRY_RUN=true → NO llamamos a Graph, solo simulamos"
    );
    return {
      meta_post_id: "DRY_RUN_FLAG",
      dryRun: true,
    };
  }

  // 1) Crear media container
  const mediaUrl = `https://graph.facebook.com/${META_GRAPH_VERSION}/${IG_ACCOUNT_ID}/media`;

  const mediaRes = await fetch(mediaUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      image_url: META_DEFAULT_IMAGE_URL,
      caption,
      access_token: META_ACCESS_TOKEN,
    }),
  });

  const mediaBody = await mediaRes.text();
  if (!mediaRes.ok) {
    logger.error(
      { status: mediaRes.status, body: mediaBody },
      "[PUBLISH_POST] Error en /media (IG)"
    );
    throw new Error(
      `Meta /media error ${mediaRes.status}: ${mediaBody || "unknown"}`
    );
  }

  let mediaJson: any;
  try {
    mediaJson = JSON.parse(mediaBody);
  } catch {
    logger.error(
      { body: mediaBody },
      "[PUBLISH_POST] Respuesta de /media no es JSON válido"
    );
    throw new Error("Meta /media devolvió una respuesta no JSON");
  }

  const creationId = mediaJson.id;
  if (!creationId) {
    logger.error(
      { mediaJson },
      "[PUBLISH_POST] /media sin 'id' en la respuesta"
    );
    throw new Error("Meta /media no devolvió creation_id");
  }

  // 2) Publicar el media container
  const publishUrl = `https://graph.facebook.com/${META_GRAPH_VERSION}/${IG_ACCOUNT_ID}/media_publish`;

  const publishRes = await fetch(publishUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      creation_id: creationId,
      access_token: META_ACCESS_TOKEN,
    }),
  });

  const publishBody = await publishRes.text();
  if (!publishRes.ok) {
    logger.error(
      { status: publishRes.status, body: publishBody },
      "[PUBLISH_POST] Error en /media_publish (IG)"
    );
    throw new Error(
      `Meta /media_publish error ${publishRes.status}: ${
        publishBody || "unknown"
      }`
    );
  }

  let publishJson: any;
  try {
    publishJson = JSON.parse(publishBody);
  } catch {
    logger.error(
      { body: publishBody },
      "[PUBLISH_POST] Respuesta de /media_publish no es JSON válido"
    );
    throw new Error("Meta /media_publish devolvió una respuesta no JSON");
  }

  const metaPostId = publishJson.id ?? creationId;

  logger.info(
    { metaPostId, creationId },
    "[PUBLISH_POST] Publicación IG completada"
  );

  return {
    meta_post_id: String(metaPostId),
    dryRun: false,
  };
}

export async function runPublishPostPipeline(job: {
  id: string;
  type: "PUBLISH_POST";
  payload: PublishPostPayload | string | null;
}) {
  let payload: PublishPostPayload | null = null;

  if (typeof job.payload === "string") {
    try {
      payload = JSON.parse(job.payload) as PublishPostPayload;
    } catch {
      payload = null;
    }
  } else if (job.payload && typeof job.payload === "object") {
    payload = job.payload as PublishPostPayload;
  }

  if (!payload?.generated_post_id) {
    throw new Error("PUBLISH_POST job sin generated_post_id en payload");
  }

  const postId = payload.generated_post_id;

  logger.info(
    { jobId: job.id, generated_post_id: postId },
    "[PUBLISH_POST] Iniciando pipeline"
  );

  // 1) Leer el DRAFT
  const { data: post, error: fetchErr } = await supabase
    .from("generated_posts" as any)
    .select("*")
    .eq("id", postId)
    .maybeSingle();

  if (fetchErr) {
    logger.error(
      { jobId: job.id, error: fetchErr },
      "[PUBLISH_POST] Error leyendo generated_post"
    );
    throw fetchErr;
  }

  if (!post) {
    throw new Error(`generated_post no encontrado: ${postId}`);
  }

  if (post.status !== "DRAFT") {
    logger.warn(
      { jobId: job.id, status: post.status },
      "[PUBLISH_POST] Post no está en DRAFT, no se publica"
    );
    return post;
  }

  const caption = String(post.caption_ig ?? "").trim();
  if (!caption) {
    logger.warn(
      { jobId: job.id },
      "[PUBLISH_POST] caption_ig vacío, usando fallback simple"
    );
  }

  const finalCaption =
    caption || "Neuer Dogonauts-Post – jetzt entdecken! #dogonauts";

  // 2) Llamar (o simular) a Instagram Graph API
  const { meta_post_id, dryRun } = await publishToInstagram(finalCaption);

  // 3) Marcar como PUBLISHED en Supabase
  const { data: updated, error: updateErr } = await supabase
    .from("generated_posts" as any)
    .update({
      status: "PUBLISHED",
      published_at: new Date().toISOString(),
      meta_post_id,
    })
    .eq("id", postId)
    .select()
    .maybeSingle();

  if (updateErr) {
    logger.error(
      { jobId: job.id, error: updateErr },
      "[PUBLISH_POST] Error actualizando a PUBLISHED"
    );
    throw updateErr;
  }

  logger.info(
    {
      jobId: job.id,
      generated_post_id: postId,
      meta_post_id,
      dryRun,
    },
    "[PUBLISH_POST] Post marcado como PUBLISHED"
  );

  return updated;
}
