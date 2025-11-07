import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

export function ensureDir(p: string) {
  const dir = path.extname(p) ? path.dirname(p) : p;
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

export async function writeBuffer(filePath: string, buf: Buffer) {
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  await fs.promises.writeFile(filePath, buf);
}

export function hashBuffer(buf: Buffer, algo: 'sha256' | 'md5' = 'sha256') {
  return createHash(algo).update(buf).digest('hex');
}
