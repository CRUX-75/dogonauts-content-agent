// src/tools/supabase.ts (Sólo la función getPostsToCollectMetrics)

// ... (la interfaz PostHistoryWithMetrics y el resto del código es el mismo)

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