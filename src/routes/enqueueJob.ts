// src/routes/enqueueJob.ts (ejemplo Express)

import type { Request, Response } from "express";
import { supabase } from "../db/supabase.js";
import { logger } from "../utils/logger.js";

export async function enqueueJobHandler(req: Request, res: Response) {
  try {
    const body = req.body ?? {};

    const type = body.type;
    const payload = body.payload ?? {};

    if (!type || typeof type !== "string") {
      return res.status(400).json({
        success: false,
        error: 'Missing or invalid "type" in body',
      });
    }

    // Opcional: validar tipos de job permitidos
    const allowedTypes = ["CREATE_POST", "FEEDBACK_LOOP", "AB_TEST"];
    if (!allowedTypes.includes(type)) {
      return res.status(400).json({
        success: false,
        error: `Unsupported job type: ${type}`,
      });
    }

    // Insert en job_queue
    const { data, error } = await supabase
      .from("job_queue" as any)
      .insert({
        type,
        payload,          // jsonb en Supabase
        // status se pone solo (default 'PENDING')
      } as any)
      .select()
      .maybeSingle();

    if (error) {
      logger.error(
        { supabaseError: error, body },
        "Failed to enqueue job (Supabase error)"
      );

      // IMPORTANTE: devolvemos detalle para debug (luego lo puedes ocultar)
      return res.status(500).json({
        success: false,
        error: "Failed to enqueue job",
        details: error.message ?? error,
      });
    }

    logger.info(
      { jobId: data?.id, type, payload },
      "✅ Job enqueued successfully"
    );

    return res.status(200).json({
      success: true,
      job: data,
    });
  } catch (err: any) {
    logger.error(
      { error: err?.message ?? String(err), body: req.body },
      "Unexpected error en enqueueJobHandler"
    );

    return res.status(500).json({
      success: false,
      error: "Failed to enqueue job (exception)",
      details: err?.message ?? String(err),
    });
  }
}
