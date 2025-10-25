// src/services/metrics.ts
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import fetch from 'node-fetch'; // Asegúrate que 'node-fetch' esté instalado

// ======================= TIPOS Y CONSTANTES =======================
type Platform = "instagram" | "facebook";

export type Metrics = {
    impressions?: number;
    reach?: number;
    likes?: number;
    comments?: number;
    saves?: number;    // IG saved
    shares?: number;   // FB shares
};

const META_TOKEN = process.env.META_ACCESS_TOKEN || "";
const META_API_VERSION = 'v24.0';
// ==================================================================


// ---------- Lazy Supabase Client (Adaptado a tu export) ----------
let sb: SupabaseClient | null = null;
export function getSupabaseSafe(): SupabaseClient {
    if (sb) return sb;

    const url = process.env.SUPABASE_URL;
    const key =
        process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE;

    if (!url || !key) {
        throw new Error(
            "Supabase credentials missing: set SUPABASE_URL and SUPABASE_SERVICE_KEY (or SUPABASE_SERVICE_ROLE)."
        );
    }

    // Usaremos el SERVICE KEY para las operaciones de escritura en Supabase
    sb = createClient(url, key);
    return sb;
}

// ---------- Helpers ----------
function safeNum(x: unknown): number | undefined {
    const n = Number(x);
    return Number.isFinite(n) ? n : undefined;
}

async function ensurePostHistoryId(
    supabase: SupabaseClient,
    platform: Platform,
    platformMediaId: string,
    postHistoryId?: string
): Promise<string> {
    // 1) Si viene el UUID, verificamos que exista
    const idTrim = (postHistoryId || "").trim();
    if (idTrim) {
        const { data, error } = await supabase
            .from("post_history")
            .select("id")
            .eq("id", idTrim)
            .limit(1)
            .maybeSingle();

        if (!error && data?.id) return data.id;
    }

    // 2) Resolver por media id en post_history
    if (platform === "instagram") {
        const { data, error } = await supabase
            .from("post_history")
            .select("id")
            .eq("ig_media_id", platformMediaId)
            .limit(1)
            .maybeSingle();
        if (!error && data?.id) return data.id;
    } else {
        // facebook: fb_post_ids es un array -> buscar que contenga el mediaId
        const { data, error } = await supabase
            .from("post_history")
            .select("id, fb_post_ids")
            .contains("fb_post_ids", [platformMediaId] as any)
            .limit(1)
            .maybeSingle();
        if (!error && data?.id) return data.id;
    }

    throw new Error(
        `post_history row not found for ${platform} id=${platformMediaId} (and provided post_history_id "${idTrim}" didn't match).`
    );
}

// ---------- HTTP helpers ----------
async function getJson<T = any>(url: string): Promise<T> {
    const r = await fetch(url);
    if (!r.ok) {
        const txt = await r.text().catch(() => "");
        throw new Error(`${r.status} ${r.statusText} :: ${txt}`);
    }
    return (await r.json()) as T;
}

// ================= IG (Instagram) =================

// 1) Contadores como FIELDS del media
async function fetchIGCounts(
    mediaId: string
): Promise<Pick<Metrics, "likes" | "comments">> {
    const url = `https://graph.facebook.com/${META_API_VERSION}/${mediaId}?fields=like_count,comments_count&access_token=${META_TOKEN}`;
    const j = await getJson<any>(url);
    return {
        likes: safeNum(j.like_count),
        comments: safeNum(j.comments_count),
    };
}

// 2) Insights del media (impressions/reach/saved)
async function fetchIGInsights(
    mediaId: string
): Promise<Pick<Metrics, "impressions" | "reach" | "saves">> {
    const metrics = "impressions,reach,saved";
    const url = `https://graph.facebook.com/${META_API_VERSION}/${mediaId}/insights?metric=${metrics}&access_token=${META_TOKEN}`;

    try {
        const j = await getJson<any>(url);
        const out: Pick<Metrics, "impressions" | "reach" | "saves"> = {};
        for (const row of j.data ?? []) {
            const name = row.name;
            const val = Array.isArray(row.values) ? row.values[0]?.value : undefined;
            if (typeof val === "number") {
                if (name === "impressions") out.impressions = val;
                if (name === "reach") out.reach = val;
                if (name === "saved") out.saves = val;
            }
        }
        return out;
    } catch (err: any) {
        // soft-fail: devolvemos vacío si los insights fallan (p.ej. permisos insuficientes)
        console.warn(`[Metrics] IG insights soft-fail: ${err?.message || String(err)}`);
        return {};
    }
}

async function fetchInstagramMetrics(mediaId: string): Promise<Metrics> {
    const counts = await fetchIGCounts(mediaId); // likes, comments
    const insights = await fetchIGInsights(mediaId); // impressions, reach, saves (si disponible)
    return { ...insights, ...counts };
}

// ================= FB (Facebook Page) =================

async function fetchFBCounts(
    postId: string
): Promise<Pick<Metrics, "likes" | "comments" | "shares">> {
    const url = `https://graph.facebook.com/${META_API_VERSION}/${postId}?fields=shares,likes.summary(true),comments.summary(true)&access_token=${META_TOKEN}`;

    try {
        const j = await getJson<any>(url);
        const likes = j?.likes?.summary?.total_count;
        const comments = j?.comments?.summary?.total_count;
        const shares = j?.shares?.count;
        return {
            likes: safeNum(likes),
            comments: safeNum(comments),
            shares: safeNum(shares),
        };
    } catch (err: any) {
        console.warn(`[Metrics] FB counts soft-fail: ${err?.message || String(err)}`);
        return {};
    }
}

async function fetchFBInsights(
    postId: string
): Promise<Pick<Metrics, "impressions" | "reach">> {
    const url = `https://graph.facebook.com/${META_API_VERSION}/${postId}/insights?metric=post_impressions,post_impressions_unique&access_token=${META_TOKEN}`;

    try {
        const j = await getJson<any>(url);
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
    } catch (err: any) {
        console.warn(`[Metrics] FB insights soft-fail: ${err?.message || String(err)}`);
        return {};
    }
}

async function fetchFacebookMetrics(postId: string): Promise<Metrics> {
    const counts = await fetchFBCounts(postId);
    const insights = await fetchFBInsights(postId);
    return { ...insights, ...counts };
}

// ================= Public API =================
export async function collectMetricsOnce(
    platform: Platform,
    platformMediaId: string,
    postHistoryId?: string
) {
    if (!META_TOKEN) {
        throw new Error("META_ACCESS_TOKEN missing for metrics collection.");
    }

    const supabase = getSupabaseSafe();
    const resolvedId = await ensurePostHistoryId(
        supabase,
        platform,
        platformMediaId,
        postHistoryId
    );

    const m: Metrics =
        platform === "instagram"
            ? await fetchInstagramMetrics(platformMediaId)
            : await fetchFacebookMetrics(platformMediaId);

    // no guardes métricas vacías
    const nothingUseful =
        m.impressions == null &&
        m.reach == null &&
        m.saves == null &&
        m.likes == null &&
        m.comments == null &&
        m.shares == null;

    if (nothingUseful) {
        console.log(`[Metrics] Skipping insert for ${platformMediaId}: No metrics available.`);
        return m;
    }

    // OJO: Aquí se usa "post_metrics" (la tabla original en tu código).
    // Si tu tabla se llama "metrics", cámbialo aquí.
    const { error } = await supabase.from("post_metrics").insert({
        post_history_id: resolvedId,
        platform,
        platform_media_id: platformMediaId,
        impressions: m.impressions ?? null,
        reach: m.reach ?? null,
        likes: m.likes ?? null,
        comments: m.comments ?? null,
        saves: m.saves ?? null,
        shares: m.shares ?? null,
        // created_at -> default now() en la tabla
    });

    if (error) throw error;
    return m;
}