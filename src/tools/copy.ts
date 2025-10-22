// src/tools/copy.ts
import OpenAI from "openai";

let _client: OpenAI | null = null;

function getClient() {
  if (_client) return _client;

  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    throw new Error("Falta OPENAI_API_KEY en .env o no se ha cargado aún");
  }

  _client = new OpenAI({ apiKey: key });
  return _client;
}

export async function generateCaption(p: {
  product_name: string;
  product_category: string;
  main_benefit?: string;
  product_url: string;
  campaign_name?: string;
}) {
  const openai = getClient();

  const sys = "Eres copywriter para Instagram y Facebook de una marca premium de mascotas. Español neutro, claro, conciso, sin exceso de emojis.";

  const user = `Producto: ${p.product_name}
Categoría: ${p.product_category}
Beneficio: ${p.main_benefit || "salud y confort"}
Campaña: ${p.campaign_name || "regular"}
URL: ${p.product_url}

Escribe un caption de 3–4 líneas: 1) hook de beneficio, 2) uso/prueba, 3) CTA al link. Tono humano y premium.`;

  const r = await openai.chat.completions.create({
    model: "gpt-4.1-mini",
    messages: [
      { role: "system", content: sys },
      { role: "user", content: user },
    ],
    temperature: 0.7,
  });

  let cap = (r.choices[0].message.content || "").trim();

 // UTM final
const utm = `${p.product_url}?utm_source=instagram&utm_medium=organic&utm_campaign=${encodeURIComponent(p.campaign_name || "default")}`;

// Quita la URL "limpia" si quedó
cap = cap.replace(p.product_url, "");

// Quita conectores huérfanos justo antes de insertar la URL UTM
// ejemplos: "aquí:", "en el enlace.", "ver más:"
cap = cap
  .replace(/\b(aquí|aqui)\s*:?\s*$/i, "")
  .replace(/\b(en\s+el\s+enlace|ver\s+m[aá]s)\.?\s*$/i, "");

// Inserta solo la UTM en párrafo aparte
cap = `${cap.trim()}\n\n${utm}`;

// Limpieza final
cap = cap.replace(/\s{2,}/g, " ")
         .replace(/\n{3,}/g, "\n\n")
         .trim();

  return cap;
}
