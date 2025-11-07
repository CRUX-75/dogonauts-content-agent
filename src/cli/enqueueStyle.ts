// src/cli/enqueueStyle.ts
import { db } from '../core/db.js';
import { logger } from '../utils/logger.js';

// Tipo del payload que usamos para image.style
type ImageStylePayload = {
  handle: string;
};

// Encola un job 'image.style'
export function enqueueJob(payload: ImageStylePayload) {
  const insertStmt = db.prepare(`
    INSERT INTO job_queue (job_type, payload, status, created_at, updated_at)
    VALUES ('image.style', ?, 'pending', datetime('now'), datetime('now'))
  `);
  const info = insertStmt.run(JSON.stringify(payload));
  logger.info({ jobId: Number(info.lastInsertRowid), payload }, '🟣 Job encolado');
  return Number(info.lastInsertRowid);
}

// Worker mínimo: procesa un job pendiente y lo marca como completed
export async function runImageStyleWorker() {
  logger.info('🛠️ Iniciando worker image.style (una pasada)…');

  const getNext = db.prepare(`
    SELECT id, payload
    FROM job_queue
    WHERE job_type = 'image.style' AND status = 'pending'
    ORDER BY created_at ASC
    LIMIT 1
  `);

  const markStatus = db.prepare(`
    UPDATE job_queue
    SET status = ?, updated_at = datetime('now')
    WHERE id = ?
  `);

  const row = getNext.get() as { id: number; payload: string } | undefined;
  if (!row) {
    logger.info('✅ No hay jobs pendientes.');
    return;
  }

  const jobId = row.id;
  let payload: ImageStylePayload | null = null;

  try {
    payload = JSON.parse(row.payload) as ImageStylePayload;
  } catch {
    payload = null;
  }

  // marca en running
  markStatus.run('running', jobId);
  logger.info({ jobId, payload }, '▶️ Procesando job image.style');

  try {
    // 👉 Aquí iría TU lógica real de estilizado (pipeline, etc.)
    // await styleProductImageByHandle(payload.handle) …

    // demo: simulamos trabajo con una espera corta
    await new Promise((r) => setTimeout(r, 300));

    // marca completado
    markStatus.run('completed', jobId);
    logger.info({ jobId }, '✅ Job completado');
  } catch (error) {
    markStatus.run('failed', jobId);
    logger.error({ jobId, error: String(error) }, '❌ Job falló');
  }
}

// CLI rápido (opcional)
if (process.argv[1]?.endsWith('enqueueStyle.ts') || process.argv[1]?.endsWith('enqueueStyle.js')) {
  const mode = process.argv[2] ?? 'worker';
  if (mode === 'enqueue' && process.argv[3]) {
    enqueueJob({ handle: process.argv[3] });
  } else {
    runImageStyleWorker().catch((e) => {
      logger.error({ error: String(e) }, 'Worker error');
      process.exit(1);
    });
  }
}
