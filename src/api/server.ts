// src/api/server.ts
// Servidor Express con endpoints internos para n8n (ESM)

import express, { Request, Response, NextFunction } from "express";
import { queries } from "../db/queries.js"; // ⚠️ .js
import { logger } from "../utils/logger.js";
import { supabase } from "../db/supabase.js";

const app = express();

// ───────────────── Middlewares ─────────────────
app.use(express.json());

// Log simple
app.use((req, _res, next) => {
  logger.info(`${req.method} ${req.path}`);
  next();
});

// CORS dev (ajusta en prod)
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Internal-Secret");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

// ─────────────── Auth interna ────────────────
const INTERNAL_SECRET = process.env.INTERNAL_API_SECRET || "";

function validateInternalSecret(req: Request, res: Response, next: NextFunction) {
  const provided = (req.headers["x-internal-secret"] as string) || "";
  if (!INTERNAL_SECRET) {
    logger.error("INTERNAL_API_SECRET no configurado");
    return res.status(500).json({ success: false, error: "Server misconfiguration" });
  }
  if (provided !== INTERNAL_SECRET) {
    logger.warn(`Unauthorized from ${req.ip}`);
    return res.status(401).json({ success: false, error: "Unauthorized" });
  }
  next();
}

// ───────────────── /health ───────────────────
app.get("/health", async (_req, res) => {
  try {
    const dbOK = await queries.healthCheck();
    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || "development",
      database: dbOK ? "connected" : "disconnected",
      services: {
        openai: !!process.env.OPENAI_API_KEY,
        meta: !!process.env.META_ACCESS_TOKEN,
        supabase: !!process.env.SUPABASE_URL,
      },
    });
  } catch (e: any) {
    logger.error("Health check failed:", e);
    res.status(500).json({ status: "error", error: e?.message ?? "unknown" });
  }
});

// ──────────────── /metrics ───────────────────
app.get("/metrics", async (_req, res) => {
  try {
    const m = await queries.getSystemMetrics();
    res.json({
      success: true,
      metrics: {
        jobs: {
          pending: m.pending_jobs || 0,
          running: m.running_jobs || 0,
          completed: m.completed_jobs || 0,
          failed: m.failed_jobs || 0,
        },
        posts: {
          total: m.total_posts || 0,
          last_7_days: m.posts_last_7_days || 0,
        },
        products: {
          total: m.total_products || 0,
          avg_perf_score: m.avg_perf_score || 0,
        },
      },
    });
  } catch (e: any) {
    logger.error("Metrics error:", e);
    res.status(500).json({ success: false, error: "Failed to fetch metrics" });
  }
});

// ─────────────── /internal/enqueue ───────────
interface EnqueueJobRequest {
  type: "CREATE_POST" | "PUBLISH_POST" | "FEEDBACK_LOOP" | "AB_TEST";
  priority?: number;
  metadata?: Record<string, any>;
}

app.post("/internal/enqueue", validateInternalSecret, async (req: Request, res: Response) => {
  try {
    const { type, priority, metadata }: EnqueueJobRequest = req.body || {};
    const valid = ["CREATE_POST", "PUBLISH_POST", "FEEDBACK_LOOP", "AB_TEST"];
    if (!type || !valid.includes(type)) {
      return res.status(400).json({ success: false, error: `Invalid type. Allowed: ${valid.join(", ")}` });
    }

    const payload = metadata || { trigger: "api" };

    const { data, error } = await supabase
      .from("job_queue" as any)
      .insert({
        type,
        payload,
        status: "PENDING",
        priority: priority ?? 0,
        source: "api",
      } as any)
      .select()
      .maybeSingle();

    if (error) {
      logger.error({ error }, "enqueue supabase error");
      return res.status(500).json({ success: false, error: (error as any)?.message ?? "Failed to enqueue" });
    }

    res.status(201).json({
      success: true,
      job_id: data?.id,
      type: data?.type,
      status: data?.status,
      message: "Job enqueued successfully",
    });
  } catch (e: any) {
    logger.error("enqueue exception:", e);
    res.status(500).json({ success: false, error: e?.message ?? "Failed to enqueue" });
  }
});

// ─────────────── /internal/jobs/:id ──────────
app.get("/internal/jobs/:jobId", validateInternalSecret, async (req, res) => {
  try {
    const job = await queries.getJobById(req.params.jobId);
    if (!job) return res.status(404).json({ success: false, error: "Job not found" });
    res.json({ success: true, job });
  } catch (e: any) {
    logger.error("get job error:", e);
    res.status(500).json({ success: false, error: "Failed to fetch job" });
  }
});

// ───────────── /internal/jobs/:id/cancel ─────
app.post("/internal/jobs/:jobId/cancel", validateInternalSecret, async (req, res) => {
  try {
    const ok = await queries.updateJobStatus(req.params.jobId, "FAILED", "Cancelled by admin");
    if (!ok) return res.status(404).json({ success: false, error: "Job not found or already completed" });
    res.json({ success: true, message: "Job cancelled successfully" });
  } catch (e: any) {
    logger.error("cancel job error:", e);
    res.status(500).json({ success: false, error: "Failed to cancel job" });
  }
});

// 404
app.use((req, res) => {
  res.status(404).json({ success: false, error: "Endpoint not found", path: req.path });
});

// Error handler
app.use((error: Error, _req: Request, res: Response, _next: NextFunction) => {
  logger.error("Unhandled error:", error);
  res.status(500).json({
    success: false,
    error: process.env.NODE_ENV === "production" ? "Internal server error" : error.message,
  });
});

export function startServer(port: number = 3000): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      const server = app.listen(port, () => {
        logger.info(`🚀 API Server escuchando en puerto ${port}`);
        logger.info(`📍 Health check: http://localhost:${port}/health`);
        logger.info(`📊 Metrics: http://localhost:${port}/metrics`);
        logger.info({ version: "1.1.0", buildTag: process.env.BUILD_TAG ?? "dev-local" }, "🧱 Content Agent iniciado");
        resolve();
      });
      server.on("error", (e) => {
        logger.error("Error al iniciar servidor:", e);
        reject(e);
      });
      process.on("SIGTERM", () => server.close(() => process.exit(0)));
      process.on("SIGINT", () => server.close(() => process.exit(0)));
    } catch (e) {
      logger.error("Fatal server start:", e);
      reject(e);
    }
  });
}

export { app };
