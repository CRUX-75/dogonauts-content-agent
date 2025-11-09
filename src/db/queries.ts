import { supabase } from "./supabase.js";

export type Job = {
  id: string;
  type: string;
  payload: any;
  status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";
  created_at: string;
};

export const queries = {
  // Health check
  async healthCheck() {
    try {
      const { error } = await supabase.from("job_queue").select("id").limit(1);
      return !error;
    } catch {
      return false;
    }
  },

  // System metrics
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

  // Create job
  async createJob(jobData: any) {
    const { data, error } = await supabase
      .from("job_queue")
      .insert(jobData)
      .select()
      .single();
    if (error) throw error;
    return data as Job;
  },

  // Get job by ID
  async getJobById(jobId: string) {
    const { data, error } = await supabase
      .from("job_queue")
      .select("*")
      .eq("id", jobId)
      .single();
    if (error) return null;
    return data as Job;
  },

  // Update job status
  async updateJobStatus(jobId: string, status: string, errorMsg?: string) {
    const updateData: any = { status };
    if (errorMsg) updateData.error = errorMsg;
    
    const { error } = await supabase
      .from("job_queue")
      .update(updateData)
      .eq("id", jobId);
    
    return !error;
  },

  // Original methods
  async enqueueJob(type: string, payload: unknown) {
    const { data, error } = await supabase
      .from("job_queue")
      .insert({ type, payload, status: "PENDING" })
      .select()
      .single();
    if (error) throw error;
    return data as Job;
  },

  async getAndClaimJob() {
    const { data, error } = await supabase
      .from("job_queue")
      .select("*")
      .eq("status", "PENDING")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;

    const { data: claimed, error: updErr } = await supabase
      .from("job_queue")
      .update({ status: "RUNNING", started_at: new Date().toISOString() })
      .eq("id", data.id)
      .select()
      .single();
    if (updErr) throw updErr;
    return claimed as Job;
  },

  async setJobResult(id: string, result: unknown) {
    const { error } = await supabase
      .from("job_queue")
      .update({ status: "COMPLETED", result, finished_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw error;
  },

  async setJobFailed(id: string, reason: string) {
    const { error } = await supabase
      .from("job_queue")
      .update({ status: "FAILED", error: reason, finished_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw error;
  },
};