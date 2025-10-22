// src/services/captionRefiner.ts
import OpenAI from "openai";

let client: OpenAI | null = null;

// Solo inicializamos si existe la variable de entorno
if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.trim().length > 0) {
  client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

/**
 * Refina un caption base si hay una API Key disponible.
 * Si no, simplemente devuelve el texto original sin intentar conectarse.
 */
export async function refineWithOpenAI(base: string): Promise<string> {
  // si no hay cliente → devolvemos el texto tal cual
  if (!client) return base;

  try {
    const system = `Eres editor de social media. Mejora el texto manteniendo su estructura y claim.
No inventes datos ni cambies hashtags. Español neutro. 180–220 caracteres si es posible.`;

    const user = `Texto base:
${base}

Devuelve SOLO el texto final.`;

    const rsp = await client.responses.create({
      model: "gpt-4.1-mini",
      input: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });

    const out = (rsp.output?.[0]?.content?.[0] as any)?.text ?? "";
    return out.trim() || base;
  } catch (err: any) {
    console.warn("RefineWithOpenAI error:", err?.message || err);
    return base;
  }
}
