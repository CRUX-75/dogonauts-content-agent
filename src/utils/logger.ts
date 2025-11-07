type Fields = Record<string, unknown>;

function fmt(level: string, msg: string, fields?: Fields) {
  const base = `[${new Date().toISOString()}] ${level.toUpperCase()}: ${msg}`;
  return fields ? `${base} ${JSON.stringify(fields)}` : base;
}

export const logger = {
  info(a: string | Fields, b?: string) {
    typeof a === 'string' ? console.log(fmt('info', a)) : console.log(fmt('info', b || '', a));
  },
  error(a: string | Fields, b?: string) {
    typeof a === 'string' ? console.error(fmt('error', a)) : console.error(fmt('error', b || '', a));
  },
  // 💡 Corrección: Añadimos la función 'warn' que faltaba.
  warn(a: string | Fields, b?: string) {
    typeof a === 'string' ? console.warn(fmt('warn', a)) : console.warn(fmt('warn', b || '', a));
  },
  debug(a: string | Fields, b?: string) {
    if (process.env.DEBUG !== '1') return;
    typeof a === 'string' ? console.debug(fmt('debug', a)) : console.debug(fmt('debug', b || '', a));
  }
};