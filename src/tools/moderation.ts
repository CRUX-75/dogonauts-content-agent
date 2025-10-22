// src/tools/moderation.ts
import OpenAI from "openai";

type Mode = "off" | "soft" | "hard";
// MODERATION_MODE=off  -> no evalúa, nunca bloquea
// MODERATION_MODE=soft -> evalúa; si hay error (401/timeout) NO bloquea. Solo bloquea si el modelo marca flagged.
// MODERATION_MODE=hard -> evalúa y BLOQUEA si el modelo marca flagged; si hay error de API, NO bloquea (soft-fail).
const MODE: Mode = (process.env.MODERATION_MODE as Mode) || "soft";

let client: OpenAI | null = null;
function getClient(): OpenAI | null {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) return null;
  if (!client) client = new OpenAI({ apiKey: key });
  return client;
}

export async function moderationGuard(text: string): Promise<void> {
  // Modo OFF: nunca bloquea
  if (MODE === "off") return;

  const cli = getClient();
  // Sin API Key: en soft/hard hacemos soft-fail (no bloquear)
  if (!cli) {
    console.warn("[moderation] No OPENAI_API_KEY; skipping (mode=" + MODE + ")");
    return;
  }

  try {
    // Usa el endpoint de moderación
    const res = await cli.moderations.create({
      model: "omni-moderation-latest",
      input: text,
    });

    const flagged = Boolean(res.results?.[0]?.flagged);
    if (flagged) {
      const cats = res.results?.[0]?.categories;
      const msg = "[moderation] Flagged by model";
      if (MODE === "hard") {
        const err: any = new Error(msg);
        err.categories = cats;
        throw err;
      } else {
        console.warn(msg, cats);
        return;
      }
    }
    // no flagged → OK
    return;
  } catch (e: any) {
    // Cualquier error (401 clave incorrecta, 429, tiempo, etc.) -> soft-fail
    console.warn("[moderation] Soft-fail:", e?.message || String(e));
    return; // NO bloquea
  }
}
