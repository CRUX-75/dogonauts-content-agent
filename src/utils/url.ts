export function normalizeImageUrl(raw?: string | null): string | null {
  if (!raw) return null;
  const url = String(raw).trim();
  if (!url) return null;
  // Si viene como //cdn... => forzamos https://
  if (url.startsWith("//")) return `https:${url}`;
  // Si viene sin protocolo y sin //, intenta agregar https://
  if (!/^https?:\/\//i.test(url)) return `https://${url}`;
  return url;
}
