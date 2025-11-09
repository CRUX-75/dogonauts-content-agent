import { supabase } from "./supabase.js";

export type JobStatus = "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";

export type Job = {
  id: number; // bigint en Supabase → number en JS
  type: "CREATE_POST" | "FEEDBACK_LOOP" | "AB_TEST";
  payload: any;
  status: JobStatus;
  source?: string | null;
  error_message?: string | null;
  attempts?: number | null;
  created_at: string;
  started_at?: string | null;
  completed_at?: string | null;
};

export const queries = {
  // ---------------------------------------------------------------------------
  // Health check: simplemente verifica que la tabla exista y responda
  // ---------------------------------------------------------------------------
  async healthCheck() {
    try {
      const { error } = await supabase
        .from("job_queue")
        .select("id")
        .limit(1);

      return !error;
    } catch {
      return false;
    }
  },

  // ---------------------------------------------------------------------------
  // Métricas del sistema (solo jobs por ahora)
  // ---------------------------------------------------------------------------
  async getSystemMetrics() {
    const { count: pending } = await supabase
      .from("job_queue")
      .select("*", { count: "exact", head: true })
      .eq("status", "PENDING");

    const { count: running } = await supabase
      .from("job_queue")
      .select("*", { count: "exact", head: true })
      .eq("status", "RUNNING");

    const { count: completed } = await supabase
      .from("job_queue")
      .select("*", { count: "exact", head: true })
      .eq("status", "COMPLETED");

    const { count: failed } = await supabase
      .from("job_queue")
      .select("*", { count: "exact", head: true })
      .eq("status", "FAILED");

    return {
      pending_jobs: pending || 0,
      running_jobs: running || 0,
      completed_jobs: completed || 0,
      failed_jobs: failed || 0,

      // placeholders hasta que conectemos las demás tablas
      total_posts: 0,
      posts_last_7_days: 0,
      total_products: 0,
      avg_perf_score: 0,
    };
  },

  // ---------------------------------------------------------------------------
  // Crear job genérico (usado por /internal/enqueue)
  // ---------------------------------------------------------------------------
  async createJob(input: {
    type: Job["type"];
    status?: JobStatus;
    source?: string;
    payload?: Record<string, any>;
  }) {
    const {
      type,
      status = "PENDING",
      source = "api",
      payload = {},
    } = input;

    const { data, error } = await supabase
      .from("job_queue")
      .insert([
        {
          type,
          status,
          source,
          payload,
        },
      ])
      .select()
      .single();

    if (error) {
      console.error("Supabase createJob error", error);
      throw new Error(`Supabase createJob failed: ${error.message}`);
    }

    return data as Job;
  },

  // ---------------------------------------------------------------------------
  // Obtener job por ID
  // ---------------------------------------------------------------------------
  async getJobById(jobId: string | number) {
    const { data, error } = await supabase
      .from("job_queue")
      .select("*")
      .eq("id", jobId)
      .single();

    if (error) return null;
    return data as Job;
  },

  // ---------------------------------------------------------------------------
  // Actualizar status de un job (opcionalmente con error_message)
  // ---------------------------------------------------------------------------
  async updateJobStatus(
    jobId: string | number,
    status: JobStatus,
    errorMsg?: string,
  ) {
    const updateData: any = { status };
    if (errorMsg) updateData.error_message = errorMsg;

    const { error } = await supabase
      .from("job_queue")
      .update(updateData)
      .eq("id", jobId);

    return !error;
  },

  // ---------------------------------------------------------------------------
  // Helper simple para encolar jobs desde dentro del agente
  // ---------------------------------------------------------------------------
  async enqueueJob(
    type: Job["type"],
    payload: unknown,
    source: string = "internal",
  ) {
    return queries.createJob({
      type,
      status: "PENDING",
      source,
      payload: payload as Record<string, any>,
    });
  },

  // ---------------------------------------------------------------------------
  // Tomar el próximo job PENDING y marcarlo como RUNNING
  // ---------------------------------------------------------------------------
  async getAndClaimJob() {
    // 1) buscar el más viejo en estado PENDING
    const { data, error } = await supabase
      .from("job_queue")
      .select("*")
      .eq("status", "PENDING")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;

    // 2) marcarlo como RUNNING
    const { data: claimed, error: updErr } = await supabase
      .from("job_queue")
      .update({
        status: "RUNNING",
        started_at: new Date().toISOString(),
      })
      .eq("id", data.id)
      .select()
      .single();

    if (updErr) throw updErr;
    return claimed as Job;
  },

  // ---------------------------------------------------------------------------
  // Marcar job como COMPLETED
  // ---------------------------------------------------------------------------
  async setJobResult(id: string | number) {
    const { error } = await supabase
      .from("job_queue")
      .update({
        status: "COMPLETED",
        completed_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (error) throw error;
  },

  // ---------------------------------------------------------------------------
  // Marcar job como FAILED
  // ---------------------------------------------------------------------------
  async setJobFailed(id: string | number, reason: string) {
    const { error } = await supabase
      .from("job_queue")
      .update({
        status: "FAILED",
        error_message: reason,
        completed_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (error) throw error;
  },
};
