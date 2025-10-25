import { getProductsToPost, type Product } from "./tools/catalog.supabase.js";
import { publishInstagram, publishFacebook } from "./tools/meta.js"; // ¡ASEGÚRATE QUE ESTAS SEAN LAS FUNCIONES ROBUSTAS!

// ----- IMPORTS ACTUALIZADOS -----
import {
  getSupabase,
  logEvent,
  createPendingPost,
  updatePostToPublished,
  updatePostToFailed,
} from "./tools/supabase.js";
// ---------------------------------

import { moderationGuard } from "./tools/moderation.js";
import { hash } from "./core/util.js";

import { renderCaption, pickStyleByCampaign, type CaptionStyle } from "./templates/captions.js";
import { refineWithOpenAI } from "./services/captionRefiner.js";

// ... (las funciones normalizeMediaUrl, alreadyPublished y los types se quedan igual) ...
// ... (asegúrate que la función 'alreadyPublished' siga ahí) ...

// helper: garantiza una URL que IG pueda descargar (jpg/png directa)
function normalizeMediaUrl(raw: string): string {
  const override = process.env.MEDIA_TEST_URL?.trim();
  if (override) return override;

  if (/picsum\.photos/.test(raw)) {
    return "https://picsum.photos/seed/dogonauts/1080/1080.jpg";
  }
  return raw;
}

type Network = "instagram" | "facebook";

export type RunBatchInput = {
  campaign_name?: string;
  limit?: number;
  dryRun?: boolean;
  networks?: Network[];

  templateStyle?: CaptionStyle;
  captionRefine?: boolean;

  // auditoría
  debug?: boolean;        // devuelve 'skipped' con razones
  forcePublish?: boolean; // ignora idempotencia
};

export type RunBatchResultItem = {
  product_id: string;
  image_url: string;
  caption: string;
  planned_networks: Network[];
  published?: { ig?: any; fb?: any };
};

export type RunBatchResult = {
  count: number;
  results: RunBatchResultItem[];
  skipped?: Array<{ product_id: string; reason: string; detail?: any }>;
};

async function alreadyPublished(contentHash: string): Promise<boolean> {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("post_history")
      .select("id")
      .eq("content_hash", contentHash)
      .limit(1);
    if (error) return false;
    return Array.isArray(data) && data.length > 0;
  } catch {
    return false;
  }
}


export async function runBatch({
  campaign_name,
  limit = 1,
  dryRun = false,
  networks = ["instagram", "facebook"],
  templateStyle,
  captionRefine,
  debug = false,
  forcePublish = false,
}: RunBatchInput): Promise<RunBatchResult> {
  // 1) Selección (Esto se queda igual)
  let items: Product[] = [];
  try {
    items = await getProductsToPost({ limit });
  } catch (e: any) {
    if (!dryRun) throw e;
    items = Array.from({ length: limit }).map((_, i) => ({
      product_id: `demo-${i + 1}`,
      uid: `demo-${i + 1}`,
      product_name: `Producto demo ${i + 1}`,
      product_category: "demo",
      main_benefit: "comodidad",
      product_url: "https://example.com/product",
      image_url: "https://picsum.photos/seed/dogonauts/1200/1200",
      campaign_name: campaign_name || "regular",
    })) as any;
  }

  const results: RunBatchResultItem[] = [];
  const skipped: Array<{ product_id: string; reason: string; detail?: any }> = [];

  const campaign = String(campaign_name || "");
  const style: CaptionStyle = templateStyle || pickStyleByCampaign(campaign);

  // 2) Por item
  for (const p of items) {
    let postId: string | null = null; // <-- Para rastrear el ID de BBDD en el CATCH

    try {
      // 2.1-2.5 (Generación, Refino, Moderación, Hash, Idempotencia)
      // --- ESTO SE QUEDA EXACTAMENTE IGUAL ---
      
      // 2.1 Caption base
      const baseCaption = renderCaption(style, {
        productName: p.product_name || '',
        brand: "Dogonauts",
        benefit: p.main_benefit || '',
        hashtagBase: ["#dogonauts", "#perrosfelices", "#doglover"],
        season: /invierno|winter/i.test(p.campaign_name || campaign) ? "winter" : undefined,
        tone: "playful",
      });

      // 2.2 Refino
      const shouldRefine = captionRefine === false ? false : !!((process.env.OPENAI_API_KEY || ''));
      let caption = baseCaption;
      if (shouldRefine) {
        // ... (lógica de refineWithOpenAI se queda igual) ...
        try {
          caption = await refineWithOpenAI(baseCaption);
        } catch (e: any) {
          await logEvent("warn", "Refine failed, using baseCaption", {
            product_id: p.product_id,
            err: e?.message,
          });
          caption = baseCaption;
        }
      }

      // 2.3 Moderación
      try {
        await moderationGuard(caption);
      } catch (e: any) {
        if (!dryRun) {
          skipped.push({ product_id: p.product_id || 'unknown', reason: "MODERATION_BLOCKED", detail: e?.message || String(e) });
          await logEvent("warn", "Moderation blocked", { product_id: p.product_id, err: e?.message });
          continue;
        }
      }

      // 2.4 Hash
      const contentHash = hash(
        `${p.product_id}|${p.image_url || ''}|${caption}|${[...networks].sort().join("")}`
      );

      // 2.5 Idempotencia
      if (!dryRun && !forcePublish && (await alreadyPublished(contentHash))) {
        skipped.push({ product_id: p.product_id || 'unknown', reason: "IDEMPOTENT", detail: { hash: contentHash } });
        await logEvent("info", "Idempotent skip", { product_id: p.product_id, hash: contentHash });
        continue;
      }
      
      // 2.6 DryRun
      if (dryRun) {
        results.push({
          product_id: p.product_id || 'unknown',
          image_url: p.image_url || '',
          caption,
          planned_networks: networks,
        });
        await logEvent("info", "Plan (dryRun)", { uid: (p as any).uid, product_id: p.product_id, networks });
        continue;
      }

      // ----- INICIO DE LA REFACTORIZACIÓN (Pasos 2.7 y 2.8) -----

      // 2.7.A: Crear registro PENDING en BBDD
      const pendingPost = await createPendingPost({
        product_id: p.product_id || 'unknown',
        caption,
        image_urls: [p.image_url || ''],
        campaign: p.campaign_name || campaign_name || "default",
        content_hash: contentHash,
        networks: networks,
      });
      
      postId = pendingPost.id; // ¡Tenemos el ID!
      await logEvent("info", `Created PENDING post ${postId}`, { product_id: p.product_id });

      // 2.7.B: Publicación real
      let ig: any = null;
      let fb: any = null;
      const imgUrl = normalizeMediaUrl(p.image_url || '');

      if (networks.includes("instagram")) {
        // Asumimos que publishInstagram es tu nueva 'safePostToInstagram'
        ig = await publishInstagram([imgUrl], caption); 
      }
      if (networks.includes("facebook")) {
        fb = await publishFacebook([imgUrl], caption);
      }

      // 2.8: Actualizar a PUBLISHED
      await updatePostToPublished(postId!, {
        ig_media_id: ig?.media_id ?? ig?.platform_media_id ?? null, // (Cubre ambos nombres de propiedad)
        fb_post_ids: fb?.post_ids ?? [],
      });

      // 2.9: Log y resultado (Éxito)
      results.push({
        product_id: p.product_id || 'unknown',
        image_url: p.image_url || '',
        caption,
        planned_networks: networks,
        published: { ig, fb },
      });

      await logEvent("info", `Post ${postId} PUBLISHED`, {
        uid: (p as any).uid,
        product_id: p.product_id,
        ig_media_id: ig?.media_id ?? ig?.platform_media_id,
        hash: contentHash,
      });

      // ----- FIN DE LA REFACTORIZACIÓN -----

    } catch (e: any) { // <-- Este es el CATCH general del bucle
      
      // 2.10: Manejo de fallos (de IA, de publicación, de BBDD...)
      const reason = e.message.includes("MODERATION") ? "MODERATION_BLOCKED" : "WORKFLOW_FAILED";
      
      skipped.push({ 
        product_id: p.product_id || 'unknown', 
        reason, 
        detail: e?.message || String(e) 
      });
      
      await logEvent("error", `Workflow Failed: ${e?.message || "item_failed"}`, { 
        stack: e?.stack, 
        product_id: p.product_id,
        postId_db: postId 
      });

      // Si el post 'PENDING' se creó pero algo falló después (la publicación o el update),
      // lo marcamos como FAILED.
      if (postId) {
        await updatePostToFailed(postId, e?.message || String(e));
      }
      // 'continue' ya está implícito al final del bucle 'try...catch'
    }
  } // Fin del 'for (const p of items)'

  return debug ? { count: results.length, results, skipped } : { count: results.length, results };
}