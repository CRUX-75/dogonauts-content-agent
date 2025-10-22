// src/core/util.ts
import crypto from "node:crypto";

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function hash(s: string): string {
  return crypto.createHash("sha256").update(s).digest("hex");
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: { retries?: number; baseMs?: number; onError?: (e: any, i: number) => void } = {}
): Promise<T> {
  const { retries = 3, baseMs = 500, onError } = opts;
  let lastErr: any;

  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (e: any) {
      lastErr = e;
      onError?.(e, i);
      await sleep(baseMs * 2 ** i);
    }
  }

  throw lastErr;
}

