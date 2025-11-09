type Fields = Record<string, unknown>;

function fmt(level: string, msg: string, fields?: Fields) {
  const base = `[${new Date().toISOString()}] ${level.toUpperCase()}: ${msg}`;
  return fields ? `${base} ${JSON.stringify(fields)}` : base;
}

export const logger = {
  info(a: string | Fields, b?: string) {
    if (typeof a === 'string') {
      console.log(fmt('info', a));
    } else {
      console.log(fmt('info', b || '', a));
    }
  },
  
  error(a: string | Fields, b?: string | unknown) {
    if (typeof a === 'string') {
      const errMsg = b instanceof Error ? b.message : String(b);
      console.error(fmt('error', a, b ? { error: errMsg } : undefined));
    } else {
      console.error(fmt('error', String(b) || '', a));
    }
  },
  
  warn(a: string | Fields, b?: string) {
    if (typeof a === 'string') {
      console.warn(fmt('warn', a));
    } else {
      console.warn(fmt('warn', b || '', a));
    }
  },
  
  debug(a: string | Fields, b?: string) {
    if (process.env.DEBUG !== '1') return;
    if (typeof a === 'string') {
      console.debug(fmt('debug', a));
    } else {
      console.debug(fmt('debug', b || '', a));
    }
  }
};