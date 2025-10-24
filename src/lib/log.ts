// src/lib/log.ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let supabase: SupabaseClient | null = null;

function getSupabase(): SupabaseClient | null {
  if (supabase) return supabase;

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey =
    process.env.SUPABASE_SERVICE ||
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('[logger] Missing SUPABASE_URL or service key env');
    return null; // <-- no crashea; el logger pasa a no-op
  }

  supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false },
  });
  return supabase;
}

function toJSONSafe(value: unknown, maxLen = 10_000) {
  const seen = new WeakSet();
  return JSON.parse(JSON.stringify(value, (_k, v) => {
    if (typeof v === 'bigint') return v.toString();
    if (typeof v === 'function') return undefined;
    if (typeof v === 'object' && v !== null) {
      if (seen.has(v as object)) return '[Circular]';
      seen.add(v as object);
    }
    if (typeof v === 'string' && v.length > maxLen) {
      return v.slice(0, maxLen) + `…[+${v.length - maxLen}]`;
    }
    return v;
  }));
}

export type LogLevel = 'debug'|'info'|'warn'|'error';

export async function log(level: LogLevel, message: string, context?: any, err?: unknown) {
  try {
    const client = getSupabase(); // <-- se crea aquí, no en import

    const safeContext: any = context ? toJSONSafe(context) : undefined;
    let stack: string | undefined;
    let merged: any = safeContext ?? {};

    if (err instanceof Error) {
      stack = err.stack;
      merged = { ...merged, error: { name: err.name, message: err.message } };
      const anyErr: any = err as any;
      if (anyErr.response) {
        merged.meta = {
          status: anyErr.response.status,
          statusText: anyErr.response.statusText,
          data: typeof anyErr.response.data === 'string'
            ? anyErr.response.data.slice(0, 500)
            : toJSONSafe(anyErr.response.data, 2000),
        };
      }
      if (anyErr.config) {
        merged.request = {
          url: anyErr.config.url,
          method: anyErr.config.method,
          baseURL: anyErr.config.baseURL,
          timeout: anyErr.config.timeout,
        };
      }
    } else if (err) {
      merged = { ...merged, error: toJSONSafe(err) };
    }

    if (stack) merged.stack = stack;

    if (!client) {
      console.warn('[logger] Supabase client not available, skipping DB insert', { level, message });
      return;
    }

    const { error } = await client.from('logs').insert({
      level,
      message,
      meta: merged ?? null, // tu tabla usa 'meta'
    });

    if (error) console.error('[logs.insert failed]', error);
  } catch (e) {
    console.error('[logger crashed]', e);
  }
}
