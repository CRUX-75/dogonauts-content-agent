import dotenv from "dotenv";
dotenv.config({ path: ".env" });

import express, { Request, Response } from "express";
import { runBatch } from "./agent.js";
import { canPublishNow, explainWindows } from "./services/scheduler.js";

// Endurece procesos
process.on("unhandledRejection", (reason) => console.error("Unhandled Rejection:", reason));
process.on("uncaughtException", (err) => console.error("Uncaught Exception:", err));

const app = express();
app.use(express.json());

// ------------------ health ------------------
app.get("/health", (_req: Request, res: Response) => {
  res.json({
    ok: true,
    env: {
      OPENAI_API_KEY: !!process.env.OPENAI_API_KEY,
      SUPABASE_URL: !!process.env.SUPABASE_URL,
      SUPABASE_SERVICE:
        !!(process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE),
      META_ACCESS_TOKEN: !!process.env.META_ACCESS_TOKEN,
      FB_PAGE_ID: !!process.env.FB_PAGE_ID,
      IG_ACCOUNT_ID: !!process.env.IG_ACCOUNT_ID,
      ENABLE_CRON: process.env.ENABLE_CRON ?? "undefined",
      TIMEZONE: process.env.TIMEZONE ?? "undefined",
      POST_WINDOWS: process.env.POST_WINDOWS ?? "undefined",
      POST_WINDOWS_IG: process.env.POST_WINDOWS_IG ?? "undefined",
      POST_WINDOWS_FB: process.env.POST_WINDOWS_FB ?? "undefined",
    },
  });
});

// ------------------ run ------------------
app.post("/run", async (req: Request, res: Response) => {
  try {
    // Permite ?dryRun=true vía query
    const dryQ = (req.query as any)?.dryRun;
    const dryFromQuery = typeof dryQ === "string" ? dryQ === "true" : !!dryQ;

    const {
      campaign_name,
      limit,
      dryRun,
      networks,
      templateStyle, // "SEASONAL" | "UGC" | "NEW_IN_STORE"
      captionRefine, // boolean
      debug,         // boolean (devolver skipped[] con detalle)
      forcePublish,  // boolean (ignora idempotencia/cooldown)
    } = (req.body ?? {}) as any;

    const isDry = !!dryRun || dryFromQuery;

    // Sin cron interno. Si en el futuro lo activas, inicialízalo en el bootstrap, no aquí.
    // if (process.env.ENABLE_CRON !== "false") { initScheduler(); }

    // Respeta ventanas (env) si NO es dryRun ni forcePublish
    if (!isDry && !forcePublish && !canPublishNow()) {
      return res.status(202).json({
        ok: true,
        status: "DEFERRED",
        reason: "Fuera de ventana de publicación",
        windows: explainWindows(),
      });
    }

    const out = await runBatch({
      campaign_name,
      limit: Number.isFinite(limit as number) ? Number(limit) : 1,
      dryRun: isDry,
      networks:
        Array.isArray(networks) && networks.length ? networks : ["instagram", "facebook"],
      templateStyle,
      captionRefine,
      debug,
      forcePublish,
    });

    res.json({ ok: true, dryRun: isDry, ...out });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message || "internal" });
  }
});

// ------------------ metrics collect ------------------
app.post("/api/collect-metrics", async (req: Request, res: Response) => {
  try {
    const { collectMetricsOnce } = await import("./services/metrics.js");

    const items: Array<{
      platform: "instagram" | "facebook";
      platform_media_id: string;
      post_history_id: string;
    }> = Array.isArray(req.body) ? req.body : [];

    const results = [];
    for (const it of items) {
      const r = await collectMetricsOnce(
        it.platform,
        it.platform_media_id,
        it.post_history_id
      );
      results.push({ ok: true, id: it.post_history_id, metrics: r });
    }
    res.json({ ok: true, count: results.length, results });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message || String(err) });
  }
});

const port = Number(process.env.PORT || 8080);
const host = "0.0.0.0";

app
  .listen(port, host, () =>
    console.log(`Agent listening on http://${host}:${port}`)
  )
  .on("error", (err: any) => {
    console.error("Server error on listen:", err?.code || err?.message || err);
    process.exit(1);
  });
