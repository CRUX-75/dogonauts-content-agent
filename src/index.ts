// src/index.ts
// Punto de entrada principal del Dogonauts Content Agent

import "dotenv/config";
import { startServer } from './api/server';
import { startWorker } from './workers/main.worker';
import { logger } from './utils/logger';
import { supabase } from './db/supabase';

// ============================================================================
// VALIDACIÓN DE CONFIGURACIÓN
// ============================================================================

function validateEnvironment() {
  const required = [
    'SUPABASE_URL',
    'SUPABASE_SERVICE_KEY',
    'OPENAI_API_KEY',
    'INTERNAL_API_SECRET',
  ];

  const missing = required.filter(key => !process.env[key]);

  if (missing.length > 0) {
    // CORRECCIÓN 1: Invertir argumentos del logger
    logger.error({ missing }, '❌ Missing required environment variables');
    process.exit(1);
  }

  logger.info('✅ Environment validation passed');
}

// ============================================================================
// VERIFICACIÓN DE CONEXIÓN A SUPABASE
// ============================================================================

async function checkDatabaseConnection() {
  try {
    const { data, error } = await supabase
      .from('products')
      .select('count')
      .limit(1);

    if (error) throw error;

    logger.info('✅ Database connection established');
    return true;
  } catch (error: any) {
    // CORRECCIÓN 2: Invertir argumentos del logger
    logger.error({ 
      error: error.message 
    }, '❌ Failed to connect to database');
    return false;
  }
}

// ============================================================================
// INICIALIZACIÓN
// ============================================================================

async function bootstrap() {
  // CORRECCIÓN 3: Invertir argumentos del logger
  logger.info({
    version: '1.1.0',
    node_version: process.version,
    environment: process.env.NODE_ENV || 'development',
  }, '🚀 Starting Dogonauts Content Agent...');

  // 1. Validar variables de entorno
  validateEnvironment();

  // 2. Verificar conexión a la base de datos
  const dbConnected = await checkDatabaseConnection();
  if (!dbConnected) {
    logger.error('Cannot start without database connection');
    process.exit(1);
  }

  // 3. Iniciar el servidor API (para endpoints de n8n)
  const port = parseInt(process.env.PORT || '3000', 10);
  await startServer(port);

  // 4. Iniciar el Worker (procesador de jobs)
  await startWorker();

  // CORRECCIÓN 4: Invertir argumentos del logger
  logger.info({
    api_port: port,
    worker_status: 'running',
  }, '✅ All systems operational');
}

// ============================================================================
// MANEJO DE SEÑALES DE SHUTDOWN
// ============================================================================

let isShuttingDown = false;

async function gracefulShutdown(signal: string) {
  if (isShuttingDown) {
    logger.warn('Shutdown already in progress...');
    return;
  }

  isShuttingDown = true;

  logger.info(`Received ${signal}, starting graceful shutdown...`);

  // Dar tiempo para que el worker termine el job actual
  setTimeout(() => {
    logger.info('Shutdown complete');
    process.exit(0);
  }, 5000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// ============================================================================
// MANEJO DE ERRORES NO CAPTURADOS
// ============================================================================

process.on('unhandledRejection', (reason, promise) => {
  // CORRECCIÓN 5: Invertir argumentos del logger
  logger.error({
    reason,
    promise,
  }, 'Unhandled Rejection');
});

process.on('uncaughtException', (error) => {
  // CORRECCIÓN 6: Invertir argumentos del logger
  logger.error({
    error: error.message,
    stack: error.stack,
  }, 'Uncaught Exception');

  // Salir después de un error crítico
  process.exit(1);
});

// ============================================================================
// INICIAR APLICACIÓN
// ============================================================================

bootstrap().catch((error) => {
  // CORRECCIÓN 7: Invertir argumentos del logger
  logger.error({
    error: error.message,
    stack: error.stack,
  }, 'Failed to bootstrap application');
  process.exit(1);
});