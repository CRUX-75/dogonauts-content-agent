// src/services/metrics.ts
import fetch from "node-fetch";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

type Platform = "instagram" | "facebook";

export type Metrics = {
  impressions?: number; // compat: en IG v22+ usaremos "views" como impresiones
  reach?: number;
  likes?: number;
  comments?: number;
  saves?: number;   // IG saved
  shares?: number;  // FB shares
  views?: number;   // IG v22+ media views (nuevo)
};

const META_TOKEN = process.env.META_ACCESS_TOKEN || "";

// ---------- Lazy Supabase Client ----------
let sb: SupabaseClient | null = null;
function getSupabaseSafe(): SupabaseClient {
  if (sb) return sb;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE;

  if (!url || !key) {
    throw new Error(
      "Supabase credentials missing: set SUPABASE_URL and SUPABASE_SERVICE_KEY (or SUPABASE_SERVICE_ROLE)."
    );
  }

  sb = createClient(url, key);
  return sb;
}

// ---------- Helpers ----------
function safeNum(x: any): number | undefined {
  const n = Number(x);
  return Number.isFinite(n) ? n : undefined;
}

// ================= IG (Instagram) =================

// FIELDS del media (seguros)
async function fetchIGCounts(mediaId: string): Promise<Pick<Metrics, "likes" | "comments">> {
  const url = `https://graph.facebook.com/v24.0/${mediaId}?fields=like_count,comments_count&access_token=${META_TOKEN}`;
  const r = await fetch(url);
  if (!r.ok) {
    const txt = await r.text();
    throw new Error(`IG counts error: ${r.status} ${txt}`);
  }
  const j = await r.json();
  return {
    likes: safeNum(j.like_count),
    comments: safeNum(j.comments_count),
  };
}

// INSIGHTS del media (v22+ usa "views"; "impressions" está deprecado)
async function fetchIGInsights(mediaId: string): Promise<Pick<Metrics, "views" | "reach" | "saves" | "impressions">> {
  // probar primero "views,reach,saved"
  let url = `https://graph.facebook.com/v24.0/${mediaId}/insights?metric=views,reach,saved&access_token=${META_TOKEN}`;
  let r = await fetch(url);
  if (!r.ok) {
    const txt = await r.text();
    console.warn(`IG insights views soft-fail: ${r.status} ${txt}`);
    // Como compat, intentar "reach,saved" solo (sin views) para cuentas que aún no lo exponen
    url = `https://graph.facebook.com/v24.0/${mediaId}/insights?metric=reach,saved&access_token=${META_TOKEN}`;
    r = await fetch(url);
    if (!r.ok) {
      const txt2 = await r.text();
      console.warn(`IG insights reach/saved soft-fail: ${r.status} ${txt2}`);
      return {};
    }
  }
  const j = await r.json();
  const out: any = {};
  for (const row of j.data ?? []) {
    const name = row.name;
    const val = Array.isArray(row.values) ? row.values[0]?.value : undefined;
    if (typeof val === "number") out[name] = val;
  }

  // Mapear "views" → "impressions" para compat (Meta sustituyó impresiones por views)
  const m: Pick<Metrics, "views" | "reach" | "saves" | "impressions"> = {};
  if (typeof out.views === "number") {
    m.views = out.views;
    m.impressions = out.views; // compat
  }
  if (typeof out.reach === "number") m.reach = out.reach;
  if (typeof out.saved === "number") m.saves = out.saved;

  return m;
}

async function fetchInstagramMetrics(mediaId: string): Promise<Metrics> {
  const counts = await fetchIGCounts(mediaId);      // likes, comments
  const insights = await fetchIGInsights(mediaId);  // views (→ impressions), reach, saves
  return { ...insights, ...counts };
}

// ================= FB (Facebook Page) =================

async function fetchFBCounts(postId: string): Promise<Pick<Metrics, "likes" | "comments" | "shares">> {
  const url = `https://graph.facebook.com/v24.0/${postId}?fields=shares,likes.summary(true),comments.summary(true)&access_token=${META_TOKEN}`;
  const r = await fetch(url);
  if (!r.ok) {
    const txt = await r.text();
    console.warn(`FB counts soft-fail: ${r.status} ${txt}`);
    return {};
  }
  const j = await r.json();
  const likes = j?.likes?.summary?.total_count;
  const comments = j?.comments?.summary?.total_count;
  const shares = j?.shares?.count;
  return {
    likes: safeNum(likes),
    comments: safeNum(comments),
    shares: safeNum(shares),
  };
}

async function fetchFBInsights(postId: string): Promise<Pick<Metrics, "impressions" | "reach">> {
  const url = `https://graph.facebook.com/v24.0/${postId}/insights?metric=post_impressions,post_impressions_unique&access_token=${META_TOKEN}`;
  const r = await fetch(url);
  if (!r.ok) {
    const txt = await r.text();
    console.warn(`FB insights soft-fail: ${r.status} ${txt}`);
    return {};
  }
  const j = await r.json();
  const map: Record<string, number> = {};
  for (const item of j.data ?? []) {
    const name = item.name;
    const value = Array.isArray(item.values) ? item.values[0]?.value : undefined;
    if (typeof value === "number") map[name] = value;
  }
  return {
    impressions: safeNum(map["post_impressions"]),
    reach: safeNum(map["post_impressions_unique"]),
  };
}

async function fetchFacebookMetrics(postId: string): Promise<Metrics> {
  const counts = await fetchFBCounts(postId);
  const insights = await fetchFBInsights(postId);
  return { ...insights, ...counts };
}

// ================= Resolver post_history_id =================
async function ensurePostHistoryId(
  supabase: SupabaseClient,
  platform: Platform,
  platformMediaId: string,
  postHistoryId?: string
): Promise<string> {
  const idTrim = (postHistoryId || "").trim();
  if (idTrim) {
    const { data } = await supabase
      .from("post_history")
      .select("id")
      .eq("id", idTrim)
      .limit(1)
      .maybeSingle();
    if (data?.id) return data.id;
  }

  if (platform === "instagram") {
    const { data } = await supabase
      .from("post_history")
      .select("id")
      .eq("ig_media_id", platformMediaId)
      .limit(1)
      .maybeSingle();
    if (data?.id) return data.id;
  } else {
    const { data } = await supabase
      .from("post_history")
      .select("id")
      .contains("fb_post_ids", [platformMediaId] as any)
      .limit(1)
      .maybeSingle();
    if (data?.id) return data.id;
  }

  throw new Error(
    `post_history row not found for ${platform} id=${platformMediaId} (and provided post_history_id didn't match).`
  );
}

// ================= Public API =================
export async function collectMetricsOnce(
  platform: Platform,
  platformMediaId: string,
  postHistoryId?: string
) {
  if (!META_TOKEN) throw new Error("META_ACCESS_TOKEN missing for metrics collection.");

  const supabase = getSupabaseSafe();
  const resolvedId = await ensurePostHistoryId(supabase, platform, platformMediaId, postHistoryId);

  const m: Metrics =
    platform === "instagram"
      ? await fetchInstagramMetrics(platformMediaId)
      : await fetchFacebookMetrics(platformMediaId);

  const { error } = await supabase.from("post_metrics").insert({
    post_history_id: resolvedId,
    platform,
    platform_media_id: platformMediaId,
    impressions: m.impressions ?? null, // en IG v22+ esto es views
    reach: m.reach ?? null,
    likes: m.likes ?? null,
    comments: m.comments ?? null,
    saves: m.saves ?? null,
    shares: m.shares ?? null,
    views: m.views ?? null, // campo nuevo opcional
  });

  if (error) throw error;
  return m;
}
