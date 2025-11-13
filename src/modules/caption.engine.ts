// src/modules/caption.engine.ts
import { supabase } from "../db/supabase.js";
import { logger } from "../utils/logger.js";
import { openai } from "../llm/openai.js"; // <- sin extensión
import { z } from "zod";


const CaptionSchema = z.object({
  headline: z.string().min(3),
  caption: z.string().min(3),
});

type GenerateCaptionInput = {
  product: {
    id: number | string;
    product_name?: string | null;
    main_benefit?: string | null;
    kategorie?: string | null;
    hersteller?: string | null;
    verkaufspreis?: number | null;
  };
  style: string;
  channel: "IG" | "FB" | "BOTH";
};

export async function generateCaption(input: GenerateCaptionInput) {
  const { product, style, channel } = input;

  // 1) Intento de cache
  const { data: cached } = await supabase
    .from("caption_cache")
    .select("*")
    .eq("product_id", product.id)
    .eq("style", style)
    .limit(1)
    .maybeSingle();

  if (cached?.headline && cached?.caption) {
    return { headline: cached.headline, caption: cached.caption };
  }

  // 2) Prompt endurecido (palabra "json" explícita)
  const sys = `Eres un redactor para Instagram. Devuelve SOLO json válido con { "headline": string, "caption": string }.`;
  const usr = [
    `Canal: ${channel}`,
    `Estilo: ${style}`,
    `Producto: ${product.product_name ?? ""}`,
    `Beneficio principal: ${product.main_benefit ?? ""}`,
    `Categoría: ${product.kategorie ?? ""}`,
    `Marca: ${product.hersteller ?? ""}`,
    `Precio: ${product.verkaufspreis ?? ""}`,
    ``,
    `Requisitos:`,
    `- Responde en estricto formato json (json_object).`,
    `- headline: un gancho corto (máx. 60 caracteres).`,
    `- caption: 1–3 frases + 2–4 hashtags relevantes + CTA breve.`,
  ].join("\n");

  let modelJson: any | null = null;

  try {
    const resp = await openai.chat.completions.create({
      model: "gpt-4o-mini", // el que uses
      messages: [
        { role: "system", content: sys },
        { role: "user", content: usr },
      ],
      response_format: { type: "json_object" }, // <— CLAVE
      temperature: 0.6,
    });

    const raw = resp.choices?.[0]?.message?.content ?? "{}";
    modelJson = JSON.parse(raw);
  } catch (err) {
    logger.warn({ err }, "[caption.engine] json parse error; will fallback");
  }

  // 3) Validación estricta
  let headline = "";
  let caption = "";
  const parsed = CaptionSchema.safeParse(modelJson);
  if (parsed.success) {
    headline = parsed.data.headline.trim();
    caption = parsed.data.caption.trim();
  }

  // 4) Fallback si algo vino vacío
  if (!headline || !caption) {
    headline = product.product_name
      ? `Nuevo: ${product.product_name}`
      : "Descubre algo que te va a encantar";
    caption = `¿Listo para un upgrade? ${product.main_benefit ?? ""} 
${product.hersteller ? `Marca: ${product.hersteller}\n` : ""}#ofertas #descubre #wow #ecommerce`;
  }

  // 5) NO cachear si sigue vacío por cualquier motivo
  if (headline && caption) {
    const { error: upsertErr } = await supabase
      .from("caption_cache")
      .upsert(
        {
          product_id: Number(product.id),
          style,
          headline,
          caption,
        },
        { onConflict: "product_id,style" }
      );
    if (upsertErr) {
      logger.warn({ err: upsertErr }, "[caption.engine] caption_cache upsert warning");
    }
  }

  return { headline, caption };
}
