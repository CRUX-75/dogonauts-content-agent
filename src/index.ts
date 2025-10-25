// src/index.ts
// Punto de entrada principal del agente Dogonauts.

import express, { Request, Response } from "express";
import dotenv from "dotenv";
import { log } from "./lib/log.js"; // Asegúrate que la ruta sea correcta
import { runBatch } from "./agent.js";
import { getPostsToCollectMetrics } from "./tools/supabase.js"; // Se asume que getPostsToCollectMetrics está en tools/supabase.js
import { collectMetricsOnce } from "./services/metrics.js";

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;
app.use(express.json());

// --- RUTAS DE SALUD -------------------
const healthCheck = (_req: Request, res: Response) => {
  const env = {
    OPENAI_API_KEY: !!process.env.OPENAI_API_KEY,
    SUPABASE_URL: !!process.env.SUPABASE_URL,
    SUPABASE_SERVICE:
      !!process.env.SUPABASE_SERVICE_KEY ||
      !!process.env.SUPABASE_SERVICE_ROLE_KEY ||
      !!process.env.SUPABASE_SERVICE,
    META_ACCESS_TOKEN: !!process.env.META_ACCESS_TOKEN,
    FB_PAGE_ID: !!process.env.FB_PAGE_ID,
    IG_ACCOUNT_ID: !!process.env.IG_ACCOUNT_ID,
  };
  const ok = env.SUPABASE_URL && env.SUPABASE_SERVICE && env.META_ACCESS_TOKEN;
  res.status(ok ? 200 : 503).json({
    ok,
    message: ok ? "Service healthy" : "Service unhealthy (missing critical env vars)",
    env,
  });
};

app.get("/", healthCheck);
app.get("/health", healthCheck);
app.get("/healthz", healthCheck);
// ----------------------------------------------------------


// --- RUTA /run (PUBLICACIÓN) ------------------------------
app.post("/run", async (req: Request, res: Response) => {
  await log("info", "/run triggered", { body: req.body });
  try {
    const opts = req.body || {};
    const result = await runBatch(opts);
    res.json({ ok: true, ...opts, ...result });
  } catch (e: any) {
    console.error("[/run] Error:", e);
    await log("error", "/run failed", { body: req.body }, e);
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});
// ----------------------------------------------------------


// --- RUTA /api/posts-to-collect (SPRINT 2: BÚSQUEDA) --------
// Usada por n8n para obtener una lista de posts PUBLISHED que necesitan métricas
app.get("/api/posts-to-collect", async (req: Request, res: Response) => {
    await log("info", "/api/posts-to-collect triggered");
    try {
        const posts = await getPostsToCollectMetrics();
        res.json({ ok: true, count: posts.length, posts });
    } catch (e: any) {
        console.error("[/api/posts-to-collect] Error:", e);
        await log("error", "/api/posts-to-collect failed", { error: e.message }, e);
        res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
});
// ----------------------------------------------------------


// --- RUTA /api/collect-metrics (SPRINT 1: TRABAJADOR) --------
// Usada por n8n (POST) para procesar una lista de posts
app.post("/api/collect-metrics", async (req: Request, res: Response) => {
  const items = Array.isArray(req.body) ? req.body : [];
  const results: any[] = [];
  await log("info", "/api/collect-metrics triggered", { items_count: items.length });

  for (const item of items) {
    // Asumimos que los ítems del body tienen esta estructura
    const { platform, platform_media_id, post_history_id } = item; 
    try {
      const metrics = await collectMetricsOnce(
        platform,
        platform_media_id,
        post_history_id
      );
      results.push({ ok: true, id: post_history_id, metrics });
    } catch (e: any) {
      console.error("[collect-metrics] Error:", e?.message);
      await log("error", "/api/collect-metrics item failed", { item }, e);
      results.push({ ok: false, id: post_history_id, error: e?.message });
    }
  }

  res.json({ ok: true, count: results.length, results });
});
// ----------------------------------------------------------


// --- SERVER LISTEN ----------------------------------------
app.listen(port, async () => {
  try {
    await log("info", "Dogonauts Agent started up", {
      env: process.env.NODE_ENV,
      port,
    });
  } catch (e) {
    console.error("[CRITICAL] Logger failed on startup", e);
  }
  console.log(`🚀 Dogonauts Agent API running at http://0.0.0.0:${port}`);
});
// ----------------------------------------------------------

export default app;