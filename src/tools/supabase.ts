// src/tools/supabase.ts
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let _supabase: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (_supabase) return _supabase;

  // lee envs en el MOMENTO de uso, no al importar el módulo
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE;

  if (!url || !key) {
    const msg = [
      "Faltan variables de entorno para Supabase:",
      `  SUPABASE_URL=${url ? "OK" : "MISSING"}`,
      `  SUPABASE_SERVICE_KEY|SUPABASE_SERVICE_ROLE=${key ? "OK" : "MISSING"}`
    ].join("\n");
    throw new Error(msg);
  }

  _supabase = createClient(url, key);
  return _supabase;
}

// Helpers reutilizando el singleton
export async function insertPostHistory(row: any) {
  const supabase = getSupabase();
  if (!row?.product_id) {
    console.warn("[post_history] row sin product_id:", row);
    return;
  }
  const { data, error } = await supabase
    .from("post_history")
    .insert([{
      product_id: row.product_id,
      caption: row.caption || "",
      image_urls: row.image_urls || [],
      ig_creation_id: row.ig_creation_id || null,
      ig_media_id: row.ig_media_id || null,
      fb_post_ids: row.fb_post_ids || [],
      campaign: row.campaign || null,
      published_at: row.published_at || new Date().toISOString(),
      content_hash: row.content_hash || null,
    }])
    .select();

  if (error) console.error("Error insert post_history:", error.message);
  return data;
}

export async function logEvent(
  level: "info" | "warn" | "error",
  message: string,
  meta?: any
) {
  try {
    const supabase = getSupabase();
    await supabase.from("post_feedback").insert({
      level,
      message,
      meta,
      created_at: new Date().toISOString(),
    } as any);
  } catch {
    // no romper por logging
  }
}
