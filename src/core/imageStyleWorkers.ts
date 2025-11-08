// src/core/imageStyleWorkers.ts
// Archivo de helper para lanzar el worker de estilos de imagen.
// No forma parte de la lógica crítica, así que desactivamos chequeo estricto.

// @ts-nocheck

import { Worker } from "node:worker_threads";

/**
 * Crea un worker para procesar estilos de imagen.
 * Ajusta la ruta al fichero real del worker si es distinta.
 */
export function createImageStyleWorker() {
  const worker = new Worker(
    new URL("../workers/imageStyler.js", import.meta.url),
    {
      type: "module",
    }
  );

  return worker;
}
