// src/templates/captions.ts
export type CaptionStyle = 'SEASONAL' | 'UGC' | 'NEW_IN_STORE';

export type CaptionContext = {
  productName: string;
  brand?: string;
  benefit?: string;
  hashtagBase?: string[];   // ej. ['#dogonauts', '#perrosfelices']
  season?: 'winter' | 'spring' | 'summer' | 'autumn';
  tone?: 'friendly' | 'premium' | 'playful' | 'minimal';
};

const joinTags = (tags?: string[]) => (tags?.length ? '\n' + tags.join(' ') : '');

export function renderCaption(style: CaptionStyle, ctx: CaptionContext): string {
  const tags = joinTags(ctx.hashtagBase);

  switch (style) {
    case 'SEASONAL': {
      const s = ctx.season ?? 'winter';
      const line = s === 'winter'
        ? `Listo para el frío: ${ctx.productName} mantiene a tu compañero cálido y seco.`
        : s === 'summer'
        ? `Días largos y aventuras: ${ctx.productName} te acompaña sin perder estilo.`
        : s === 'spring'
        ? `Sale al parque con ligereza: ${ctx.productName} y tú, equipo perfecto.`
        : `Colores y hojas: ${ctx.productName} combina comodidad y carácter.`;
      return `${line}\n${ctx.benefit ?? ''}${tags}`.trim();
    }

    case 'UGC':
      return `¿Lo probaste ya? ${ctx.productName} en acción — comparte tu momento y etiqueta a ${ctx.brand ?? 'Dogonauts'} para aparecer en nuestras historias.${tags}`;

    case 'NEW_IN_STORE':
      return `Nuevo en tienda: ${ctx.productName}.\nLigero, funcional y pensado para paseos reales. ${ctx.benefit ?? ''}${tags}`;

    default:
      return `${ctx.productName}${tags}`;
  }
}

// Helper: seleccionar estilo por campaña
export function pickStyleByCampaign(campaign?: string): CaptionStyle {
  if (!campaign) return 'NEW_IN_STORE';
  const key = campaign.toLowerCase();
  if (/(invierno|winter|navidad|xmas)/i.test(key)) return 'SEASONAL';
  if (/(ugc|comunidad|review|reseña)/i.test(key)) return 'UGC';
  return 'NEW_IN_STORE';
}
