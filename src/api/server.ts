// src/api/server.ts
// Servidor Express con endpoints internos para n8n

import express, { Request, Response, NextFunction } from "express";
import cors from "cors"; // CORRECCIÓN 1: Asegúrate de instalar los tipos
import { supabase } from "../db/supabase";
import { queries } from "../db/queries";
import { logger } from "../utils/logger";
// CORRECCIÓN 2: 'fileURLToPath' y 'path' ya no son necesarios con el fix de CJS
// import { fileURLToPath } from "url";
// import path from "path";

const app = express();

// ============================================================================
// MIDDLEWARE
// ============================================================================
app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.use((req: Request, _res: Response, next: NextFunction) => {
  try {
    // CORRECCIÓN 3: Invertir argumentos del logger
    logger?.debug?.(
      { method: req.method, path: req.path, ip: req.ip },
      "HTTP Request"
    );
  } catch {}
  next();
});

// ============================================================================
// SEGURIDAD
// ============================================================================
function validateInternalSecret(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const secret = req.header("x-internal-secret");
  const expectedSecret = process.env.INTERNAL_API_SECRET;
  if (!expectedSecret) {
    logger?.error?.("INTERNAL_API_SECRET not configured");
    return res.status(500).json({ error: "Server misconfiguration" });
  }
  if (!secret || secret !== expectedSecret) {
    // CORRECCIÓN 3: Invertir argumentos del logger
    logger?.warn?.(
      {
        ip: req.ip,
        path: req.path,
        provided_secret: secret ? "present (invalid)" : "missing",
      },
      "⚠️ Unauthorized internal API call attempt"
    );
    return res
      .status(403)
      .json({
        error: "Forbidden",
        message: "Invalid or missing X-Internal-Secret header",
      });
  }
  next();
}

// ============================================================================
// PUBLIC
// ============================================================================
app.get("/health", (_req: Request, res: Response) => {
  res.json({
    status: "ok",
    service: "dogonauts-content-agent",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

app.get("/metrics", async (_req: Request, res: Response) => {
  try {
    // products count
    const { count: totalProducts, error: productErr } = await supabase
      .from("products")
      .select("*", { count: "exact", head: true });
    if (productErr) throw productErr;

    // pending jobs count
    const { count: pendingJobs, error: jobErr } = await supabase
      .from("job_queue")
      .select("*", { count: "exact", head: true })
      .eq("status", "PENDING");
    if (jobErr) throw jobErr;

    // caption cache count
    const { count: captionCacheCount, error: cacheErr } = await supabase
      .from("caption_cache")
      .select("*", { count: "exact", head: true });
    if (cacheErr) throw cacheErr;

    // sample style performance
    const { data: perfData, error: perfErr } = await supabase
      .from("style_performance")
      .select("style, avg_performance")
      .limit(5);
    if (perfErr) throw perfErr;

    res.json({
      total_products: totalProducts ?? 0,
      pending_jobs: pendingJobs ?? 0,
      cached_captions: captionCacheCount ?? 0,
      style_performance_samples: perfData?.length ?? 0,
      styles_overview: perfData ?? [],
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================================================
// INTERNAL (PROTEGIDOS)
// ============================================================================
app.post(
  "/internal/enqueue",
  validateInternalSecret,
  async (req: Request, res: Response) => {
    try {
      const {
        job_type = "CREATE_POST",
        priority = "normal",
        metadata = {},
      } = req.body ?? {};

      // CORRECCIÓN 3: Invertir argumentos del logger
      logger?.info?.(
        { job_type, priority, source: "n8n" },
        "📥 Job enqueue request received"
      );

      const job = await queries.enqueueJob(job_type, {
        triggered_by: "n8n",
        scheduled_at: new Date().toISOString(),
        priority,
        ...metadata,
      });

      res.status(201).json({
        success: true,
        job_id: job.id,
        status: job.status,
        message: "Job enqueued successfully. Worker will process it shortly.",
      });
    } catch (e: any) {
      // CORRECCIÓN 3: Invertir argumentos del logger
      logger?.error?.(
        { error: e.message, stack: e.stack },
        "❌ Failed to enqueue job"
      );
      res.status(500).json({ success: false, error: e.message });
    }
  }
);

app.post(
  "/internal/feedback",
  validateInternalSecret,
  async (_req: Request, res: Response) => {
    try {
      const job = await queries.enqueueJob("FEEDBACK_LOOP", {
        triggered_by: "manual",
        triggered_at: new Date().toISOString(),
      });
      res.json({
        success: true,
        job_id: job.id,
        message: "Feedback loop job created",
      });
    } catch (e: any) {
      // CORRECCIÓN 3: Invertir argumentos del logger
      logger?.error?.({ error: e.message }, "Failed to create feedback job");
      res.status(500).json({ error: e.message });
    }
  }
);

app.get(
  "/internal/queue/status",
  validateInternalSecret,
  async (_req: Request, res: Response) => {
    try {
      const { data: pendingJobs, error: pErr } = await supabase
        .from("job_queue")
        .select("id, type, status, created_at")
        .eq("status", "PENDING")
        .order("created_at", { ascending: true });
      if (pErr) throw pErr;

      const { data: runningJobs, error: rErr } = await supabase
        .from("job_queue")
        .select("id, type, status, started_at")
        .eq("status", "RUNNING");
      if (rErr) throw rErr;

      res.json({
        pending: pendingJobs?.length ?? 0,
        running: runningJobs?.length ?? 0,
        pending_jobs: pendingJobs ?? [],
        running_jobs: runningJobs ?? [],
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  }
);

// ============================================================================
// ERROR HANDLER
// ============================================================================
app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  try {
    // CORRECCIÓN 3: Invertir argumentos del logger
    logger?.error?.(
      { error: err.message, stack: err.stack, path: req.path },
      "Unhandled error"
    );
  } catch {}
  res.status(500).json({
    error: "Internal server error",
    message: process.env.NODE_ENV === "development" ? err.message : undefined,
  });
});

// ============================================================================
// SERVIDOR
// ============================================================================
export function startServer(port: number = Number(process.env.PORT ?? 3000)) {
  return new Promise<void>((resolve) => {
    app.listen(port, () => {
      // CORRECCIÓN 3: Invertir argumentos del logger
      logger?.info?.(
        {
          environment: process.env.NODE_ENV || "development",
          endpoints: {
            health: `http://localhost:${port}/health`,
            internal: `http://localhost:${port}/internal/*`,
          },
        },
        `🚀 API Server running on port ${port}`
      );
      resolve();
    });
  });
}

export { app };

// ============================================================================
// ESM: ejecutar directamente
// ============================================================================
const isMain = (() => {
  // CORRECCIÓN 2: Reemplazar el chequeo de ESM por el de CommonJS
  // El error TS1470 (import.meta) se debe a que tu tsconfig compila a CommonJS.
  // Esta es la forma estándar de CommonJS para verificar si un archivo es el principal.
  return require.main === module;
})();

if (isMain) {
  const PORT = parseInt(process.env.PORT || "3000", 10);
  startServer(PORT).catch((error) => {
    // CORRECCIÓN 3: Invertir argumentos del logger
    logger?.error?.({ error: error?.message }, "Failed to start server");
    process.exit(1);
  });
}