// src/lib/log.ts
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!; // usa service role aquí
export const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false },
});

// Quita ciclos, corta tamaños y convierte BigInt
function toJSONSafe(value: unknown, maxLen = 10_000) {
  const seen = new WeakSet();
  return JSON.parse(JSON.stringify(value, (_key, val) => {
    if (typeof val === 'bigint') return val.toString();
    if (typeof val === 'function') return undefined;
    if (typeof val === 'object' && val !== null) {
      if (seen.has(val as object)) return '[Circular]';
      seen.add(val as object);
    }
    // recortes de strings enormes (por si te llega HTML o binarios)
    if (typeof val === 'string' && val.length > maxLen) return val.slice(0, maxLen) + `…[+${val.length - maxLen}]`;
    return val;
  }));
}

export type LogLevel = 'debug'|'info'|'warn'|'error';

export async function log(level: LogLevel, message: string, context?: any, err?: unknown) {
  try {
    const safeContext: any = context ? toJSONSafe(context) : undefined;

    let stack: string | undefined;
    let merged: any = safeContext ?? {};
    if (err instanceof Error) {
      stack = err.stack;
      merged = { ...merged, error: { name: err.name, message: err.message } };
      // saca info útil si es AxiosError-like, sin meter request/response completos
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

    const { error } = await supabase.from('logs').insert({
      level,
      message,
      context: merged ?? null,
      stack: stack ?? null,
    });

    if (error) {
      // Fallback a consola si el insert falla por motivos de red/RLS
      // (evita perder señal)
      // eslint-disable-next-line no-console
      console.error('[logs.insert failed]', error);
    }
  } catch (e) {
    // Último fallback: nunca lanzar desde el logger
    // eslint-disable-next-line no-console
    console.error('[logger crashed]', e);
  }
}
