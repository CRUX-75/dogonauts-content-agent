// src/modules/caption.engine.ts
// Generación de captions con cache en Supabase (tipos relajados para que compile)

import { supabase } from "../db/supabase.js";
import * as LoggerModule from "../utils/logger.js";
import { buildFinalPrompt } from "../prompts/brand-identity.js";

const log: any = (LoggerModule as any).logger ?? console;

interface Product {
  id: number;
  name: string;
  description?: string;
  price: number;
  category?: string;
  brand?: string;
}

export interface CaptionResult {
  headline: string;
  caption: string;
}

// ---------- Cache helpers ----------
async function getCachedCaption(
  productId: number,
  style: string
): Promise<CaptionResult | null> {
  const { data, error } = await supabase
    .from("caption_cache" as any)
    .select("headline, caption")
    .eq("product_id", productId)
    .eq("style", style)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    log.debug?.("caption_cache read failed", { error: (error as any).message });
    return null;
  }
  if (!data) return null;

  const row = data as any;
  if (!row.headline || !row.caption) return null;

  return {
    headline: String(row.headline),
    caption: String(row.caption),
  };
}

async function setCachedCaption(
  productId: number,
  style: string,
  result: CaptionResult
): Promise<void> {
  const payload = {
    product_id: productId,
    style,
    headline: result.headline,
    caption: result.caption,
    created_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("caption_cache" as any)
    .upsert(payload as any, { onConflict: "product_id,style" } as any);

  if (error) {
    log.warn?.("Failed to upsert caption_cache", {
      error: (error as any).message,
    });
  }
}

// ---------- OpenAI ----------
const OPENAI_MODEL = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? "";

if (!OPENAI_API_KEY) {
  log.warn?.(
    "OPENAI_API_KEY is empty. Caption generation will fail at runtime."
  );
}

function fallbackFrom(product: Product, style: string): CaptionResult {
  const safeName = product?.name ?? "Dogonauts Produkt";
  const headline = `Neues ${style} Highlight: ${safeName}`;
  const caption = `Entdecke ${safeName} – kuratiert im Stil „${style}“. #dogonauts`;
  return { headline, caption };
}

async function callOpenAIJSON(
  system: string,
  user: string,
  product: Product,
  style: string
): Promise<CaptionResult> {
  // 💡 Instrucciones explícitas para JSON (para response_format=json_object)
  const systemWithJson = `${system}\n\nRespondes SIEMPRE en formato json. Devuelves únicamente un objeto json válido, sin texto extra fuera del json.`;
  const userWithJson = `${user}\n\nDevuelve únicamente un objeto json con las claves "headline" y "caption". No añadas explicaciones ni texto fuera del json.`;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages: [
        { role: "system", content: systemWithJson },
        { role: "user", content: userWithJson },
      ],
      temperature: 0.85,
      response_format: { type: "json_object" },
      max_tokens: 500,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`OpenAI ${res.status} ${res.statusText}: ${text}`);
  }

  const json: any = await res.json();
  const content = json?.choices?.[0]?.message?.content;

  // content puede ser string con JSON o un objeto
  let parsed: any;
  try {
    parsed = typeof content === "string" ? JSON.parse(content) : content;
  } catch {
    log.warn?.(
      "OpenAI returned non-JSON despite json_object; using fallback",
      { content }
    );
    return fallbackFrom(product, style);
  }

  // Normalizar campos
  let headline = String(parsed?.headline ?? parsed?.title ?? "").trim();
  let caption = String(
    parsed?.caption ?? parsed?.text ?? parsed?.body ?? ""
  ).trim();

  if (!headline && !caption) {
    log.warn?.("GPT response missing headline/caption, using fallback", {
      parsed,
    });
    return fallbackFrom(product, style);
  }

  if (!headline) headline = "Dogonauts Post";
  if (!caption) caption = headline;

  return { headline, caption };
}

// ---------- API principal ----------
export async function generate(
  product: Product,
  style: string
): Promise<CaptionResult> {
  const t0 = Date.now();

  // 1) Cache
  if (process.env.DISABLE_CACHE !== "true") {
    const cached = await getCachedCaption(product.id, style);
    if (cached) {
      log.info?.("📦 Cache hit", { product_id: product.id, style });
      return cached;
    }
  }

  // 2) Prompt
  const prompt: any = buildFinalPrompt(product as any, style);

  // 3) OpenAI
  const result = await callOpenAIJSON(
    String(prompt.system ?? ""),
    String(prompt.user ?? ""),
    product,
    style
  );

  // 4) Métricas
  log.info?.("✨ Caption generated", {
    product_id: product.id,
    style,
    duration_ms: Date.now() - t0,
    model: OPENAI_MODEL,
  });

  // 5) Cache (best-effort)
  if (process.env.DISABLE_CACHE !== "true") {
    try {
      await setCachedCaption(product.id, style, result);
    } catch (e: any) {
      log.warn?.("Failed to cache caption (non-critical)", {
        product_id: product.id,
        style,
        error: e?.message,
      });
    }
  }

  return result;
}

export async function generateBatch(
  products: Product[],
  styles: string[]
): Promise<Map<string, CaptionResult>> {
  const results = new Map<string, CaptionResult>();

  for (const product of products) {
    for (const style of styles) {
      const key = `${product.id}-${style}`;
      try {
        const caption = await generate(product, style);
        results.set(key, caption);
        // suaviza el rate
        await new Promise((r) => setTimeout(r, 100));
      } catch (e: any) {
        log.error?.("Failed to generate caption in batch", {
          product_id: product.id,
          style,
          error: e?.message,
        });
      }
    }
  }
  return results;
}

// ---------- Exports de compatibilidad con el worker ----------
export async function generateCaption(product: Product, style: string) {
  return generate(product, style);
}

export async function processCaptionJob(job: { product: Product; style: string }) {
  const res = await generate(job.product, job.style);
  return { ok: true, result: res };
}

export const captionEngine = { generate, generateBatch };
