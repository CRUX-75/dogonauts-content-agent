// src/agent/styleSelection.ts
import { supabase } from "../db/supabase.js";

const DEFAULT_EPSILON_STYLE = Number(process.env.EPSILON_STYLE ?? "0.2");

const DEFAULT_STYLES = ["clean", "warm", "fun", "tech"] as const;
export type StyleName = (typeof DEFAULT_STYLES)[number];

export async function pickStyleWithEpsilonGreedy(
  channel: "IG" | "FB",
  epsilon: number = DEFAULT_EPSILON_STYLE
): Promise<StyleName> {
  const { data, error } = await supabase
    .from("style_performance" as any)
    .select("style, channel, perf_score")
    .eq("channel", channel);

  if (error) throw error;

  let styles: { style: StyleName; perf_score: number }[] = [];

  if (!data || data.length === 0) {
    // sin datos todavía → arrancamos con lista por defecto
    styles = DEFAULT_STYLES.map((s) => ({ style: s, perf_score: 0 }));
  } else {
    styles = (data as any[]).map((row) => ({
      style: row.style as StyleName,
      perf_score: Number(row.perf_score) || 0,
    }));
  }

  const r = Math.random();
  if (r < epsilon) {
    // EXPLORAR
    const idx = Math.floor(Math.random() * styles.length);
    const chosen = styles[idx];
    console.log("[STYLE] EXPLORE →", chosen.style);
    return chosen.style;
  }

  // EXPLOTAR
  const sorted = [...styles].sort(
    (a, b) => (b.perf_score ?? 0) - (a.perf_score ?? 0)
  );
  const bestScore = sorted[0]?.perf_score ?? 0;
  const topK = sorted.filter((s) => (s.perf_score ?? 0) === bestScore);

  const chosen =
    topK[Math.floor(Math.random() * topK.length)] ?? sorted[0];

  console.log("[STYLE] EXPLOIT →", chosen.style, "score=", chosen.perf_score);
  return chosen.style;
}
