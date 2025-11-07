// src/modules/publisher.ts
import { logger } from '../utils/logger.js';
import { readFile } from 'node:fs/promises';

export async function publishToInstagram(caption: string, imagePath: string) {
  try {
    const buf = await readFile(imagePath);
    const imageFile = new File([buf], 'image.jpg', { type: 'image/jpeg' });

    const form = new FormData();
    form.append('caption', caption);
    form.append('image', imageFile);

    const res = await fetch(process.env.IG_ENDPOINT!, { method: 'POST', body: form });

    if (!res.ok) {
      const text = await res.text();
      logger.error({ status: res.status, text }, '❌ Publish failed');
      return null;
    }
    const data = await res.json();
    logger.info({ data }, '✅ Post publicado');
    return data;
  } catch (err) {
    logger.error({ err }, 'Error en publisher');
    return null;
  }
}
