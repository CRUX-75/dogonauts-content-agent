import { Worker } from 'node:worker_threads';

export function startImageStyleWorkers(numWorkers: number) {
  // ...
  const worker = new Worker(new URL('./imageStyler.js', import.meta.url), {
    // type: 'module' // 💡 CORREGIDO: Comentar/eliminar para resolver TS2353
  });
  // ...
}
// ...

// Punto único llamado por main.worker.ts
export async function processJob(msg: any) {
  // Acá invocas pipelines reales si los tienes
  // return await runPipeline(msg)
  return { ok: true, received: msg };
}
