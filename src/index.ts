// src/index.ts
// Punto de entrada principal del agente Dogonauts.

import express, { Request, Response } from "express";
import dotenv from "dotenv";
import { log } from "./lib/log.js"; // Asegúrate que la ruta sea correcta
// ASUMIMOS que tus rutas de API están en 'agent.ts' y 'services/metrics.ts'
import { runBatch } from "./agent.js";
import { collectMetricsOnce } from "./services/metrics.js";

dotenv.config();

const app = express();
// EasyPanel inyecta PORT como variable de entorno en el contenedor
const port = process.env.PORT || 3000; // Usamos 3000 como fallback

// Middleware global
app.use(express.json());

// --- RUTAS DE SALUD (A PRUEBA DE BALAS) -------------------
// EasyPanel puede buscar en '/', '/health' o '/healthz'
// Le damos las tres.
const healthCheck = (_req: Request, res: Response) => {
  const env = {
    OPENAI_API_KEY: !!process.env.OPENAI_API_KEY,
    SUPABASE_URL: !!process.env.SUPABASE_URL,
    // Comprueba ambas claves de servicio
    SUPABASE_SERVICE:
      !!process.env.SUPABASE_SERVICE_KEY ||
      !!process.env.SUPABASE_SERVICE_ROLE_KEY ||
      !!process.env.SUPABASE_SERVICE,
    META_ACCESS_TOKEN: !!process.env.META_ACCESS_TOKEN,
    FB_PAGE_ID: !!process.env.FB_PAGE_ID,
    IG_ACCOUNT_ID: !!process.env.IG_ACCOUNT_ID,
  };
  
  // Si falta una variable crítica, podemos reportarlo aquí
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


// --- RUTA /run --------------------------------------------
app.post("/run", async (req: Request, res: Response) => {
  await log("info", "/run triggered", { body: req.body });
  try {
    const opts = req.body || {};
    const result = await runBatch(opts);
    res.json({ ok: true, ...opts, ...result });
  } catch (e: any) {
    console.error("[/run] Error:", e);
    // Loguea el error antes de responder
    await log("error", "/run failed", { body: req.body }, e);
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});
// ----------------------------------------------------------


// --- RUTA /api/collect-metrics -----------------------------
app.post("/api/collect-metrics", async (req: Request, res: Response) => {
  const items = Array.isArray(req.body) ? req.body : [];
  const results: any[] = [];
  await log("info", "/api/collect-metrics triggered", { items_count: items.length });

  for (const item of items) {
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
// Escucha en 0.0.0.0 para aceptar conexiones del contenedor
app.listen(port, async () => {
  // Este es el "smoke test". Si la clave de Supabase es incorrecta,
  // esto fallará y el error se verá en los logs de EasyPanel.
  try {
    await log("info", "Dogonauts Agent started up", {
      env: process.env.NODE_ENV,
      port,
    });
  } catch (e) {
    console.error("[CRITICAL] Logger failed on startup", e);
  }
  
  // Este es el log que EasyPanel busca para saber que la app está "viva"
  console.log(`🚀 Dogonauts Agent API running at http://0.0.0.0:${port}`);
});
// ----------------------------------------------------------

export default app;

