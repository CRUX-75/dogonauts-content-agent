// src/tools/supabase.ts
import { createClient } from "@supabase/supabase-js";

// ELIMINADA: La interfaz PostHistoryWithMetrics (para evitar el error TS2339)

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
 * CORREGIDO: Elimina el join implícito problemático y usa consulta separada.
 */
export async function getPostsToCollectMetrics() {
    const supabase = getSupabase();

    // Calcula la fecha de hace 24 horas.
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    // PASO 1: Consulta simple, SÓLO post_history. Evita el join que falla.
    const { data: rawPosts, error } = await supabase
        .from('post_history')
        .select(`id, ig_media_id, fb_post_ids`) 
        .eq('status', 'PUBLISHED')
        .not('ig_media_id', 'is', null) 
        .limit(50); 
    
    // Forzamos el tipo (simplificado ya que no hay latest_metric en el select)
    const posts = rawPosts as any[] | null; 

    if (error) {
        throw new Error(`Failed to fetch posts for metrics collection: ${error.message}`);
    }
    
    if (!posts || posts.length === 0) {
        return [];
    }
    
    // PASO 2: FILTRADO EN EL CLIENTE Y BÚSQUEDA DE MÉTRICAS (Menos eficiente pero a prueba de fallos de caché)
    const postsToCollect: any[] = [];
    
    for (const p of posts) {
        // Buscamos la última métrica de este post
        const { data: latestMetricData } = await supabase
            .from('post_metrics')
            .select('captured_at')
            .eq('post_history_id', p.id)
            .order('captured_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        const latestMetricDate = latestMetricData?.captured_at;
        
        // Lógica de filtrado: 1. Nunca recogido, O 2. Recogido hace más de 24h
        const needsCollection = !latestMetricDate || (new Date(latestMetricDate) < new Date(oneDayAgo));

        if (needsCollection) {
             postsToCollect.push({
                post_history_id: p.id,
                platform: p.ig_media_id ? 'instagram' : 'facebook', 
                platform_media_id: p.ig_media_id || p.fb_post_ids?.[0], 
            });
        }
    }
    
    return postsToCollect.filter(p => p.platform_media_id);
}