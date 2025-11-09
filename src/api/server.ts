// ============================================================================
// src/api/server.ts
// Servidor Express con endpoints internos para n8n
// Versión ES Modules (sin require())
// ============================================================================

import express, { Request, Response, NextFunction } from 'express';
import { queries } from '../db/queries.js'; // ⚠️ Nota el .js
import { logger } from '../utils/logger.js';

const app = express();

// ============================================================================
// Middlewares
// ============================================================================

app.use(express.json());

// Logging middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  logger.info(`${req.method} ${req.path}`);
  next();
});

// CORS para desarrollo (ajustar en producción)
app.use((req: Request, res: Response, next: NextFunction) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Internal-Secret');
  
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  
  next();
});

// ============================================================================
// Middleware de Autenticación Interna
// ============================================================================

const INTERNAL_SECRET = process.env.INTERNAL_API_SECRET || '';

function validateInternalSecret(req: Request, res: Response, next: NextFunction) {
  const providedSecret = req.headers['x-internal-secret'] as string;
  
  if (!INTERNAL_SECRET) {
    logger.error('INTERNAL_API_SECRET no configurado en variables de entorno');
    return res.status(500).json({ 
      success: false, 
      error: 'Server misconfiguration' 
    });
  }
  
  if (providedSecret !== INTERNAL_SECRET) {
    logger.warn(`Intento de acceso no autorizado desde ${req.ip}`);
    return res.status(401).json({ 
      success: false, 
      error: 'Unauthorized' 
    });
  }
  
  next();
}

// ============================================================================
// Health Check Endpoint (público)
// ============================================================================

app.get('/health', async (req: Request, res: Response) => {
  try {
    // Verificar conexión a la base de datos
    const dbStatus = await queries.healthCheck();
    
    const healthStatus = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development',
      database: dbStatus ? 'connected' : 'disconnected',
      services: {
        openai: process.env.OPENAI_API_KEY ? 'configured' : 'missing',
        meta: process.env.META_ACCESS_TOKEN ? 'configured' : 'missing',
        supabase: process.env.SUPABASE_URL ? 'configured' : 'missing'
      }
    };
    
    res.json(healthStatus);
  } catch (error) {
    logger.error('Health check failed:', error);
    res.status(500).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// ============================================================================
// Metrics Endpoint (público, pero limitado)
// ============================================================================

app.get('/metrics', async (req: Request, res: Response) => {
  try {
    const metrics = await queries.getSystemMetrics();
    
    res.json({
      success: true,
      metrics: {
        jobs: {
          pending: metrics.pending_jobs || 0,
          running: metrics.running_jobs || 0,
          completed: metrics.completed_jobs || 0,
          failed: metrics.failed_jobs || 0
        },
        posts: {
          total: metrics.total_posts || 0,
          last_7_days: metrics.posts_last_7_days || 0
        },
        products: {
          total: metrics.total_products || 0,
          avg_perf_score: metrics.avg_perf_score || 0
        }
      }
    });
  } catch (error) {
    logger.error('Error fetching metrics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch metrics'
    });
  }
});

// ============================================================================
// Internal Endpoint: Enqueue Job (protegido)
// ============================================================================

interface EnqueueJobRequest {
  type: 'CREATE_POST' | 'FEEDBACK_LOOP' | 'AB_TEST';
  scheduled_by?: string;
  priority?: number;
  metadata?: Record<string, any>;
}

app.post('/internal/enqueue', validateInternalSecret, async (req: Request, res: Response) => {
  try {
    const { type, scheduled_by, priority, metadata }: EnqueueJobRequest = req.body;
    
    // Validaciones básicas
    if (!type) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: type'
      });
    }
    
    const validTypes = ['CREATE_POST', 'FEEDBACK_LOOP', 'AB_TEST'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({
        success: false,
        error: `Invalid job type. Must be one of: ${validTypes.join(', ')}`
      });
    }
    
    // Crear el job en la cola
    const job = await queries.createJob({
      type,
      status: 'PENDING',
      priority: priority || 0,
      scheduled_by: scheduled_by || 'api',
      metadata: metadata || {},
      created_at: new Date().toISOString()
    });
    
// ✅ CORRECTO (objeto, mensaje):
logger.info({
  type,
  scheduled_by,
  priority
}, `Job ${job.id} encolado exitosamente`);
    res.status(201).json({
      success: true,
      job_id: job.id,
      type: job.type,
      status: job.status,
      message: 'Job enqueued successfully'
    });
    
  } catch (error) {
    logger.error('Error enqueuing job:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to enqueue job'
    });
  }
});

// ============================================================================
// Internal Endpoint: Get Job Status (protegido)
// ============================================================================

app.get('/internal/jobs/:jobId', validateInternalSecret, async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;
    
    const job = await queries.getJobById(jobId);
    
    if (!job) {
      return res.status(404).json({
        success: false,
        error: 'Job not found'
      });
    }
    
    res.json({
      success: true,
      job
    });
    
  } catch (error) {
    logger.error('Error fetching job:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch job'
    });
  }
});

// ============================================================================
// Internal Endpoint: Cancel Job (protegido)
// ============================================================================

app.post('/internal/jobs/:jobId/cancel', validateInternalSecret, async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;
    
    const updated = await queries.updateJobStatus(jobId, 'FAILED', 'Cancelled by admin');
    
    if (!updated) {
      return res.status(404).json({
        success: false,
        error: 'Job not found or already completed'
      });
    }
    
    logger.info(`Job ${jobId} cancelado exitosamente`);
    
    res.json({
      success: true,
      message: 'Job cancelled successfully'
    });
    
  } catch (error) {
    logger.error('Error cancelling job:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to cancel job'
    });
  }
});

// ============================================================================
// 404 Handler
// ============================================================================

app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    path: req.path
  });
});

// ============================================================================
// Error Handler
// ============================================================================

app.use((error: Error, req: Request, res: Response, next: NextFunction) => {
  logger.error('Unhandled error:', error);
  
  res.status(500).json({
    success: false,
    error: process.env.NODE_ENV === 'production' 
      ? 'Internal server error' 
      : error.message
  });
});

// ============================================================================
// Start Server Function (exportada para usar en index.ts)
// ============================================================================

export function startServer(port: number = 3000): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      const server = app.listen(port, () => {
        logger.info(`🚀 API Server escuchando en puerto ${port}`);
        logger.info(`📍 Health check: http://localhost:${port}/health`);
        logger.info(`📊 Metrics: http://localhost:${port}/metrics`);
        resolve();
      });
      
      server.on('error', (error) => {
        logger.error('Error al iniciar servidor:', error);
        reject(error);
      });
      
      // Graceful shutdown
      process.on('SIGTERM', () => {
        logger.info('SIGTERM recibido, cerrando servidor...');
        server.close(() => {
          logger.info('Servidor cerrado exitosamente');
          process.exit(0);
        });
      });
      
      process.on('SIGINT', () => {
        logger.info('SIGINT recibido, cerrando servidor...');
        server.close(() => {
          logger.info('Servidor cerrado exitosamente');
          process.exit(0);
        });
      });
      
    } catch (error) {
      logger.error('Error fatal al iniciar servidor:', error);
      reject(error);
    }
  });
}

// ============================================================================
// Export app para testing
// ============================================================================

export { app };