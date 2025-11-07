// src/modules/caption.engine.ts
// Generación de captions con cache en Supabase (sin dependencias rotas)

import { supabase } from "../db/supabase";
import { logger } from "../utils/logger";
import { buildFinalPrompt } from "../prompts/brand-identity";

interface Product {
  id: number;
  name: string;
  description?: string;
  price: number;
  category?: string;
  brand?: string;
}

interface CaptionResult {
  headline: string;
  caption: string;
}

// ---------- Helpers de caché en Supabase ----------
async function getCachedCaption(productId: number, style: string): Promise<CaptionResult | null> {
  const { data, error } = await supabase
    .from("caption_cache")
    .select("headline, caption")
    .eq("product_id", productId)
    .eq("style", style)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    logger?.debug?.("caption_cache read failed", { error: error.message });
    return null;
  }
  if (!data) return null;
  return { headline: data.headline, caption: data.caption };
}

async function setCachedCaption(productId: number, style: string, result: CaptionResult): Promise<void> {
  // upsert por (product_id, style) si tienes una unique constraint; si no, insert simple
  const { error } = await supabase.from("caption_cache").upsert(
    {
      product_id: productId,
      style,
      headline: result.headline,
      caption: result.caption,
      created_at: new Date().toISOString(),
    },
    { onConflict: "product_id,style" }
  );
  if (error) throw error;
}

// ---------- Llamada directa a OpenAI ----------
const OPENAI_MODEL = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY!;

async function callOpenAIJSON(system: string, user: string): Promise<CaptionResult> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
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

  const json = (await res.json()) as any;
  const content = json?.choices?.[0]?.message?.content;
  if (!content) throw new Error("GPT returned empty content");

  let parsed: CaptionResult;
  try {
    parsed = JSON.parse(content);
  } catch (e) {
    throw new Error("Invalid JSON from GPT");
  }

  if (!parsed.headline || !parsed.caption) {
    throw new Error("GPT response missing required fields (headline, caption)");
  }
  return parsed;
}

// ============================================================================
// API principal
// ============================================================================
export async function generate(product: Product, style: string): Promise<CaptionResult> {
  const t0 = Date.now();

  // 1) Cache
  if (process.env.DISABLE_CACHE !== "true") {
    const cached = await getCachedCaption(product.id, style);
    if (cached) {
      logger?.info?.("📦 Cache hit", { product_id: product.id, style });
      return cached;
    }
  }

  // 2) Prompt
  const prompt = buildFinalPrompt(product, style); // debe devolver { system, user }

  // 3) OpenAI
  const result = await callOpenAIJSON(prompt.system, prompt.user);

  // 4) Métricas
  logger?.info?.("✨ Caption generated", {
    product_id: product.id,
    style,
    duration_ms: Date.now() - t0,
    model: OPENAI_MODEL,
  });

  // 5) Cache (best-effort)
  if (process.env.DISABLE_CACHE !== "true") {
    setCachedCaption(product.id, style, result).catch((e) =>
      logger?.warn?.("Failed to cache caption (non-critical)", {
        product_id: product.id,
        style,
        error: (e as Error).message,
      })
    );
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
        await new Promise((r) => setTimeout(r, 100)); // suaviza el rate
      } catch (e: any) {
        logger?.error?.("Failed to generate caption in batch", {
          product_id: product.id,
          style,
          error: e.message,
        });
      }
    }
  }
  return results;
}

export const captionEngine = { generate, generateBatch };
