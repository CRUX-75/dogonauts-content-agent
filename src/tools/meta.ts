// src/tools/meta.ts
// Nota: Node 18+ tiene fetch global. Si usas Node <18, instala e importa node-fetch.
// Este archivo es ESM; mantén los sufijos .js en imports relativos.

import { isPaused, reportMetaResult } from "../services/circuit.js";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------- Config reintentos desde .env ----------
const MAX_RETRIES = Number(process.env.MAX_RETRIES || 3);
const RETRY_BASE_MS = Number(process.env.RETRY_BASE_MS || 300);
const RETRY_MAX_MS = Number(process.env.RETRY_MAX_MS || 5000);

// ---------- Backoff con jitter ----------
async function withRetry<T>(
  fn: () => Promise<T>,
  opts = {
    retries: MAX_RETRIES,
    baseMs: RETRY_BASE_MS,
    maxMs: RETRY_MAX_MS,
    jitter: true,
    onRetry: (err: any, attempt: number, delay: number) =>
      console.warn(`[Retry] attempt=${attempt} delay=${delay}ms err=${err?.message || String(err)}`),
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
      opts.onRetry?.(err, attempt + 1, delay);
      await sleep(delay);
    }
  }
  throw lastErr;
}

// ---------- Helpers Graph API ----------
async function graphPost(path: string, body: any, token: string) {
  const url = new URL(`https://graph.facebook.com/v24.0${path}`);
  url.searchParams.set("access_token", token);

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const code = (json as any)?.error?.code ?? res.status;
    const err: any = new Error(
      `Graph ${path} ${res.status} code=${code}: ${JSON.stringify(json)}`
    );
    err.code = code;
    throw err;
  }
  return json;
}

// ---------- Implementaciones "once" ----------
async function publishInstagramOnce(imageUrls: string[], caption: string) {
  const ig = process.env.IG_ACCOUNT_ID!;
  const token = process.env.META_ACCESS_TOKEN!;
  if (!ig || !token) throw new Error("Missing IG_ACCOUNT_ID or META_ACCESS_TOKEN");

  if (imageUrls.length <= 1) {
    const c = await graphPost(`/${ig}/media`, { image_url: imageUrls[0], caption }, token);
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
  const p = await graphPost(`/${ig}/media_publish`, { creation_id: c.id }, token);
  return { creation_id: c.id, media_id: p.id };
}

async function publishFacebookOnce(imageUrls: string[], caption: string) {
  const page = process.env.FB_PAGE_ID!;
  const token = process.env.META_ACCESS_TOKEN!;
  if (!page || !token) throw new Error("Missing FB_PAGE_ID or META_ACCESS_TOKEN");

  const ids: string[] = [];
  for (const url of imageUrls) {
    const r = await graphPost(`/${page}/photos`, { url, caption, published: true }, token);
    ids.push(r.post_id);
    await sleep(50);
  }
  return { post_ids: ids };
}

// ---------- API pública con circuito (pausa) + retry ----------
export async function publishInstagram(imageUrls: string[], caption: string) {
  if (await isPaused("IG")) return { status: "SKIPPED_CIRCUIT_PAUSED" };
  try {
    const out = await withRetry(() => publishInstagramOnce(imageUrls, caption));
    await reportMetaResult("IG", true);
    return out;
  } catch (e) {
    await reportMetaResult("IG", false);
    throw e;
  }
}

export async function publishFacebook(imageUrls: string[], caption: string) {
  if (await isPaused("FB")) return { status: "SKIPPED_CIRCUIT_PAUSED" };
  try {
    const out = await withRetry(() => publishFacebookOnce(imageUrls, caption));
    await reportMetaResult("FB", true);
    return out;
  } catch (e) {
    await reportMetaResult("FB", false);
    throw e;
  }
}
