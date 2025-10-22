// --- Helpers simples para ventanas HH:mm-HH:mm,HH:mm-HH:mm ---
type WindowRange = { startMin: number; endMin: number };

function parseWindows(raw: string): WindowRange[] {
  if (!raw) return [];
  return raw.split(",").map((range) => {
    const [start, end] = range.split("-").map((s) => s.trim());
    const [sh, sm] = start.split(":").map(Number);
    const [eh, em] = end.split(":").map(Number);
    return { startMin: sh * 60 + sm, endMin: eh * 60 + em };
  });
}

function isNowAllowed(windows: WindowRange[], date = new Date()) {
  // Asume que el proceso corre ya en TZ deseada (usa `TZ=Europe/Berlin` en entorno/Docker)
  if (!windows.length) return true;
  const h = date.getHours();
  const m = date.getMinutes();
  const nowMin = h * 60 + m;
  return windows.some((w) => nowMin >= w.startMin && nowMin <= w.endMin);
}

// --- Carga de .env ---
const RAW_GLOBAL = process.env.POST_WINDOWS || "";   // p.ej: "19:00-21:00"
const RAW_IG = process.env.POST_WINDOWS_IG || "";    // p.ej: "19:00-21:00"
const RAW_FB = process.env.POST_WINDOWS_FB || "";    // p.ej: "19:00-20:00"

// --- Ventanas parseadas (memo simple al cargar el módulo) ---
const W_GLOBAL = parseWindows(RAW_GLOBAL);
const W_IG = parseWindows(RAW_IG);
const W_FB = parseWindows(RAW_FB);

// --- Formateador HH:mm ---
const hhmm = (n: number) =>
  `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;

function explain(w: WindowRange[]) {
  if (!w.length) return "(sin restricción)";
  return w.map((r) => `${hhmm(r.startMin)}-${hhmm(r.endMin)}`).join(", ");
}

// ===================== EXPORTS =====================

// Global (back-compat)
export function canPublishNow(date = new Date()): boolean {
  if (!W_GLOBAL.length) return true;
  return isNowAllowed(W_GLOBAL, date);
}

export function explainWindows(): string {
  return explain(W_GLOBAL);
}

// Por red
export function canPublishNowFor(net: "instagram" | "facebook", date = new Date()): boolean {
  const W =
    net === "instagram"
      ? W_IG.length
        ? W_IG
        : W_GLOBAL
      : W_FB.length
      ? W_FB
      : W_GLOBAL;
  if (!W.length) return true;
  return isNowAllowed(W, date);
}

export function explainWindowsFor(net: "instagram" | "facebook"): string {
  const W =
    net === "instagram"
      ? W_IG.length
        ? W_IG
        : W_GLOBAL
      : W_FB.length
      ? W_FB
      : W_GLOBAL;
  return explain(W);
}

// Nota: si en el futuro quieres reactivar cron interno, créalo aquí
// export function initScheduler() { ... }
// y actívalo en index.ts solo si ENABLE_CRON !== "false".
