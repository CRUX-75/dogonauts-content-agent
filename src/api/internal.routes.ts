import { Router, Request, Response } from 'express';
// CORRECCIÓN 1: La ruta de importación de 'createJob' probablemente estaba mal.
import { createJob } from '../modules/job-creator'; 
import { logger } from '../utils/logger';

const router = Router();

// Middleware de seguridad
function validateInternalRequest(req: Request, res: Response, next: any) {
  const secret = req.headers['x-internal-secret'];

  if (secret !== process.env.INTERNAL_API_SECRET) {
    // CORRECCIÓN 2: El orden de los argumentos del logger estaba invertido.
    logger.warn(
      {
        ip: req.ip,
        headers: req.headers,
      },
      '⚠️  Unauthorized internal API call'
    );
    return res.status(403).json({ error: 'Forbidden' });
  }

  next();
}

// Endpoint para encolar trabajos
router.post(
  '/enqueue',
  validateInternalRequest,
  async (req: Request, res: Response) => {
    try {
      const { job_type = 'CREATE_POST' } = req.body;

      // CORRECCIÓN 3: El orden de los argumentos del logger estaba invertido.
      logger.info({ job_type }, '📥 Job enqueued from n8n');

      // Solo crear el job PENDING - el Worker lo procesará
      const job = await createJob(job_type, {
        triggered_by: 'n8n',
        scheduled_at: new Date().toISOString(),
      });

      res.json({
        success: true,
        job_id: job.id,
        message: 'Job enqueued successfully',
      });
    } catch (error: any) {
      // CORRECCIÓN 4: El orden de los argumentos del logger estaba invertido.
      logger.error({ error: error.message }, '❌ Failed to enqueue job');
      res.status(500).json({ error: error.message });
    }
  }
);

// Health check (sin autenticación)
router.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
});

export default router;