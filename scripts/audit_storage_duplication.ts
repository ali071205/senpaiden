import ws from 'ws';
(globalThis as any).WebSocket = ws;

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false },
  realtime: { transport: ws },
});

function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/\(.*?\)/g, '')
    .replace(/\[.*?\]/g, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

async function runStorageAndDuplicationAudit() {
  console.log(`================================================================`);
  console.log(`  Senpai Den — Storage & Catalog Duplication Cross-Audit        `);
  console.log(`================================================================\n`);

  // 1. Fetch all mangas
  console.log('📦 Fetching all mangas from Supabase...');
  const { data: mangas, error: mErr } = await supabase
    .from('manga')
    .select('id, title, source_id, source_provider, genres, title_i18n, created_at');

  if (mErr || !mangas) {
    console.error('Failed to fetch mangas:', mErr);
    return;
  }
  console.log(`Fetched ${mangas.length} manga records.`);

  // 2. Breakdown by Provider
  const providerCounts: Record<string, number> = {};
  for (const m of mangas) {
    const p = m.source_provider || 'unknown';
    providerCounts[p] = (providerCounts[p] || 0) + 1;
  }

  // 3. Title Normalization & Duplication Check
  const titleMap = new Map<string, any[]>();
  for (const m of mangas) {
    const norm = normalizeTitle(m.title);
    if (!norm) continue;
    if (!titleMap.has(norm)) {
      titleMap.set(norm, []);
    }
    titleMap.get(norm)!.push(m);
  }

  const duplicates: Array<{ norm: string; titles: string[]; count: number; providers: string[]; ids: string[] }> = [];
  for (const [norm, list] of titleMap.entries()) {
    if (list.length > 1) {
      duplicates.push({
        norm,
        titles: list.map((x) => x.title),
        count: list.length,
        providers: list.map((x) => x.source_provider),
        ids: list.map((x) => x.id),
      });
    }
  }

  // 4. Sample Pages Storage Type Audit
  console.log('🔍 Auditing `pages` storage types across database...');
  const { data: samplePages, error: pErr } = await supabase
    .from('pages')
    .select('id, r2_keys')
    .limit(1000);

  let b2OrR2Count = 0;
  let gdriveCount = 0;
  let cdnDirectCount = 0;
  let otherStorageCount = 0;

  if (samplePages && samplePages.length > 0) {
    for (const p of samplePages) {
      const keys: string[] = p.r2_keys || [];
      for (const k of keys) {
        if (k.startsWith('gdrive/')) {
          gdriveCount++;
        } else if (k.startsWith('https://cdn.atsu.moe') || k.startsWith('https://cdn.asurascans.com') || k.startsWith('https://uploads.mangadex.org')) {
          cdnDirectCount++;
        } else if (k.startsWith('http://') || k.startsWith('https://')) {
          cdnDirectCount++;
        } else if (k.includes('backblaze') || k.includes('b2') || k.includes('r2') || (!k.includes('://') && !k.startsWith('gdrive/'))) {
          b2OrR2Count++;
        } else {
          otherStorageCount++;
        }
      }
    }
  }

  // 5. Output Report
  console.log(`\n----------------------------------------------------------------`);
  console.log(`📊 1. PROVIDER BREAKDOWN (Total Titles: ${mangas.length})`);
  console.log(`----------------------------------------------------------------`);
  for (const [p, c] of Object.entries(providerCounts)) {
    console.log(`   • ${p.padEnd(15)} : ${c} titles`);
  }

  console.log(`\n----------------------------------------------------------------`);
  console.log(`💾 2. STORAGE SYSTEM DISTRIBUTION (Pages Audit Sample)`);
  console.log(`----------------------------------------------------------------`);
  console.log(`   • Cloudflare R2 / Backblaze B2 Slices : ${b2OrR2Count} pages`);
  console.log(`   • Google Drive Proxied Slices         : ${gdriveCount} pages`);
  console.log(`   • New Direct CDN Stream (Atsu/Asura/MD): ${cdnDirectCount} pages`);
  if (otherStorageCount > 0) {
    console.log(`   • Other / Unclassified Storage        : ${otherStorageCount} pages`);
  }

  console.log(`\n----------------------------------------------------------------`);
  console.log(`🔄 3. CROSS-SYSTEM DUPLICATION ANALYSIS`);
  console.log(`----------------------------------------------------------------`);
  console.log(`   • Total Unique Titles (Normalized)    : ${titleMap.size}`);
  console.log(`   • Duplicate Title Groups Found        : ${duplicates.length}`);
  console.log(`   • Duplication Percentage              : ${((duplicates.length / mangas.length) * 100).toFixed(2)}%`);

  console.log(`\n📋 Sample Duplicate Titles Across Storage Systems (Top 10):`);
  duplicates.slice(0, 10).forEach((d, idx) => {
    console.log(`\n   [#${idx + 1}] "${d.titles[0]}" (${d.count} records)`);
    console.log(`       Providers: [${d.providers.join(', ')}]`);
    console.log(`       UUIDs:     ${d.ids.join(', ')}`);
  });

  console.log(`\n================================================================`);
  console.log(`🎉 Audit Complete.`);
  console.log(`================================================================`);
}

runStorageAndDuplicationAudit().catch(console.error);
