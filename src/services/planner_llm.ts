// src/services/planner_llm.ts
import OpenAI from "openai";

const client = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

export type PlannerInput = {
  season: "invierno"|"primavera"|"verano"|"otoño";
  networks: Array<"IG"|"FB">;
  maxItemsPerRun: number;
  balance: { IG:number; FB:number };
  seed: Array<{ id:string; name:string; season?:string|null; tags?:string[]|null }>;
};

export type PlanItem = {
  product_id: string;
  product_name: string;
  network: "IG"|"FB";
  templateStyle: "SEASONAL"|"UGC"|"NEW_IN_STORE";
  season?: PlannerInput["season"];
};

export type PlannerOutput = { items: PlanItem[]; rationale: string };

export async function callPlannerLLM(input: PlannerInput): Promise<PlannerOutput> {
  // Fallback sin OpenAI: reparte round-robin IG/FB y estilo por temporada
  if (!client) {
    const items: PlanItem[] = input.seed.slice(0, input.maxItemsPerRun).map((p, i) => ({
      product_id: p.id, product_name: p.name,
      network: input.networks[i % input.networks.length] ?? "IG",
      templateStyle: input.season ? "SEASONAL" : "NEW_IN_STORE",
      season: input.season
    }));
    return { items, rationale: "Fallback planner (no OPENAI_API_KEY)" };
  }

  const sys = "Eres un planner de contenidos. Devuelves JSON válido, no repites product_id.";
  const user = { input };
  const resp = await client.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.2,
    messages: [
      { role: "system", content: sys },
      { role: "user", content: JSON.stringify(user) }
    ],
    response_format: { type: "json_object" }
  });

  const json = JSON.parse(resp.choices[0].message.content || "{}");
  json.items = Array.isArray(json.items) ? json.items.slice(0, input.maxItemsPerRun) : [];
  return json as PlannerOutput;
}
