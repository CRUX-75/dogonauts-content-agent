// src/api/internal.routes.ts

import { Router, Request, Response, NextFunction } from "express";
import * as LoggerModule from "../utils/logger.js";
import { createJobsFromRequest } from "../modules/job-creator.js";

const log: any = (LoggerModule as any).logger ?? console;

const router = Router();

// Middleware de seguridad
function validateInternalRequest(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const secretHeader = req.headers["x-internal-secret"];
  const expected = process.env.INTERNAL_API_SECRET;

  const provided =
    typeof secretHeader === "string"
      ? secretHeader
      : Array.isArray(secretHeader)
      ? secretHeader[0]
      : undefined;

  if (!expected) {
    log.warn?.("INTERNAL_API_SECRET is not set; rejecting internal request");
    return res.status(500).json({ ok: false, error: "Misconfigured server" });
  }

  if (!provided || provided !== expected) {
    log.warn?.("Invalid internal secret", { provided });
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }

  return next();
}

router.use(validateInternalRequest);

// Ruta interna para crear jobs
router.post("/jobs", async (req: Request, res: Response) => {
  try {
    const payload = req.body as any;

    const jobs = await createJobsFromRequest(payload);

    log.info?.("Internal jobs enqueued", {
      count: Array.isArray(jobs) ? jobs.length : 1,
    });

    return res.status(201).json({
      ok: true,
      jobs,
    });
  } catch (e: any) {
    log.error?.("Failed to create internal jobs", {
      error: e?.message,
    });

    return res.status(500).json({
      ok: false,
      error: "Failed to create jobs",
    });
  }
});

export default router;
