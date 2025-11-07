// src/utils/test-job-creator.ts
import { db } from '../core/db.js';
import { createJob } from '../modules/job-creator.js';

async function main() {
  try {
    // Creamos un job de prueba
    const jobId = createJob({
      product_id: 999,
      style: 'style',
      preset: '1080x1080',
      payload: { source: 'test_script' }
    });

    console.log('✅ Job creado:', jobId);

    // Verificamos en la DB
    const job = db.prepare('SELECT * FROM job_queue WHERE id = ?').get(jobId);
    console.log('🟣 Último registro en job_queue:', job);
  } catch (err) {
    console.error('❌ Error en el test:', err);
    process.exit(1);
  }
}

main();
