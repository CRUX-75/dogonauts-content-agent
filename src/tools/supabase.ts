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
export async function logEvent(level: 'info' | 'warn' | 'error', message: string, meta: any = {}) {
    const supabase = getSupabase();
    const { error } = await supabase.from("logs").insert({ level, message, meta });
    if (error) {
        console.error("Failed to log event:", error.message);
    }
}

// --- FUNCIONES DE ESTADO DE PUBLICACIÓN (FASE 1) ---

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
            status: "PENDING",
            product_id: payload.product_id,
            caption: payload.caption,
            image_urls: payload.image_urls,
            campaign: payload.campaign,
            content_hash: payload.content_hash,
            networks: payload.networks,
        })
        .select("id")
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
            status: "PUBLISHED",
            published_at: new Date().toISOString(),
            ig_media_id: payload.ig_media_id,
            fb_post_ids: payload.fb_post_ids,
            error_message: null, // Limpiamos errores
        })
        .eq("id", postId);

    if (error) {
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
            status: "FAILED",
            error_message: errorMessage,
        })
        .eq("id", postId);

    if (error) {
        console.error(
            `Failed to update post ${postId} to FAILED: ${error.message}`
        );
    }
}

// --- FUNCIÓN DE RECOLECCIÓN DE MÉTRICAS (FASE 3 - SPRINT 2) ---

/**
 * Obtiene posts PUBLICADOS que necesitan recolección de métricas.
 * Esta función es llamada por el endpoint /api/posts-to-collect.
 */
export async function getPostsToCollectMetrics() {
    const supabase = getSupabase();

    // Calcula la fecha de hace 24 horas.
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    // Consulta simple: solo los PUBLISHED con ID de plataforma.
    const { data: posts, error } = await supabase
        .from('post_history')
        .select(`
            id,
            platform_media_id,
            fb_post_ids,
            latest_metric:post_metrics!left(captured_at)
        `)
        .eq('status', 'PUBLISHED')
        .not('platform_media_id', 'is', null) // Solo posts de IG que tienen ID
        // .or(`latest_metric.captured_at.lt.${oneDayAgo},latest_metric.captured_at.is.null`) <--- ELIMINADO
        .limit(50); // Aumenté el límite solo para asegurarnos de traer todos los que sean necesarios para el filtro en el cliente.

    if (error) {
        throw new Error(`Failed to fetch posts for metrics collection: ${error.message}`);
    }

    // --- FILTRADO EN EL CLIENTE (Aplica la lógica OR de manera segura) ---
    const postsToCollect = posts.filter(p => {
        // La consulta de Supabase devuelve un array de 0 o 1 elemento para la relación LEFT JOIN
        const latestMetricDate = p.latest_metric?.[0]?.captured_at;

        // Condición 1: Nunca se ha recogido (latest_metric es null o un array vacío)
        if (!latestMetricDate) {
            return true;
        }
        
        // Condición 2: Se recogió hace más de 24 horas
        return new Date(latestMetricDate) < new Date(oneDayAgo);
    });
    // -------------------------------------------------------------------


    // Mapeamos los resultados para que n8n reciba solo la información necesaria
    return postsToCollect.map(p => ({
        post_history_id: p.id,
        platform: p.platform_media_id ? 'instagram' : 'facebook',
        platform_media_id: p.platform_media_id || p.fb_post_ids?.[0], // Usamos el ID de IG o el primero de FB
    })).filter(p => p.platform_media_id);
}