// src/services/planner.ts
import { getSupabase } from "../tools/supabase.js";
import { callPlannerLLM, type PlannerInput, type PlannerOutput } from "./planner_llm.js";

export async function plannerLLM(season: PlannerInput["season"], networks: PlannerInput["networks"], maxItemsPerRun=2): Promise<PlannerOutput> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("products") // ajusta si tu tabla catálogo tiene otro nombre
    .select("id,name,created_at,season,tags,is_active")
    .eq("is_active", true)
    .limit(300);
  if (error) throw error;

  // pre-selección simple (novedad + match temporada)
  const seed = (data||[])
    .map(p => ({ ...p, _fresh: Date.now()-new Date(p.created_at).getTime() }))
    .sort((a,b) => {
      const sA = (String(a.season||"").toLowerCase()===season ? 1 : 0);
      const sB = (String(b.season||"").toLowerCase()===season ? 1 : 0);
      return (sB - sA) || (a._fresh - b._fresh); // prioriza temporada y más nuevos
    })
    .slice(0, 30)
    .map(p => ({ id:p.id, name:p.name, season:p.season, tags:p.tags }));

  const input: PlannerInput = { season, networks, maxItemsPerRun, balance:{IG:1,FB:1}, seed };
  return await callPlannerLLM(input);
}
