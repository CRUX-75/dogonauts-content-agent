// src/tools/supabase.ts
import { createClient } from "@supabase/supabase-js";

// (Asumo que esta función ya la tenías)
export function getSupabase() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY; // Usa la Service Key en el backend
  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Missing Supabase env vars");
  }
  return createClient(supabaseUrl, supabaseKey);
}

// (Asumo que esta función ya la tenías)
export async function logEvent(level, message, meta = {}) {
  const supabase = getSupabase();
  const { error } = await supabase.from("logs").insert({ level, message, meta });
  if (error) {
    console.error("Failed to log event:", error.message);
  }
}

// --- NUEVAS FUNCIONES DE ESTADO ---

/**
 * 1. Crea el post en estado PENDING y devuelve su ID.
 */
export async function createPendingPost(payload: {
  product_id: string;
  caption: string;
  image_urls: string[];
  campaign: string;
  content_hash: string;
  networks: string[]; // Guardamos las redes planeadas
}) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("post_history")
    .insert({
      status: "PENDING", // <-- ¡NUEVO!
      product_id: payload.product_id,
      caption: payload.caption,
      image_urls: payload.image_urls,
      campaign: payload.campaign,
      content_hash: payload.content_hash,
      networks: payload.networks, // <-- ¡NUEVO!
    })
    .select("id") // <-- Pedimos que nos devuelva el ID
    .single();

  if (error) {
    throw new Error(`Failed to create PENDING post: ${error.message}`);
  }
  return data; // { id: '...' }
}

/**
 * 2. Actualiza un post a PUBLISHED usando su ID.
 */
export async function updatePostToPublished(
  postId: string,
  payload: {
    ig_media_id: string | null;
    fb_post_ids: string[];
  }
) {
  const supabase = getSupabase();
  const { error } = await supabase
    .from("post_history")
    .update({
      status: "PUBLISHED", // <-- ¡NUEVO!
      published_at: new Date().toISOString(),
      ig_media_id: payload.ig_media_id,
      fb_post_ids: payload.fb_post_ids,
      error_message: null, // Limpiamos errores
    })
    .eq("id", postId);

  if (error) {
    // ESTO ES UN ERROR CRÍTICO: Se publicó pero no se pudo guardar.
    // Lanza un error para que el logEvent lo capture.
    throw new Error(
      `CRITICAL: Post ${postId} published but FAILED TO UPDATE status: ${error.message}`
    );
  }
  return { id: postId };
}

/**
 * 3. Actualiza un post a FAILED usando su ID.
 */
export async function updatePostToFailed(postId: string, errorMessage: string) {
  const supabase = getSupabase();
  const { error } = await supabase
    .from("post_history")
    .update({
      status: "FAILED", // <-- ¡NUEVO!
      error_message: errorMessage,
    })
    .eq("id", postId);

  if (error) {
    console.error(
      `Failed to update post ${postId} to FAILED: ${error.message}`
    );
  }
}