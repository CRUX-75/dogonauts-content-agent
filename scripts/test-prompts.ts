// scripts/test-prompts.ts
import { generateCaption } from '../src/modules/caption.engine.js';

const testProducts = [
  {
    id: 1,
    name: 'Royal Canin Medium Adult 15kg',
    description: 'Ausgewogenes Trockenfutter für mittelgroße Hunde. Mit Omega-3 und Antioxidantien.',
    price: 54.99
  },
  {
    id: 2,
    name: 'Kong Classic Large',
    description: 'Unzerstörbares Kauspielzeug aus Naturkautschuk. Made in USA. Für starke Kauer.',
    price: 12.99
  },
  {
    id: 3,
    name: 'Ruffwear Front Range Harness',
    description: 'Gepolstertes Hundegeschirr mit reflektierenden Elementen. 5-Punkt-Verteiler.',
    price: 49.99
  },
  {
    id: 4,
    name: "Hill's Science Plan Sensitive Stomach",
    description: 'Für sensible Hunde. Tierärztlich empfohlen. Leicht verdaulich.',
    price: 44.99
  }
];

const styles = ['clean', 'warm', 'fun', 'tech'] as const;

async function testAll() {
  console.log('\n🧪 TESTING SYSTEM PROMPT — DOGONAUTS\n' + '='.repeat(80));
  for (const p of testProducts) {
    console.log(`\n📦 ${p.name} (€${p.price})\n` + '-'.repeat(80));
    for (const s of styles) {
      try {
        const r = await generateCaption(p, s);
        const issues: string[] = [];
        if (r.headline.length > 40) issues.push('Headline > 40');
        if (r.caption.length > 180) issues.push('Caption > 180');
        if (!/#\w/.test(r.caption)) issues.push('Sin hashtags');
        if (/peludo|patitas/i.test(r.caption)) issues.push('Palabra prohibida');

        console.log(`\n🎨 ${s.toUpperCase()}`);
        console.log(`   Headline: "${r.headline}"`);
        console.log(`   Caption:  "${r.caption}"`);
        console.log(issues.length ? `   ⚠️ ${issues.join(', ')}` : '   ✅ OK');
      } catch (e: any) {
        console.log(`   ❌ ERROR: ${e?.message || e}`);
      }
    }
  }
}

async function testSingle() {
  const p = testProducts[0];
  const s = 'tech';
  const r = await generateCaption(p, s);
  console.log('\n🔬 SINGLE\n', JSON.stringify(r, null, 2));
}

const mode = process.argv[2] || 'all';
if (mode === 'single') testSingle();
else testAll();
