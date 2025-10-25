// src/tools/meta.ts
// Refactorizado para usar el logger centralizado (log.ts)

import { isPaused, reportMetaResult } from "../services/circuit.js";
import { log } from "../lib/log.js"; // <--- IMPORTANTE: Nuevo logger

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------- Config reintentos desde .env ----------
const MAX_RETRIES = Number(process.env.MAX_RETRIES || 3);
const RETRY_BASE_MS = Number(process.env.RETRY_BASE_MS || 300);
const RETRY_MAX_MS = Number(process.env.RETRY_MAX_MS || 5000);

// ---------- Backoff con jitter (Mejorado con logging) ----------
async function withRetry<T>(
  fn: () => Promise<T>,
  fnName: string, // <-- Nombre de la función para logs
  opts = {
    retries: MAX_RETRIES,
    baseMs: RETRY_BASE_MS,
    maxMs: RETRY_MAX_MS,
    jitter: true,
    // onRetry ahora es async y usa nuestro logger
    onRetry: async (err: any, attempt: number, delay: number) => {
      const msg = `[Retry] ${fnName} attempt=${attempt} delay=${delay}ms err=${
        err?.message || String(err)
      }`;
      console.warn(msg); // Log de consola inmediato
      await log(
        "warn",
        `[Retry] ${fnName} failed, retrying...`,
        {
          fnName,
          attempt,
          delay,
        },
        err
      );
    },
  }
): Promise<T> {
  let lastErr: any;
  for (let attempt = 0; attempt <= opts.retries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastErr = err;
      if (attempt === opts.retries) break;
      const exp = Math.min(opts.baseMs * 2 ** attempt, opts.maxMs);
      const delay = opts.jitter ? Math.round(exp * (0.5 + Math.random())) : exp;
      // Await al onRetry por si es async (como el nuestro)
      await opts.onRetry?.(err, attempt + 1, delay);
      await sleep(delay);
    }
  }
  throw lastErr;
}

// ---------- Helpers Graph API (Mejorado con errores estructurados) ----------
async function graphPost(path: string, body: any, token: string) {
  const url = new URL(`https://graph.facebook.com/v24.0${path}`);
  url.searchParams.set("access_token", token);

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const json = await res.json().catch(() => ({})); // 'json' es el response.data

  if (!res.ok) {
    // Creamos un error que imita la estructura de AxiosError
    // para que nuestro logger 'log.ts' lo parsee correctamente.
    const code = (json as any)?.error?.code ?? res.status;
    const msg = (json as any)?.error?.message ?? `Graph API Error`;

    const err: any = new Error(
      `Graph ${path} ${res.status} code=${code}: ${msg}`
    );
    err.code = code;
    // Esto es lo que 'log.ts' buscará en 'anyErr.response'
    err.response = {
      status: res.status,
      statusText: res.statusText,
      data: json, // El payload de error completo de Meta
    };
    // Esto es lo que 'log.ts' buscará en 'anyErr.config'
    err.config = {
      url: url.toString(),
      method: "POST",
    };
    throw err;
  }
  return json;
}

// ---------- Implementaciones "once" (Sin cambios) ----------
async function publishInstagramOnce(imageUrls: string[], caption: string) {
  const ig = process.env.IG_ACCOUNT_ID!;
  const token = process.env.META_ACCESS_TOKEN!;
  if (!ig || !token) throw new Error("Missing IG_ACCOUNT_ID or META_ACCESS_TOKEN");

  if (imageUrls.length <= 1) {
    const c = await graphPost(`/${ig}/media`, { image_url: imageUrls[0], caption }, token);
    
    // --- ¡SOLUCIÓN! ---
    // Añadimos una pausa de 5 segundos para que Meta procese la imagen
    // antes de intentar publicarla.
    await sleep(5000); 
    // --- FIN SOLUCIÓN ---

    const p = await graphPost(`/${ig}/media_publish`, { creation_id: c.id }, token);
    return { creation_id: c.id, media_id: p.id };
  }

  const children: string[] = [];
  for (const url of imageUrls) {
    const ch = await graphPost(`/${ig}/media`, { image_url: url, is_carousel_item: true }, token);
    children.push(ch.id);
    await sleep(30); // pequeño respiro por rate limiting
  }
  const c = await graphPost(`/${ig}/media`, { media_type: "CAROUSEL", caption, children }, token);

  // --- ¡SOLUCIÓN! ---
  // Añadimos también la pausa para los carruseles.
  await sleep(5000);
  // --- FIN SOLUCIÓN ---

  const p = await graphPost(`/${ig}/media_publish`, { creation_id: c.id }, token);
  return { creation_id: c.id, media_id: p.id };
}

async function publishFacebookOnce(imageUrls: string[], caption: string) {
  const page = process.env.FB_PAGE_ID!;
  const token = process.env.META_ACCESS_TOKEN!;
  if (!page || !token) throw new Error("Missing FB_PAGE_ID or META_ACCESS_TOKEN");

  // --- PRUEBA /feed ---
  // Esta era la prueba pendiente del informe. Publica un texto simple.
  // Si esto falla, el problema es el token/página. Si funciona, el problema es /photos.
  if (process.env.FB_TEST_MODE === "FEED") {
    console.warn("[FB_TEST_MODE=FEED] Intentando publicar en /feed");
    await log('warn', 'FB_TEST_MODE=FEED activado', { caption });
    const r = await graphPost(`/${page}/feed`, { message: `Test post: ${caption}` }, token);
    return { post_ids: [r.id] };
  }
  // --- FIN PRUEBA /feed ---

  const ids: string[] = [];
  for (const url of imageUrls) {
    // Publica en /photos como estaba previsto
    const r = await graphPost(`/${page}/photos`, { url, caption, published: true }, token);
    ids.push(r.post_id);
    await sleep(50);
  }
  return { post_ids: ids };
}

// ---------- API pública (Refactorizada con logging) ----------
export async function publishInstagram(imageUrls: string[], caption: string) {
  if (await isPaused("IG")) {
    await log("info", "IG publish skipped (circuit paused)");
    return { status: "SKIPPED_CIRCUIT_PAUSED" };
  }
  try {
    const out = await withRetry(
      () => publishInstagramOnce(imageUrls, caption),
      "publishInstagramOnce" // Pasa el nombre para logs
    );
    await reportMetaResult("IG", true);
    await log("info", "IG publish success", { media_id: out.media_id, images: imageUrls.length });
    return out;
  } catch (e) {
    await reportMetaResult("IG", false);
    // Loguea el error antes de relanzarlo
    await log("error", "IG publish failed", { images: imageUrls.length }, e);
    throw e; // Relanza para que el llamador sepa que falló
  }
}

export async function publishFacebook(imageUrls: string[], caption: string) {
  if (await isPaused("FB")) {
    await log("info", "FB publish skipped (circuit paused)");
    return { status: "SKIPPED_CIRCUIT_PAUSED" };
  }
  try {
    const out = await withRetry(
      () => publishFacebookOnce(imageUrls, caption),
      "publishFacebookOnce" // Pasa el nombre para logs
    );
    await reportMetaResult("FB", true);
    await log("info", "FB publish success", { post_ids: out.post_ids, images: imageUrls.length });
    return out;
  } catch (e) {
    await reportMetaResult("FB", false);
    
    // --- ¡¡LA SOLUCIÓN!! ---
    // Logueamos el error de Facebook saneado.
    await log("error", "FB publish failed", { images: imageUrls.length }, e);
    
    // Como decidimos abandonar FB, no relanzamos el error.
    return { status: "FAILED", error: (e as Error).message };
    // throw e; // Descomentar si prefieres que falle todo el batch
  }
}
