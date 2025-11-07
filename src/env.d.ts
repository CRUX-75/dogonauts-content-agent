declare namespace NodeJS {
  interface ProcessEnv {
    NODE_ENV?: "development" | "production" | "test";
    PORT?: string;
    SUPABASE_URL: string;
    SUPABASE_SERVICE_KEY: string;
    OPENAI_API_KEY: string;
    INTERNAL_API_SECRET: string;
    META_ACCESS_TOKEN?: string;
    IG_ACCOUNT_ID?: string;
  }
}
