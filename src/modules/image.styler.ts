import sharp from "sharp";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { logger } from "../utils/logger.js";

// @ts-ignore - import.meta.url es válido en ESM, TS a veces se queja
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Stub para el worker: ajusta cuando tengas la implementación real
export async function processImageStyleJob(..._args: any[]): Promise<void> {
  // TODO: llamar a tu función real de procesado de imágenes
  return;
}
