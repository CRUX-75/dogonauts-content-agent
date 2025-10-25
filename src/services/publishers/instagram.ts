import fetch from 'node-fetch';
import { withRetry } from '../../core/retry.js';
import { createCircuit } from '../../core/circuit.js';

// --- Constantes de Configuración ---
const META_TOKEN = process.env.META_ACCESS_TOKEN!;
const IG_ACCOUNT_ID = process.env.IG_ACCOUNT_ID!;
const META_API_VERSION = 'v24.0';
const META_API_BASE_URL = 'https://graph.facebook.com';

// --- Definiciones de Tipo para la API de Meta ---
type MediaContainerResponse = {
  id: string; // Este es el creation_id
};

type MediaPublishResponse = {
  id: string; // Este es el media_id (el post final)
};
// ------------------------------------------------

const circuit = createCircuit({
  failureThreshold: 5,
  halfOpenAfterMs: 15000,
  onStateChange: (s) => console.log('[IG Circuit]', s),
});

/**
 * Gestiona una única publicación en Instagram (pasos 1 y 2).
 * Esta función está diseñada para fallar ruidosamente si la API falla,
 * permitiendo que 'withRetry' la capture.
 */
async function postToInstagramOnce(payload: { image_url: string; caption: string }) {
  const baseEndpoint = `${META_API_BASE_URL}/${META_API_VERSION}/${IG_ACCOUNT_ID}`;

  // 1) Crear contenedor de media
  const mediaUrl = new URL(`${baseEndpoint}/media`);
  mediaUrl.searchParams.append('image_url', payload.image_url);
  mediaUrl.searchParams.append('caption', payload.caption);
  mediaUrl.searchParams.append('access_token', META_TOKEN);

  let response = await fetch(mediaUrl.toString(), { method: 'POST' });
  if (!response.ok) {
    // Intenta parsear el error de Meta para más detalles
    const errorBody = await response.json().catch(() => response.text());
    throw new Error(
      `IG create media: ${response.status} ${
        response.statusText
      }. Response: ${JSON.stringify(errorBody)}`
    );
  }
  const { id: creationId } = (await response.json()) as MediaContainerResponse;

  // 2) Publicar el contenedor
  const publishUrl = new URL(`${baseEndpoint}/media_publish`);
  publishUrl.searchParams.append('creation_id', creationId);
  publishUrl.searchParams.append('access_token', META_TOKEN);

  response = await fetch(publishUrl.toString(), { method: 'POST' });
  if (!response.ok) {
    const errorBody = await response.json().catch(() => response.text());
    throw new Error(
      `IG publish: ${response.status} ${
        response.statusText
      }. Response: ${JSON.stringify(errorBody)}`
    );
  }
  const { id: mediaId } = (await response.json()) as MediaPublishResponse;

  // Devuelve el media_id para métricas
  return { platform: 'instagram', platform_media_id: mediaId };
}

/**
 * Wrapper seguro que aplica un Circuit Breaker y Reintentos
 * a la lógica de publicación de Instagram.
 */
export async function safePostToInstagram(payload: {
  image_url: string;
  caption: string;
}) {
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
        console.warn(
          `[IG Retry] attempt=${attempt} delay=${delay}ms err=${
            (err as Error).message
          }`
        ),
    })
  );
}