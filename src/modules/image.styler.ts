// src/modules/image.styler.ts
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import { logger } from '../utils/logger.js';

const require = createRequire(import.meta.url);
const sharp = require('sharp');

/**
 * Procesa una imagen con Sharp aplicando ajustes y guardando el resultado.
 * @param inputPath Ruta al archivo de entrada.
 * @param outputPath Ruta de salida.
 * @param options Opciones de resize, formato, etc.
 */
export async function styleImage(
  inputPath: string,
  outputPath: string,
  options: {
    width?: number;
    height?: number;
    format?: 'jpeg' | 'png' | 'webp';
    quality?: number;
  } = {}
) {
  try {
    const { width, height, format = 'jpeg', quality = 85 } = options;

    await sharp(inputPath)
      .resize(width, height)
      .toFormat(format, { quality })
      .toFile(outputPath);

    logger.info({ outputPath }, 'Imagen procesada correctamente');
    return outputPath;
  } catch (err) {
    logger.error({ err }, 'Error procesando imagen con Sharp');
    throw err;
  }
}

/**
 * Asegura que la carpeta de salida exista.
 */
export function ensureOutputDir(filePath: string) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}
