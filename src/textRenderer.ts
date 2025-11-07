import { buildFontCSS } from './fontEmbed.js';

// Función de escape XML compatible (sin usar String.prototype.replaceAll)
function escapeXml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export interface TextBlock {
  x: number; y: number; width: number;
  content: string;
  fontFamily?: 'Montserrat'|'Inter';
  fontWeight?: 400|500|600|700|800|900;
  fontSize?: number;
  fill?: string;
  lineHeight?: number;
  align?: 'left'|'center'|'right';
  shadow?: boolean;
}

export function renderTextSVG(
  canvas: { width: number; height: number },
  blocks: TextBlock[],
  opts?: { fontsDir?: string; background?: string }
) {
  const css = buildFontCSS(opts?.fontsDir ?? './fonts');
  const bg = opts?.background ?? 'transparent';
  const shadowFilter = `
    <filter id="softShadow">
      <feDropShadow dx="0" dy="1" stdDeviation="2" flood-color="#000" flood-opacity="0.3"/>
    </filter>`;

  const items = blocks.map(b => {
    const ff = b.fontFamily ?? 'Inter';
    const fw = b.fontWeight ?? 500;
    const fs = b.fontSize ?? 42;
    const fill = b.fill ?? '#000';
    // Calcula la altura de línea o usa un valor predeterminado
    const lh = b.lineHeight ?? Math.round(fs * 1.25);
    // Determina el anchor y la posición X basada en la alineación
    const anchor = b.align === 'center' ? 'middle' : b.align === 'right' ? 'end' : 'start';
    const x = b.align === 'center' ? b.x + b.width/2 : b.align === 'right' ? b.x + b.width : b.x;

    // Ajusta el texto para que quepa en el ancho
    const lines = wrap(b.content, fs, b.width);
    
    // Crea elementos <tspan> con la función de escape compatible
    const tspans = lines.map((line, i) =>
      `<tspan x="${x}" dy="${i === 0 ? 0 : lh}">${escapeXml(line)}</tspan>`).join(''); // Usa escapeXml

    const filter = b.shadow ? 'filter="url(#softShadow)"' : '';
    return `<text ${filter} x="${x}" y="${b.y}" text-anchor="${anchor}" font-family="${ff}" font-weight="${fw}" font-size="${fs}" fill="${fill}">${tspans}</text>`;
  }).join('\n');

  // Devuelve el SVG completo como Buffer
  return Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" width="${canvas.width}" height="${canvas.height}">
  <defs><style><![CDATA[${css}]]></style>${shadowFilter}</defs>
  <rect width="100%" height="100%" fill="${bg}"/>
  ${items}
</svg>`.trim());
}

/**
 * Función simple de ajuste de línea (word wrap) basada en estimación de caracteres.
 * @param text - El texto a envolver.
 * @param fontSize - Tamaño de fuente (usado para estimación).
 * @param maxWidth - Ancho máximo del bloque.
 */
function wrap(text: string, fontSize: number, maxWidth: number) {
  // Estima la longitud máxima de caracteres por línea basándose en el ancho y el tamaño de fuente
  const maxChars = Math.max(8, Math.floor(maxWidth / (fontSize * 0.6)));
  
  const words = text.split(/\s+/).filter(w => w.length > 0); // Divide y elimina espacios vacíos
  const lines: string[] = [];
  let current = '';
  
  for (const w of words) {
    if (current && (current.length + 1 + w.length) > maxChars) {
      // Si agregar la palabra excede el límite, empuja la línea actual y comienza una nueva
      lines.push(current);
      current = w;
    } else {
      // Si no excede, agrega la palabra a la línea actual
      current = (current ? current + ' ' : '') + w;
    }
  }
  
  // Agrega cualquier texto restante
  if (current) lines.push(current);
  
  return lines;
}