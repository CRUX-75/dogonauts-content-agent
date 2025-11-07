// src/http/index.ts (VERSION LIMPIA Y EXPORTABLE)
import 'dotenv/config';
import { logger } from '../utils/logger.js';
import { db } from '../core/db.js';

// Usaremos una implementación simple de Express aquí para el Health Check,
// asumiendo que Express sigue siendo una dependencia del proyecto
import express from 'express';

const app = express();
const PORT = process.env.PORT || 3000;

// La ruta de Health Check es la única que necesitamos
app.get('/health', (req, res) => {
    // Se puede hacer una verificación simple de la DB
    try {
        db.prepare('SELECT 1').get();
        res.status(200).send('Agent Running & DB OK');
    } catch (e) {
        logger.error('Health Check: DB FAILED');
        res.status(503).send('Agent Running, but DB Offline');
    }
});

/**
 * Inicia el servidor HTTP mínimo para el Health Check de Easypanel/Docker.
 * Solo se llama una vez en src/index.ts.
 */
export function startMinimalServer() {
    app.listen(PORT, () => {
        logger.info({ port: PORT }, '🚀 Minimal HTTP Server (Health Check) ready.');
    });
}