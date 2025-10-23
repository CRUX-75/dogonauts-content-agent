import { getSupabaseSafe } from './supabase.js';

const KEY = "runbatch-lmv-1900";

export async function acquireLock(owner: string): Promise<boolean> {
  // limpia locks vencidos
  await supabase.rpc("delete_expired_job_locks").catch(() => {});
  const { error } = await supabase.from("job_locks").insert({
    key: KEY,
    owner,
    ttl_seconds: 900
  });
  return !error;
}

export async function releaseLock(owner: string): Promise<void> {
  await supabase.from("job_locks").delete().eq("key", "runbatch-lmv-1900").eq("owner", owner);
}
