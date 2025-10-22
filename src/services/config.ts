// src/services/config.ts
import { getSupabase } from "../tools/supabase.js";

export async function getCooldownDays(defaultDays = 14): Promise<number> {
  try {
    const sb = getSupabase();
    const { data, error } = await sb
      .from("system_state")
      .select("value")
      .eq("key", "cooldown_days")
      .maybeSingle();
    if (error) return defaultDays;

    const v = data?.value;
    // value puede ser texto '3' o jsonb 3; normalizamos
    const n = typeof v === "string" ? Number(v) : Number(v?.toString?.() ?? v);
    return Number.isFinite(n) && n > 0 ? n : defaultDays;
  } catch {
    return defaultDays;
  }
}
