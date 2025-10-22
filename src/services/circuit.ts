// src/services/circuit.ts
import { getSupabase } from "../tools/supabase.js";
type Net = "IG" | "FB";
const KEY = (n:Net) => `breaker_${n}`;

export async function isPaused(network: Net) {
  const supabase = getSupabase();
  const { data } = await supabase.from("system_state")
    .select("value").eq("key", KEY(network)).maybeSingle();
  const until = data?.value?.paused_until ? Date.parse(data.value.paused_until) : 0;
  return Date.now() < until;
}

export async function reportMetaResult(network: Net, ok: boolean) {
  const supabase = getSupabase();
  const { data } = await supabase.from("system_state")
    .select("value").eq("key", KEY(network)).maybeSingle();
  const state = data?.value ?? { fails: 0, paused_until: null };

  if (ok) {
    state.fails = 0; state.paused_until = null;
  } else {
    state.fails = (state.fails || 0) + 1;
    if (state.fails >= 3) {
      const mins = 15 * Math.pow(2, state.fails - 3); // 15m, 30m, 60m...
      state.paused_until = new Date(Date.now() + mins*60*1000).toISOString();
    }
  }

  await supabase.from("system_state").upsert({
    key: KEY(network),
    value: state,
    updated_at: new Date().toISOString()
  }, { onConflict: "key" });
}
