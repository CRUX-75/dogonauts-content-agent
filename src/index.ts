// src/index.ts
// ... (importaciones, app.use(express.json())) ...

app.get("/health", (_req: Request, res: Response) => {
  res.json({
    ok: true,
    timestamp: new Date().toISOString(),
    env_check: {
      // Variables específicas que necesitamos
      IG_ACCOUNT_ID_IS_SET: !!process.env.IG_ACCOUNT_ID,
      IG_ACCOUNT_ID_LENGTH: process.env.IG_ACCOUNT_ID?.length || 0,
      IG_ACCOUNT_ID_VALUE: process.env.IG_ACCOUNT_ID || "--- VACÍO ---",

      META_TOKEN_IS_SET: !!process.env.META_ACCESS_TOKEN,
      META_TOKEN_LENGTH: process.env.META_ACCESS_TOKEN?.length || 0,
      META_TOKEN_VALUE: (process.env.META_ACCESS_TOKEN || "--- VACÍO ---").substring(0, 20) + "...", // Mostramos solo los primeros 20

      // 🔍 BONUS: Ver TODAS las variables que contienen "META" o "IG" o "FACEBOOK"
      all_related_env_keys: Object.keys(process.env).filter(
        key => key.includes('META') || key.includes('IG') || key.includes('FACEBOOK')
      ),

      // 🔍 BONUS 2: Ver si hay espacios ocultos en los nombres
      key_analysis: {
        IG_key_exact: JSON.stringify('IG_ACCOUNT_ID'),
        META_key_exact: JSON.stringify('META_ACCESS_TOKEN'),
        IG_found_keys: Object.keys(process.env).filter(k => k.toLowerCase().includes('ig_account')),
        META_found_keys: Object.keys(process.env).filter(k => k.toLowerCase().includes('meta_access')),
      }
    },
  });
});

// ... (el resto de tus rutas, /run, /api/collect-metrics, etc.) ...

// ... (app.listen) ...