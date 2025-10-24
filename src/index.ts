// src/index.ts
import 'dotenv/config'; // cargar env PRIMERO

import express, { Request, Response } from "express";
import { runBatch } from "./agent.js";
import { collectMetricsOnce } from "./services/metrics.js";
import { log } from "./lib/log.js";

const app = express();
const port = parseInt(process.env.PORT ?? '3000', 10);

app.use(express.json());

// --- raíz (para chequeos básicos de panel/proxy) ------------------------
app.get("/", (_req: Request, res: Response) => {
  res.json({ ok: true, service: "Dogonauts Agent", ts: new Date().toISOString() });
});

// --- health detallado (muestra envs que ve el contenedor) ---------------
app.get("/health", (_req: Request, res: Response) => {
  const supabaseServicePresent =
    !!process.env.SUPABASE_SERVICE ||
    !!process.env.SUPABASE_SERVICE_KEY ||
    !!process.env.SUPABASE_SERVICE_ROLE_KEY;

  res.json({
    ok: true,
    env: {
      OPENAI_API_KEY: !!process.env.OPENAI_API_KEY,
      SUPABASE_URL: !!process.env.SUPABASE_URL,
      SUPABASE_SERVICE: supabaseServicePresent,
      META_ACCESS_TOKEN: !!process.env.META_ACCESS_TOKEN,
      FB_PAGE_ID: !!process.env.FB_PAGE_ID,
      IG_ACCOUNT_ID: !!process.env.IG_ACCOUNT_ID,
    },
  });
});

// --- health ultraliviano para EasyPanel ---------------------------------
app.get("/healthz", (_req: Request, res: Response) => {
  res.status(200).send("ok");
});

// --- versión (para saber qué build corre) -------------------------------
app.get("/version", (_req: Request, res: Response) => {
  res.json({
    ok: true,
    git: process.env.GIT_SHA || "unknown",
    pkgVersion: process.env.npm_package_version || "unknown",
    port,
    routes: ["/", "/health", "/healthz", "/version", "/debug/log", "/debug/boom", "/run", "/api/collect-metrics"]
  });
});

// --- debug: genera un log info ------------------------------------------
app.get("/debug/log", async (req: Request, res: Response) => {
  await log("info", "Debug log hit", { ip: req.ip, ua: req.headers["user-agent"] });
  res.json({ ok: true });
});

// --- debug: genera un error con stack -----------------------------------
app.get("/debug/boom", async (_req: Request, res: Response) => {
  try {
    throw new Error("Manual boom for logging");
  } catch (e) {
    await log("error", "Boom route caught", { route: "/debug/boom" }, e);
    res.status(500).json({ ok: false });
  }
});

// --- /run: ejecuta batch -------------------------------------------------
app.post("/run", async (req: Request, res: Response) => {
  try {
    const opts = req.body || {};
    await log("info", "Batch run started", { ...opts, trigger: "api" });
    const result = await runBatch(opts);
    res.json({ ok: true, ...opts, ...result });
  } catch (e: any) {
    await log("error", "Batch run failed", { trigger: "api" }, e);
    console.error("[/run] Error:", e);
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

// --- /api/collect-metrics -----------------------------------------------
app.post("/api/collect-metrics", async (req: Request, res: Response) => {
  const items = Array.isArray(req.body) ? req.body : [];
  const results: any[] = [];
  await log("info", "Metrics collection started", { count: items.length, trigger: "api" });

  for (const item of items) {
    const { platform, platform_media_id, post_history_id } = item || {};
    try {
      const metrics = await collectMetricsOnce(platform, platform_media_id, post_history_id);
      results.push({ ok: true, id: post_history_id, metrics });
    } catch (e: any) {
      console.error("[collect-metrics] Error:", e?.message);
      await log("error", "Metrics collection failed for item", { post_history_id, platform }, e);
      results.push({ ok: false, id: post_history_id, error: e?.message });
    }
  }

  res.json({ ok: true, count: results.length, results });
});

// --- server listen + smoke log ------------------------------------------
const server = app.listen(port, "0.0.0.0", async () => {
  console.log(`🚀 Dogonauts Agent API running on 0.0.0.0:${port}`);
  await log("info", "Dogonauts Agent started up", {
    env: process.env.NODE_ENV || "development",
    port,
  });
});

// --- defensas: que el proceso no muera por errores globales -------------
process.on("unhandledRejection", (reason) => {
  console.error("[unhandledRejection]", reason);
});
process.on("uncaughtException", (err) => {
  console.error("[uncaughtException]", err);
});
process.on("SIGTERM", () => {
  console.log("[shutdown] SIGTERM received");
  server?.close?.(() => process.exit(0));
});
process.on("SIGINT", () => {
  console.log("[shutdown] SIGINT received");
  server?.close?.(() => process.exit(0));
});

export default app;
