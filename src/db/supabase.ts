// src/db/supabase.ts

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import * as LoggerModule from "../utils/logger.js";

const logger: any = (LoggerModule as any).logger ?? console;

export const SUPABASE_URL = process.env.SUPABASE_URL ?? "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  logger.warn?.("Supabase env vars missing; database features may fail", {
    hasUrl: !!SUPABASE_URL,
    hasKey: !!SUPABASE_SERVICE_ROLE_KEY,
  });
}

export const supabase: SupabaseClient = createClient(
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY
);

logger.info?.(`✅ Supabase client initialized url=${SUPABASE_URL}`);
