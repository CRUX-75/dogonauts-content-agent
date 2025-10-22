// src/core/time.ts
export function parseWindows(raw: string): Array<{ startMin: number; endMin: number }> {
  if (!raw) return [];
  return raw.split(',').map(range => {
    const [start, end] = range.split('-').map(s => s.trim());
    const [sh, sm] = start.split(':').map(Number);
    const [eh, em] = end.split(':').map(Number);
    return { startMin: sh * 60 + sm, endMin: eh * 60 + em };
  });
}

export function isNowAllowed(windows: Array<{ startMin: number; endMin: number }>, date = new Date(), tz?: string) {
  // Simplificación: asumimos que el servidor ya corre en TZ correcta.
  // Si no, aquí puedes convertir 'date' a TZ IANA con una lib como luxon.
  const h = date.getHours();
  const m = date.getMinutes();
  const nowMin = h * 60 + m;
  return windows.some(w => nowMin >= w.startMin && nowMin <= w.endMin);
}
