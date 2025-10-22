// src/services/windows.ts
import { getSupabase } from "../tools/supabase.js";
import { nowPartsInTZ, minutesSinceMidnightInTZ } from "./time.js";

export type Net = "IG" | "FB";
export type WindowRow = {
  network: Net; tz: string; dow: number[];
  start_minute: number; end_minute: number; is_paused: boolean;
};

export async function fetchWindows(network: Net): Promise<WindowRow[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("publish_windows")
    .select("network,tz,dow,start_minute,end_minute,is_paused")
    .eq("network", network)
    .eq("is_paused", false);
  if (error) throw error;
  return (data || []) as WindowRow[];
}

export async function canPublishNow(network: Net) {
  const rows = await fetchWindows(network);
  if (!rows.length) return { ok:false, reason:"NO_WINDOWS_DEFINED", matches:[] as WindowRow[] };

  const matches: WindowRow[] = [];
  for (const w of rows) {
    const { weekday } = nowPartsInTZ(w.tz);
    const m = minutesSinceMidnightInTZ(w.tz);
    if (w.dow.includes(weekday) && m >= w.start_minute && m < w.end_minute) {
      matches.push(w);
    }
  }
  return { ok: matches.length>0, reason: matches.length ? "IN_WINDOW" : "OUT_OF_WINDOW", matches };
}

export async function explainWindows(network: Net) {
  const rows = await fetchWindows(network);
  return rows.map(w => {
    const h1 = String(Math.floor(w.start_minute/60)).padStart(2,"0");
    const m1 = String(w.start_minute%60).padStart(2,"0");
    const h2 = String(Math.floor(w.end_minute/60)).padStart(2,"0");
    const m2 = String(w.end_minute%60).padStart(2,"0");
    return `${w.network} @ ${w.tz} DOW=${w.dow.join(",")} ${h1}:${m1}-${h2}:${m2}`;
  });
}
