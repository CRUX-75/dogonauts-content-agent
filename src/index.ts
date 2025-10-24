// src/index.ts
// Punto de entrada principal del agente Dogonauts.
// Levanta el servidor Express y expone las rutas API del sistema.

import express, { Request, Response } from "express";
import dotenv from "dotenv";
import { runBatch } from "./agent.js";
import { collectMetricsOnce } from "./services/metrics.js";
import { log } from './lib/log.js'; // <--- IMPORTADO

dotenv.config();

const app = express();
const port = process.env.PORT || 8080;

// Middleware global
app.use(express.json());

// --- RUTA DE SALUD ---------------------------------------
app.get("/health", (_req: Request, res: Response) => {
  res.json({
    ok: true,
    env: {
      OPENAI_API_KEY: !!process.env.OPENAI_API_KEY,
      SUPABASE_URL: !!process.env.SUPABASE_URL,
      SUPABASE_SERVICE: !!process.env.SUPABASE_SERVICE_KEY || !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      META_ACCESS_TOKEN: !!process.env.META_ACCESS_TOKEN,
      FB_PAGE_ID: !!process.env.FB_PAGE_ID,
      IG_ACCOUNT_ID: !!process.env.IG_ACCOUNT_ID,
    },
  });
});
// ----------------------------------------------------------


// --- RUTA /run --------------------------------------------
// Ejecuta una tanda de publicación o simulación.
// Ejemplo:
// curl -s -X POST http://localhost:8080/run -H "content-type: application/json" \
//   -d '{"dryRun":true,"limit":1,"networks":["instagram"],"debug":true}'
app.post("/run", async (req: Request, res: Response) => {
  try {
    const opts = req.body || {};
    // Loguea el inicio de la ejecución
    await log('info', 'Batch run started', { ...opts, trigger: 'api' });
    const result = await runBatch(opts);
    res.json({ ok: true, ...opts, ...result });
  } catch (e: any) {
    // Loguea el error antes de responder
    await log('error', 'Batch run failed', { trigger: 'api' }, e);
    console.error("[/run] Error:", e);
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});
// ----------------------------------------------------------


// --- RUTA /api/collect-metrics -----------------------------
// Recolecta métricas de un post en Meta (Instagram o Facebook).
// Ejemplo:
// curl -s -X POST http://localhost:8080/api/collect-metrics \
//   -H "content-type: application/json" \
//   -d '[{"platform":"instagram","platform_media_id":"18073732028468497","post_history_id":"b71d5cc6-a1e5-4ce9-a5f5-0ccc6aac2c70"}]'
app.post("/api/collect-metrics", async (req: Request, res: Response) => {
  const items = Array.isArray(req.body) ? req.body : [];
  const results: any[] = [];
  await log('info', 'Metrics collection started', { count: items.length, trigger: 'api' });

  for (const item of items) {
    const { platform, platform_media_id, post_history_id } = item;
    try {
      const metrics = await collectMetricsOnce(platform, platform_media_id, post_history_id);
      results.push({ ok: true, id: post_history_id, metrics });
    } catch (e: any) {
      console.error("[collect-metrics] Error:", e?.message);
      // Loguea errores individuales
      await log('error', 'Metrics collection failed for item', { post_history_id, platform }, e);
      results.push({ ok: false, id: post_history_id, error: e?.message });
    }
  }

  res.json({ ok: true, count: results.length, results });
});
// ----------------------------------------------------------


// --- SERVER LISTEN ----------------------------------------
// Convertido en async para permitir el log de arranque
app.listen(port, async () => {
  console.log(`🚀 Dogonauts Agent API running at http://localhost:${port}`);
  
  // --- SMOKE TEST LOG ---
  // Confirma que el logging a Supabase está funcional al arrancar.
  await log('info', 'Dogonauts Agent started up', { 
    env: process.env.NODE_ENV || 'development',
    port: port,
  });
  // ----------------------
});
// ----------------------------------------------------------

export default app;