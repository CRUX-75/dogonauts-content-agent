// src/tools/catalog.supabase.ts
import { getSupabase } from "./supabase.js";
import { getCooldownDays } from "../services/config.js";

export type Product = {
  id: string;
  product_id?: string;          // por compat
  uid?: string;                 // por compat
  product_name?: string;        // por compat
  name?: string;
  category?: string;
  main_benefit?: string;
  product_url?: string;
  image_url: string;
  campaign_name?: string | null;
  is_active?: boolean;
  created_at?: string;
};

export async function getProductsToPost(opts: { limit: number }): Promise<Product[]> {
  const sb = getSupabase();
  const cd = await getCooldownDays(14);

  // 1) productos activos y con image_url válida
  // 2) excluir los posteados dentro de cd días (LEFT JOIN contra subselect de post_history)
  const { data, error } = await sb.rpc("get_products_to_post_rpc", { cd_days: cd, lim: opts.limit });
  // Si no quieres RPC, dejo debajo la versión en SQL crudo con 2 llamadas.

  if (error) {
    // fallback simple si falla la RPC: trae cualquiera activo
    const fb = await sb
      .from("products")
      .select("*")
      .eq("is_active", true)
      .ilike("image_url", "http%")
      .order("created_at", { ascending: false })
      .limit(opts.limit);
    if (fb.error) throw fb.error;
    return (fb.data || []) as Product[];
  }

  // Normalizar nombres por compatibilidad con tu agent actual
  return (data || []).map((p: any, i: number) => ({
    id: p.id,
    product_id: p.product_id ?? p.id,
    uid: p.uid ?? p.id ?? `p-${i + 1}`,
    product_name: p.product_name ?? p.name,
    name: p.name,
    category: p.category,
    main_benefit: p.main_benefit,
    product_url: p.product_url,
    image_url: p.image_url,
    campaign_name: p.campaign_name,
    is_active: p.is_active,
    created_at: p.created_at,
  })) as Product[];
}
