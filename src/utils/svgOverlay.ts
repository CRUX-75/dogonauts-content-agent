// svgOverlay.ts
type OverlayOpts = {
  width: number;
  height: number;
  name: string;
  price: number | string;
  brand?: string;

  // Opcionales (con defaults sensatos)
  padX?: number;            // padding horizontal
  padY?: number;            // padding vertical dentro de la banda
  bandHeight?: number;      // alto mínimo de la banda (auto-crece si hay más líneas)
  maxNameLines?: number;    // máximo de líneas para el nombre
  nameFontSize?: number;
  priceFontSize?: number;
  brandFontSize?: number;
  fontFamily?: string;
  bandOpacity?: number;     // opacidad del rectángulo de fondo
  bandColor?: string;       // color del rectángulo de fondo
  textColor?: string;       // color del texto
};

export function buildOverlaySVG(opts: OverlayOpts) {
  const {
    width,
    height,
    name,
    price,
    brand = "Dogonauts",

    padX = 40,
    padY = 24,
    bandHeight = 180,

    maxNameLines = 2,
    nameFontSize = 48,
    priceFontSize = 40,
    brandFontSize = 28,
    fontFamily = "Inter, Arial, sans-serif",

    bandOpacity = 0.45,
    bandColor = "black",
    textColor = "white",
  } = opts;

  // 1) Sanitiza/escapa
  const safeName = escapeXml((name ?? "").toString().trim());
  const safeBrand = escapeXml((brand ?? "").toString().trim());
  const priceStr = typeof price === "number"
    ? formatEuro(price)
    : escapeXml(price.toString().trim().replace(/^€\s*/,"€"));

  // 2) Layout básico
  const contentWidth = width - padX * 2;
  const nameLineHeight = Math.round(nameFontSize * 1.15);
  const priceLineHeight = Math.round(priceFontSize * 1.1);
  const brandLineHeight = Math.round(brandFontSize * 1.1);

  // 3) Wrap del nombre a múltiples líneas (aprox. por ancho de caracteres)
  const nameLines = wrapTextByApproxWidth(safeName, contentWidth, nameFontSize, /*approx char width*/ 0.58, maxNameLines);

  // 4) Calcula alto real necesario
  const textBlockHeight =
    nameLines.length * nameLineHeight +
    Math.max(priceLineHeight, brandLineHeight) + // línea inferior (precio + brand)
    padY * 2;

  const bandH = Math.max(bandHeight, textBlockHeight);
  const bandY = height - bandH;

  // 5) Puntos de texto
  // Nombre empieza en (padX, bandY + padY + nameFontSize)
  const nameStartY = bandY + padY + nameFontSize;

  // Fila inferior (precio izquierda, brand derecha)
  const baselineBottom = bandY + bandH - padY; // baseline de la última línea
  const priceY = baselineBottom - Math.round((priceLineHeight - priceFontSize) / 2);
  const brandY = baselineBottom - Math.round((brandLineHeight - brandFontSize) / 2);

  // 6) SVG
  return `
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <!-- Sombra sutil para mejorar contraste del texto -->
    <filter id="textShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="1" stdDeviation="1" flood-opacity="0.35"/>
    </filter>
  </defs>

  <!-- Banda inferior -->
  <rect x="0" y="${bandY}" width="${width}" height="${bandH}" fill="${bandColor}" fill-opacity="${bandOpacity}"/>

  <!-- Nombre (multilínea) -->
  ${renderMultilineText({
    lines: nameLines,
    x: padX,
    startY: nameStartY,
    lineHeight: nameLineHeight,
    fontSize: nameFontSize,
    fontFamily,
    fill: textColor,
    filter: "url(#textShadow)",
  })}

  <!-- Precio -->
  <text x="${padX}" y="${priceY}" fill="${textColor}" font-size="${priceFontSize}" font-weight="700"
        font-family="${fontFamily}" filter="url(#textShadow)">
    ${escapeXml(priceStr)}
  </text>

  <!-- Marca (alineado derecha) -->
  <text x="${width - padX}" y="${brandY}" text-anchor="end" fill="${textColor}" font-size="${brandFontSize}"
        font-family="${fontFamily}" opacity="0.95" filter="url(#textShadow)">
    ${safeBrand}
  </text>
</svg>`.trim();
}

/* ===== Utils ===== */

function escapeXml(s: string) {
  return s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c]!));
}

// Aproxima el ancho de un carácter: fontSize * approxCharWidth (0.56–0.60 suele ir bien para sans-serif)
function wrapTextByApproxWidth(
  text: string,
  maxWidthPx: number,
  fontSize: number,
  approxCharWidth = 0.58,
  maxLines = 2,
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  const maxCharsPerLine = Math.max(1, Math.floor(maxWidthPx / (fontSize * approxCharWidth)));

  for (const w of words) {
    const test = current ? current + " " + w : w;
    if (test.length <= maxCharsPerLine) {
      current = test;
    } else {
      if (current) lines.push(current);
      current = w;

      if (lines.length === maxLines - 1) {
        // Última línea: recorta y añade ellipsis si aún se desborda
        if (current.length > maxCharsPerLine) {
          current = current.slice(0, Math.max(0, maxCharsPerLine - 1)).trimEnd() + "…";
        }
        lines.push(current);
        return lines;
      }
    }
  }
  if (current) {
    // Si sobra texto y excede, recorta con ellipsis
    if (lines.length >= maxLines) return lines;
    if (current.length > maxCharsPerLine) {
      current = current.slice(0, Math.max(0, maxCharsPerLine - 1)).trimEnd() + "…";
    }
    lines.push(current);
  }
  return lines.slice(0, maxLines);
}

function renderMultilineText(params: {
  lines: string[];
  x: number;
  startY: number;
  lineHeight: number;
  fontSize: number;
  fontFamily: string;
  fill: string;
  filter?: string;
}) {
  const { lines, x, startY, lineHeight, fontSize, fontFamily, fill, filter } = params;
  const tspans = lines
    .map((line, i) => {
      const y = startY + i * lineHeight;
      return `<tspan x="${x}" y="${y}">${escapeXml(line)}</tspan>`;
    })
    .join("");

  return `
<text x="${x}" y="${startY}" fill="${fill}" font-size="${fontSize}" font-weight="600"
      font-family="${fontFamily}" ${filter ? `filter="${filter}"` : ""}>
  ${tspans}
</text>`.trim();
}

function formatEuro(n: number) {
  // Alemania / España: ajusta si prefieres en-GB o fr-FR
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 2 }).format(n);
}
