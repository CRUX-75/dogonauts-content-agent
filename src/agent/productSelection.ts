// src/agent/productSelection.ts
import { supabase } from "../db/supabase.js";

const DEFAULT_EPSILON = Number(process.env.EPSILON_PRODUCT ?? "0.2");
const PRODUCT_COOLDOWN_DAYS = Number(process.env.PRODUCT_COOLDOWN_DAYS ?? "7");

export interface ProductRow {
  id: number;
  name: string;
  description?: string;
  price?: number;
  category?: string;
  brand?: string;
  perf_score?: number;
}

export async function chooseProductForCreatePost(
  epsilon: number = DEFAULT_EPSILON
): Promise<ProductRow> {
  // 1) Candidatos: activos + con stock (ajusta campos a tu schema real)
  const { data: products, error: prodError } = await supabase
    .from("products" as any)
    .select("id, name, description, price, category, brand, is_active, stock")
    .eq("is_active", true)
    .gt("stock", 0)
    .limit(500);

  if (prodError) throw prodError;
  if (!products || products.length === 0) {
    throw new Error("No hay productos activos con stock.");
  }

  const now = new Date();
  const cooldownStart = new Date(
    now.getTime() - PRODUCT_COOLDOWN_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();

    // 2) Últimos posts recientes por producto (para cooldown)
  const { data: lastPosts, error: postsError } = await supabase
    .from("generated_posts" as any)
    .select("product_id, created_at")
    .gte("created_at", cooldownStart)
    .order("created_at", { ascending: false });

  if (postsError) throw postsError;

  const recentMap = new Map<number, string>();
  (lastPosts || []).forEach((row: any) => {
    const pid = Number(row.product_id);
    // al estar ordenado desc, el primer registro que veamos es el más reciente
    if (!recentMap.has(pid)) {
      recentMap.set(pid, String(row.created_at));
    }
  });

  // 3) perf_score por producto
  const { data: perfRows, error: perfError } = await supabase
    .from("product_performance" as any)
    .select("product_id, perf_score");

  if (perfError) throw perfError;

  const perfMap = new Map<number, number>();
  (perfRows || []).forEach((row: any) => {
    perfMap.set(Number(row.product_id), Number(row.perf_score) || 0);
  });

  // 4) Aplicar cooldown + perf_score
  let candidates: ProductRow[] = (products as any[]).flatMap((p) => {
    const id = Number(p.id);
    const lastCreatedAt = recentMap.get(id);
    if (lastCreatedAt) {
      // tuvo post en ventana de cooldown → lo saltamos
      return [];
    }
    return [
      {
        id,
        name: String(p.name),
        description: p.description ?? undefined,
        price: p.price ?? undefined,
        category: p.category ?? undefined,
        brand: p.brand ?? undefined,
        perf_score: perfMap.get(id) ?? 0,
      },
    ];
  });

  // si todos están en cooldown, usamos el set completo
  if (candidates.length === 0) {
    candidates = (products as any[]).map((p) => ({
      id: Number(p.id),
      name: String(p.name),
      description: p.description ?? undefined,
      price: p.price ?? undefined,
      category: p.category ?? undefined,
      brand: p.brand ?? undefined,
      perf_score: perfMap.get(Number(p.id)) ?? 0,
    }));
  }

  // 5) Epsilon-Greedy
  const r = Math.random();
  if (r < epsilon) {
    // EXPLORAR
    const randomIndex = Math.floor(Math.random() * candidates.length);
    const chosen = candidates[randomIndex];
    console.log("[PRODUCT] EXPLORE →", chosen.id, chosen.name);
    return chosen;
  }

  // EXPLOTAR (mayor perf_score)
  const sorted = [...candidates].sort(
    (a, b) => (b.perf_score ?? 0) - (a.perf_score ?? 0)
  );
  const bestScore = sorted[0]?.perf_score ?? 0;
  const topK = sorted.filter((p) => (p.perf_score ?? 0) === bestScore);

  const chosen =
    topK[Math.floor(Math.random() * topK.length)] ?? sorted[0];

  console.log(
    "[PRODUCT] EXPLOIT →",
    chosen.id,
    chosen.name,
    "score=",
    chosen.perf_score
  );
  return chosen;
}
