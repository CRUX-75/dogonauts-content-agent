// src/utils/data-helpers.ts

// Tipo local mínimo que cubre lo que usamos en helpers
export type ProductRow = {
  handle: string;
  name?: string;
  description?: string;
  category?: string;
  price?: number;
};

export function detectBrand(product: ProductRow): string | null {
  const text = `${product.handle ?? ''} ${product.name ?? ''} ${product.description ?? ''}`.toLowerCase();
  if (text.includes('dogonauts')) return 'Dogonauts';
  if (text.includes('botanery')) return 'Botanery';
  return null;
}

export function extractFeatures(product: ProductRow): string[] {
  const features: string[] = [];
  const category = (product.category ?? '').toLowerCase();
  const description = (product.description ?? '').toLowerCase();
  const price = Number.isFinite(product.price as number) ? (product.price as number) : 0;

  if (category.includes('toy')) {
    features.push('Durable', 'Fun and interactive');
  }
  if (description.includes('reflect')) features.push('High visibility');
  if (description.includes('ergonomic')) features.push('Ergonomic fit');

  if (price >= 50) features.push('High-end');
  else if (price > 15) features.push('Value-priced');

  return features;
}
