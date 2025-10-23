// src/services/lock.ts
import { getSupabaseSafe } from './metrics.js'; // <-- Importa de metrics.ts

// Función para adquirir un lock (ej. 'cronjob')
export async function acquireLock(lockName: string, durationMinutes = 5) {
  const supabase = getSupabaseSafe();
  const expiresAt = new Date(Date.now() + durationMinutes * 60000).toISOString();

  // Intenta insertar el lock. Falla si ya existe (unique constraint).
  const { data, error } = await supabase
    .from('locks')
    .insert({ name: lockName, expires_at: expiresAt })
    .select()
    .single();

  if (error) {
    // Si el 'name' ya existe (unique constraint), el lock está tomado
    if (error.code === '23505') {
      return null; // No se pudo adquirir el lock
    }
    throw error;
  }
  return data; // Lock adquirido
}

// Función para liberar un lock
export async function releaseLock(lockName: string) {
  const supabase = getSupabaseSafe();
  const { error } = await supabase
    .from('locks')
    .delete()
    .eq('name', lockName);

  if (error) {
    console.error(`Error releasing lock ${lockName}:`, error.message);
    throw error;
  }
  return true;
}