// scripts/ensure-assets.ts
import fs from 'fs';
import path from 'path';

const requiredFonts = [
  'Montserrat-Bold.ttf',
  'Montserrat-ExtraBold.ttf',
  'Montserrat-Black.ttf',
  'Inter-Regular.ttf',
  'Inter-Medium.ttf',
  'Inter-SemiBold.ttf'
].map(f => path.join('fonts', f));

const requiredAssets = [
  'dogonauts-logo-circle-1024.png',
  'dogonauts-badge-500.png',
  'sample-product.jpg'
].map(f => path.join('assets', f));

const requiredPatterns = [
  'stars-pattern.svg',
  'paws-pattern.svg'
].map(f => path.join('assets', 'patterns', f));

const missing: string[] = [];
for (const f of [...requiredFonts, ...requiredAssets, ...requiredPatterns]) {
  if (!fs.existsSync(f)) missing.push(f);
}

if (missing.length) {
  console.error('❌ Faltan archivos necesarios:\n' + missing.map(m => ' - ' + m).join('\n'));
  process.exit(1);
} else {
  console.log('✔ Assets y fuentes OK');
}
