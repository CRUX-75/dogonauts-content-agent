import "dotenv/config";

type Check = { name: string; ok: boolean; detail?: string };

async function checkEnv(): Promise<Check> {
  const required = [
    "OPENAI_API_KEY",
    "SUPABASE_URL",
    "SUPABASE_SERVICE_KEY",
    "META_ACCESS_TOKEN",
    "FB_PAGE_ID",
    "IG_ACCOUNT_ID",
    "PORT"
  ];
  const missing = required.filter(k => !process.env[k]);
  return {
    name: "env_vars",
    ok: missing.length === 0,
    detail: missing.length ? `Faltan: ${missing.join(", ")}` : "OK"
  };
}

async function checkSupabase(): Promise<Check> {
  try {
    const url = `${process.env.SUPABASE_URL}/rest/v1/`;
    const res = await fetch(url, { method: "OPTIONS" });
    return { name: "supabase_http", ok: res.ok, detail: `status=${res.status}` };
  } catch (e: any) {
    return { name: "supabase_http", ok: false, detail: e?.message || String(e) };
  }
}

async function checkMeta(): Promise<Check> {
  const token = process.env.META_ACCESS_TOKEN!;
  try {
    const res = await fetch(`https://graph.facebook.com/v19.0/me?access_token=${encodeURIComponent(token)}`);
    const ok = res.ok;
    const txt = await res.text();
    return { name: "meta_graph", ok, detail: ok ? "OK" : txt.slice(0, 200) };
  } catch (e: any) {
    return { name: "meta_graph", ok: false, detail: e?.message || String(e) };
  }
}

(async () => {
  const results = [await checkEnv(), await checkSupabase(), await checkMeta()];
  console.table(results.map(r => ({ check: r.name, ok: r.ok, detail: r.detail })));
  process.exit(results.every(r => r.ok) ? 0 : 1);
})();
