import fetch from 'node-fetch';
import { withRetry } from '../../core/retry.js';
import { createCircuit } from '../../core/circuit.js';

const META_TOKEN = process.env.META_ACCESS_TOKEN!;
const IG_ACCOUNT_ID = process.env.IG_ACCOUNT_ID!;

// ---------- Definiciones de Tipo para la API de Meta ----------
type MediaContainerResponse = {
  id: string; // Este es el creation_id
};

type MediaPublishResponse = {
  id: string; // Este es el media_id (el post final)
};
// -----------------------------------------------------------

const circuit = createCircuit({
  failureThreshold: 5,
  halfOpenAfterMs: 15000,
  onStateChange: (s) => console.log('[IG Circuit]', s),
});

// Tu llamada “una vez” a Meta (crear media → publicar)
async function postToInstagramOnce(payload: { image_url: string; caption: string }) {
  // 1) Crear contenedor de media
  let url = `https://graph.facebook.com/v24.0/${IG_ACCOUNT_ID}/media?image_url=${encodeURIComponent(payload.image_url)}&caption=${encodeURIComponent(payload.caption)}&access_token=${META_TOKEN}`;
  let r = await fetch(url, { method: 'POST' });
  if (!r.ok) throw new Error(`IG create media: ${r.status} ${await r.text()}`);
  
  // --- FIX: Castear la respuesta JSON ---
  const { id: creationId } = await r.json() as MediaContainerResponse;

  // 2) Publicar
  url = `https://graph.facebook.com/v24.0/${IG_ACCOUNT_ID}/media_publish?creation_id=${creationId}&access_token=${META_TOKEN}`;
  r = await fetch(url, { method: 'POST' });
  if (!r.ok) throw new Error(`IG publish: ${r.status} ${await r.text()}`);

  // --- FIX: Castear la respuesta JSON ---
  const j = await r.json() as MediaPublishResponse;

  // Devuelve el media_id para métricas
  return { platform: 'instagram', platform_media_id: j.id };
}

// Wrapper seguro: circuit + retry
export async function safePostToInstagram(payload: { image_url: string; caption: string }) {
  const retries = Number(process.env.MAX_RETRIES || 3);
  const baseMs = Number(process.env.RETRY_BASE_MS || 300);
  const maxMs = Number(process.env.RETRY_MAX_MS || 5000);

  return circuit.exec(() =>
    withRetry(() => postToInstagramOnce(payload), {
      retries,
      baseMs,
      maxMs,
      jitter: true,
      onRetry: (err, attempt, delay) =>
        console.warn(`[IG Retry] attempt=${attempt} delay=${delay}ms err=${(err as Error).message}`),
    })
  );
}