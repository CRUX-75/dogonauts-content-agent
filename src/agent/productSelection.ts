// src/agent/productSelection.ts
import { supabase } from "../db/supabase.js";

const DEFAULT_EPSILON = Number(process.env.EPSILON_PRODUCT ?? "0.2");
const PRODUCT_COOLDOWN_DAYS = Number(process.env.PRODUCT_COOLDOWN_DAYS ?? "7");

export interface ProductRow {
  id: number;
  name: string;
  suchnummer?: string;
  artikelnummer?: string;
  category?: string;     // kategorie
  brand?: string;        // hersteller
  price?: number | null; // verkaufspreis
  uvp?: number | null;   // UVP
  // imágenes crudas de la tabla
  image_url?: string | null;
  bild2?: string | null;
  bild3?: string | null;
  bild4?: string | null;
  bild5?: string | null;
  bild6?: string | null;
  bild7?: string | null;
  // imagen lista para usar (normalizada y validada)
  first_image_url?: string | null;
  // scoring
  perf_score?: number;
}

function normalizeUrl(u?: string | null): string | null {
  if (!u) return null;
  let s = String(u).trim();
  if (!s) return null;
  if (s.startsWith("//")) s = "https:" + s;
  if (!/^https?:\/\//i.test(s)) return null;
  return s;
}

function isLikelyImage(u: string): boolean {
  return /\.(png|jpe?g|webp|gif|bmp|tiff?)($|\?)/i.test(u);
}

function pickBestImageUrlFromProduct(p: Partial<ProductRow>): string | null {
  const candidates = [
    p.image_url, p.bild2, p.bild3, p.bild4, p.bild5, p.bild6, p.bild7,
  ];
  // 1º: que “parezcan imagen”
  for (const c of candidates) {
    const n = normalizeUrl(c);
    if (n && isLikelyImage(n)) return n;
  }
  // 2º: cualquier URL https válida
  for (const c of candidates) {
    const n = normalizeUrl(c);
    if (n) return n;
  }
  return null;
}

export async function chooseProductForCreatePost(
  epsilon: number = DEFAULT_EPSILON
): Promise<ProductRow> {
  // 1) Candidatos: productos "Im Verkauf" (en venta)
  const { data: products, error: prodError } = await supabase
    .from("products" as any)
    .select(
      `
      id,
      product_name,
      suchnummer,
      artikelnummer,
      verkaufsstatus,
      kategorie,
      hersteller,
      verkaufspreis,
      "UVP",
      image_url, bild2, bild3, bild4, bild5, bild6, bild7
    `
    )
    .eq("verkaufsstatus", "Im Verkauf")
    .limit(500);

  if (prodError) throw prodError;
  if (!products || products.length === 0) {
    throw new Error("No hay productos 'Im Verkauf' en la tabla products.");
  }

  // 2) Cooldown: evitar repetir producto en ventana reciente
  const now = new Date();
  const cooldownStart = new Date(
    now.getTime() - PRODUCT_COOLDOWN_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();

  const { data: lastPosts, error: postsError } = await supabase
    .from("generated_posts" as any)
    .select("product_id, created_at")
    .gte("created_at", cooldownStart)
    .order("created_at", { ascending: false });

  if (postsError) throw postsError;

  const recentMap = new Map<number, string>();
  (lastPosts || []).forEach((row: any) => {
    const pid = Number(row.product_id);
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

  // Helper para mapear un registro de DB a ProductRow completo
  const toProductRow = (p: any): ProductRow => {
    const name =
      p.product_name ??
      p.suchnummer ??
      p.artikelnummer ??
      "Dogonauts Produkt";

    const row: ProductRow = {
      id: Number(p.id),
      name: String(name),
      suchnummer: p.suchnummer ?? undefined,
      artikelnummer: p.artikelnummer ?? undefined,
      category: p.kategorie ?? undefined,
      brand: p.hersteller ?? undefined,
      price: p.verkaufspreis ?? null,
      uvp: p.UVP ?? null,
      image_url: p.image_url ?? null,
      bild2: p.bild2 ?? null,
      bild3: p.bild3 ?? null,
      bild4: p.bild4 ?? null,
      bild5: p.bild5 ?? null,
      bild6: p.bild6 ?? null,
      bild7: p.bild7 ?? null,
      first_image_url: null, // la resolvemos abajo
      perf_score: perfMap.get(Number(p.id)) ?? 0,
    };

    row.first_image_url = pickBestImageUrlFromProduct(row);
    return row;
  };

  // 4) Aplicar cooldown
  let candidates: ProductRow[] = (products as any[]).flatMap((p) => {
    const id = Number(p.id);
    const lastCreatedAt = recentMap.get(id);
    if (lastCreatedAt) {
      // en cooldown → lo saltamos
      return [];
    }
    return [toProductRow(p)];
  });

  // si todos están en cooldown, usamos el set completo
  if (candidates.length === 0) {
    candidates = (products as any[]).map((p) => toProductRow(p));
  }

  // 5) Epsilon-Greedy
  const r = Math.random();
  if (r < epsilon) {
    const randomIndex = Math.floor(Math.random() * candidates.length);
    const chosen = candidates[randomIndex];
    console.log("[PRODUCT] EXPLORE →", chosen.id, chosen.name);
    return chosen;
  }

  const sorted = [...candidates].sort(
    (a, b) => (b.perf_score ?? 0) - (a.perf_score ?? 0)
  );
  const bestScore = sorted[0]?.perf_score ?? 0;
  const topK = sorted.filter((p) => (p.perf_score ?? 0) === bestScore);

  const chosen = topK[Math.floor(Math.random() * topK.length)] ?? sorted[0];

  console.log(
    "[PRODUCT] EXPLOIT →",
    chosen.id,
    chosen.name,
    "score=",
    chosen.perf_score
  );
  return chosen;
}
