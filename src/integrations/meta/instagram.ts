// src/integrations/meta/instagram.ts
import fetch from "node-fetch";

const IG_ACCOUNT_ID = process.env.META_IG_BUSINESS_ACCOUNT_ID!;
const PAGE_ACCESS_TOKEN = process.env.META_PAGE_ACCESS_TOKEN!;

type PublishParams = {
  image_url: string;
  caption: string;
};

export async function postImageToInstagram(params: PublishParams) {
  if (!IG_ACCOUNT_ID || !PAGE_ACCESS_TOKEN) {
    throw new Error("META_IG_BUSINESS_ACCOUNT_ID o META_PAGE_ACCESS_TOKEN faltan.");
  }

  // 1) Crear contenedor
  const createRes = await fetch(
    `https://graph.facebook.com/v21.0/${IG_ACCOUNT_ID}/media?access_token=${PAGE_ACCESS_TOKEN}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        image_url: params.image_url,
        caption: params.caption ?? "",
      }),
    }
  );

  const createJson: any = await createRes.json();
  if (!createRes.ok) {
    const code = createJson?.error?.code;
    const message = createJson?.error?.message;
    const err: any = new Error(message || "IG /media error");
    err.code = code;
    err.response = { data: { error: createJson?.error } };
    throw err;
  }

  const creation_id = createJson.id;

  // 2) Publicar
  const publishRes = await fetch(
    `https://graph.facebook.com/v21.0/${IG_ACCOUNT_ID}/media_publish?access_token=${PAGE_ACCESS_TOKEN}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ creation_id }),
    }
  );

  const publishJson: any = await publishRes.json();
  if (!publishRes.ok) {
    const code = publishJson?.error?.code;
    const message = publishJson?.error?.message;
    const err: any = new Error(message || "IG /media_publish error");
    err.code = code;
    err.response = { data: { error: publishJson?.error } };
    throw err;
  }

  // 3) (Opcional) obtener permalink
  let permalink: string | null = null;
  try {
    const mediaId = publishJson.id;
    const mediaRes = await fetch(
      `https://graph.facebook.com/v21.0/${mediaId}?fields=permalink&access_token=${PAGE_ACCESS_TOKEN}`
    );
    const mediaJson: any = await mediaRes.json();
    permalink = mediaJson?.permalink ?? null;
  } catch {
    // ignore
  }

  return { id: publishJson.id, media_id: publishJson.id, permalink };
}
