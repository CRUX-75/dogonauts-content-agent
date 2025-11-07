// src/scripts/cleanup-assets.ts
import { readdir, stat, unlink, existsSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { config } from '../src/utils/config.js';
import { logger } from '../src/utils/logger.js';

const readdirAsync = promisify(readdir);
const statAsync = promisify(stat);
const unlinkAsync = promisify(unlink);


/**
 * Borra de forma recursiva los assets (imágenes, etc.) cuya fecha de modificación
 * sea anterior al período de retención especificado.
 * * @param retentionDays Días a retener (ej. 90).
 * @returns {Promise<number>} El número total de archivos eliminados.
 */
export async function cleanupAssets(retentionDays: number): Promise<number> {
    const assetsPath = config.ASSETS_PATH;
    
    if (!existsSync(assetsPath)) {
        logger.warn({ event: 'cleanup.path_missing', path: assetsPath }, 'Ruta de assets no existe. Saltando limpieza.');
        return 0;
    }
    
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
    
    let deletedCount = 0;
    
    /**
     * Función recursiva asíncrona para escanear y borrar.
     */
    async function scanDir(dir: string): Promise<void> {
        try {
            const items = await readdirAsync(dir);
            
            await Promise.all(items.map(async (item) => {
                const fullPath = join(dir, item);
                
                try {
                    const stats = await statAsync(fullPath);
                    
                    if (stats.isDirectory()) {
                        await scanDir(fullPath); // Llamada recursiva
                    } else if (stats.isFile() && stats.mtime < cutoffDate) {
                        // Borrar archivo antiguo
                        await unlinkAsync(fullPath);
                        deletedCount++;
                        logger.info({ event: 'cleanup.file_deleted', file: item }, `Archivo antiguo eliminado: ${item}`);
                    }
                } catch (error) {
                    // Manejar errores al acceder o borrar archivos individuales (e.g., permisos)
                    logger.warn({ event: 'cleanup.item_error', path: fullPath, error: String(error) }, `No se pudo procesar/borrar el ítem.`);
                }
            }));
        } catch (error) {
            // Manejar errores al leer el directorio principal
            logger.error({ event: 'cleanup.dir_read_error', path: dir, error: String(error) }, 'Fallo al leer directorio durante la limpieza.');
        }
    }

    logger.info({ event: 'cleanup.started', cutoff: cutoffDate.toISOString() }, `Iniciando limpieza. Borrando archivos anteriores a: ${cutoffDate.toLocaleDateString()}`);

    await scanDir(assetsPath);
    
    return deletedCount;
}