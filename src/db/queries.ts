// src/db/queries.ts
import { supabase } from "./supabase.js";

export type JobStatus = "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";

export type JobType = "CREATE_POST" | "FEEDBACK_LOOP" | "AB_TEST";

export type Job = {
  id: number;
  type: JobType | null;
  payload: any;
  status: JobStatus;
  error_message?: string | null;
  attempts: number;
  created_at: string;
  started_at?: string | null;
  completed_at?: string | null;
  source?: string | null;
};

export const queries = {
  // -------------------------------------------------------------------------
  // Health check
  // -------------------------------------------------------------------------
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

  // -------------------------------------------------------------------------
  // System metrics
  // -------------------------------------------------------------------------
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
      total_posts: 0,
      posts_last_7_days: 0,
      total_products: 0,
      avg_perf_score: 0,
    };
  },

  // -------------------------------------------------------------------------
  // Crear job (usado por /internal/enqueue)
  // -------------------------------------------------------------------------
  async createJob(input: {
    type: JobType;
    status?: JobStatus;
    source?: string;
    payload?: any;
  }): Promise<Job> {
    const insertData = {
      type: input.type,
      status: input.status ?? "PENDING",
      source: input.source ?? "api",
      payload: input.payload ?? {}, // jsonb NOT NULL
    };

    const { data, error } = await supabase
      .from("job_queue")
      .insert(insertData)
      .select()
      .single();

    if (error) throw error;
    return data as Job;
  },

  // -------------------------------------------------------------------------
  // Leer job por ID (para /internal/jobs/:jobId)
  // -------------------------------------------------------------------------
  async getJobById(jobId: string | number): Promise<Job | null> {
    const { data, error } = await supabase
      .from("job_queue")
      .select("*")
      .eq("id", jobId)
      .single();

    if (error) return null;
    return data as Job;
  },

  // -------------------------------------------------------------------------
  // Update genérico de estado (usado por cancel, etc.)
  // -------------------------------------------------------------------------
  async updateJobStatus(
    jobId: string | number,
    status: JobStatus,
    errorMsg?: string
  ) {
    const updateData: any = { status };

    if (errorMsg) updateData.error_message = errorMsg;

    if (status === "RUNNING") {
      updateData.started_at = new Date().toISOString();
    }

    if (status === "COMPLETED" || status === "FAILED") {
      updateData.completed_at = new Date().toISOString();
    }

    const { error } = await supabase
      .from("job_queue")
      .update(updateData)
      .eq("id", jobId);

    return !error;
  },

  // -------------------------------------------------------------------------
  // Worker: encolar desde código (si quieres usar este helper)
  // -------------------------------------------------------------------------
  async enqueueJob(type: JobType, payload: unknown) {
    const { data, error } = await supabase
      .from("job_queue")
      .insert({
        type,
        status: "PENDING" as JobStatus,
        source: "worker",
        payload,
      })
      .select()
      .single();

    if (error) throw error;
    return data as Job;
  },

  // -------------------------------------------------------------------------
  // Worker: reclamar siguiente job PENDING
  // -------------------------------------------------------------------------
  async getAndClaimJob(): Promise<Job | null> {
    // 1) Leer el más viejo PENDING
    const { data, error } = await supabase
      .from("job_queue")
      .select("*")
      .eq("status", "PENDING")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;

    // 2) Marcarlo como RUNNING
    const { data: claimed, error: updErr } = await supabase
      .from("job_queue")
      .update({
        status: "RUNNING",
        started_at: new Date().toISOString(),
        attempts: (data.attempts ?? 0) + 1,
      })
      .eq("id", data.id)
      .select()
      .single();

    if (updErr) throw updErr;
    return claimed as Job;
  },

  // -------------------------------------------------------------------------
  // Worker: marcar COMPLETED
  // -------------------------------------------------------------------------
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

  // -------------------------------------------------------------------------
  // Worker: marcar FAILED
  // -------------------------------------------------------------------------
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
