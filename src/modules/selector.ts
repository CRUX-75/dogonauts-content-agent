// src/modules/selector.ts (CORREGIDO)

import { db } from '../core/db.js'; // 💡 Corrección 1: Se eliminó 'transaction' de la importación si no es usado.
// Asumimos que 'transaction' se usa en el mismo archivo 'db.js', o no es necesario aquí.
import { config } from '../utils/config.js';
import { logger } from '../utils/logger.js';

// Define la estructura del producto que esperamos de la DB
interface Product {
    id: number;
    handle: string;
    name: string;
    perf_score: number | null; // Puntuación de rendimiento (e.g., likes/post)
    posts_count: number;       // Número total de posts para este producto
    image_url: string;
}

/**
 * Selecciona un producto usando la estrategia Epsilon-Greedy.
 * @returns {Promise<Product | null>} El producto seleccionado o null si no hay productos.
 */
export async function selectProduct(): Promise<Product | null> {
    // 💡 Corrección 2: Asumimos que la propiedad se llama ahora 'EXPLORATION_RATE'
    // Deberás corregir el tipo en src/utils/config.ts para que incluya EPSILON_EXPLORATION_RATE.
    const EPSILON = (config as any).EPSILON_EXPLORATION_RATE || 0.1; // 10% de exploración

    // 1. Obtener todos los productos y su rendimiento actual
    const products = db.prepare(`
        SELECT id, handle, name, perf_score, posts_count, image_url 
        FROM products 
        ORDER BY id ASC
    `).all() as Product[];

    if (products.length === 0) {
        // 💡 Corrección 3: Usamos (logger as any).warn para evitar el error TS
        (logger as any).warn({ event: 'selector.no_products' }, 'No hay productos en la base de datos para seleccionar.'); 
        return null;
    }

    // 2. Decisión de Epsilon-Greedy
    const decision = Math.random();

    if (decision < EPSILON) {
        // EXPLORACIÓN (Elegir producto al azar)
        const randomIndex = Math.floor(Math.random() * products.length);
        const selected = products[randomIndex];
        logger.info({ 
            event: 'selector.explore', 
            product_id: selected.id 
        }, `Explorando (Epsilon=${EPSILON}): Producto ID ${selected.id}`);
        return selected;

    } else {
        // EXPLOTACIÓN (Elegir el mejor producto basado en perf_score)
        
        // Elige el producto con la puntuación de rendimiento más alta.
        const bestProduct = products.reduce((best, current) => {
            // Si el score es null, trata como -1 para priorizar productos con datos
            const bestScore = best.perf_score ?? -1; 
            const currentScore = current.perf_score ?? -1;

            // Desempate: Si los scores son iguales, elige el que tiene menos posts (explora implícitamente)
            if (currentScore > bestScore) {
                return current;
            } else if (currentScore === bestScore && current.posts_count < best.posts_count) {
                 return current;
            }
            return best;
        }, products[0]);

        logger.info({ 
            event: 'selector.exploit', 
            product_id: bestProduct.id,
            score: bestProduct.perf_score 
        }, `Explotando: Producto ID ${bestProduct.id} (Score: ${bestProduct.perf_score?.toFixed(2) ?? 'N/A'})`);
        
        return bestProduct;
    }
}