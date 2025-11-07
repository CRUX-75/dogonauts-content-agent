// scripts/migrate-sqlite-to-supabase.ts

import Database from 'better-sqlite3';
import { supabase } from '../src/db/supabase';

async function migrate() {
  const sqlite = new Database('./data/db.sqlite', { readonly: true });
  
  console.log('📦 Migrando productos...');
  const products = sqlite.prepare('SELECT * FROM products').all();
  
  for (const product of products) {
    await supabase.from('products').insert({
      handle: product.handle,
      name: product.name,
      description: product.description,
      price: product.price,
      category: product.category,
      brand: product.brand,
      image_url: product.image_url,
      perf_score: product.perf_score || 50,
      last_posted_at: product.last_posted_at,
    });
  }
  
  console.log(`✅ ${products.length} productos migrados`);
  
  // Migrar post_history si existe
  try {
    const posts = sqlite.prepare('SELECT * FROM post_history').all();
    
    for (const post of posts) {
      await supabase.from('post_history').insert({
        product_id: post.product_id,
        style_used: post.style_used,
        headline: post.headline,
        caption: post.caption,
        ig_media_id: post.ig_media_id,
        published_at: post.published_at,
        like_count: post.like_count,
        comment_count: post.comment_count,
      });
    }
    
    console.log(`✅ ${posts.length} posts migrados`);
  } catch (e) {
    console.log('⚠️  No hay post_history para migrar');
  }
  
  sqlite.close();
  console.log('✅ Migración completada');
}

migrate().catch(console.error);