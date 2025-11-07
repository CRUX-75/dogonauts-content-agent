export const COLORS = {
  navy: '#2C4356',
  orange: '#F5A954',
  cream: '#F4E4D4',
  spaceBlue: '#0B1B31',
  neonYellow: '#F2F85C',
  white: '#FFFFFF',
  black: '#000000'
} as const;

export const FONT_SYSTEM = {
  primary: {
    name: 'Montserrat',
    weights: { bold: 700, extrabold: 800, black: 900 }
  },
  secondary: {
    name: 'Inter',
    weights: { regular: 400, medium: 500, semibold: 600 }
  }
} as const;

export const GRID = {
  canvas: {
    feed: { width: 1080, height: 1080 },
    story: { width: 1080, height: 1920 },
    carousel: { width: 1080, height: 1350 }
  },
  margins: { safe: 60, content: 80, elements: 40 },
  zones: { header: 0.15, content: 0.65, footer: 0.20 }
} as const;

export type OverlayPosition =
  | 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' | 'center';

export interface BrandOverlayConfig {
  logo: { position: OverlayPosition; size: number; opacity: number; margin: number };
  watermark?: { type: 'logo-fade' | 'pattern'; opacity: number; blend?: 'multiply'|'overlay' };
  badge?: { position: OverlayPosition; size: number };
}

export const OVERLAYS = {
  productSpotlight: {
    logo: { position: 'top-right', size: 120, opacity: 1.0, margin: 50 },
    watermark: { type: 'pattern', opacity: 0.05, blend: 'multiply' }
  },
  educational: {
    logo: { position: 'top-left', size: 100, opacity: 0.95, margin: 40 }
  },
  promotional: {
    logo: { position: 'center', size: 200, opacity: 1.0, margin: 0 },
    badge: { position: 'top-right', size: 80 }
  },
  story: {
    logo: { position: 'top-left', size: 80, opacity: 1.0, margin: 30 }
  }
} as const;

export const LOGO_FILES = {
  circular: 'dogonauts-logo-circle-1024.png',
  badge: 'dogonauts-badge-500.png'
} as const;

export const PATHS = {
  assetsRoot: './assets',
  patterns: './assets/patterns',
  fonts: './fonts',
  outDir: './out'
} as const;

export type ImageVariant = 'feed' | 'story' | 'carousel';
export const VARIANT_SPECS: Record<ImageVariant, { width: number; height: number }> = {
  feed: GRID.canvas.feed,
  story: GRID.canvas.story,
  carousel: GRID.canvas.carousel
};

export function getColor<K extends keyof typeof COLORS>(key: K) { return COLORS[key]; }
export function getVariantSize(variant: ImageVariant) { return VARIANT_SPECS[variant]; }
