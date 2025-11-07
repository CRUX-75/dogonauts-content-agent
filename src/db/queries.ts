import { supabase } from "./supabase";

export type Job = {
  id: string;
  type: string;
  payload: any;
  status: "PENDING" | "RUNNING" | "DONE" | "FAILED";
  created_at: string;
};

export const queries = {
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
    // si creaste la RPC get_and_claim_job() úsala; si no, fallback simple:
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
      .update({ status: "DONE", result, finished_at: new Date().toISOString() })
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
