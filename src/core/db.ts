// src/core/db.ts
// Stub temporal: antes esto era una DB local con better-sqlite3.
// Ahora usamos Supabase/N8N, pero hay código antiguo que sigue importando { db }.
// Este stub existe solo para que TypeScript compile. Si se usa en runtime lanzará error.

type LegacyQueryArgs = Record<string, unknown>;

export const db = {
  // Si alguna parte del código antiguo intenta usar db, preferimos
  // petar con un mensaje claro antes que hacer algo silencioso.
  query(_sql: string, _params?: LegacyQueryArgs) {
    throw new Error(
      '[LEGACY DB] db.query() fue llamado pero la base de datos SQLite ha sido eliminada. ' +
      'Migra esta lógica a Supabase/N8N.'
    );
  },
} as any;
