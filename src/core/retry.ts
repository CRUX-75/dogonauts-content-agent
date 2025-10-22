export type RetryOptions = {
  retries?: number; baseMs?: number; maxMs?: number; jitter?: boolean;
  onRetry?: (err: unknown, attempt: number, delayMs: number) => void;
};
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
export async function withRetry<T>(fn: () => Promise<T>, o: RetryOptions = {}) {
  const {retries=3, baseMs=300, maxMs=5000, jitter=true, onRetry} = o;
  let attempt = 0, last: unknown;
  while (attempt < retries) {
    try { return await fn(); } catch (e) {
      last = e; attempt++; if (attempt >= retries) break;
      let d = Math.min(baseMs * Math.pow(2, attempt-1), maxMs);
      if (jitter) d = Math.floor(d * (0.5 + Math.random()));
      onRetry?.(e, attempt, d); await sleep(d);
    }
  }
  throw last;
}
