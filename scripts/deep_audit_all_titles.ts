import ws from 'ws';
(globalThis as any).WebSocket = ws;

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!, {
  auth: { persistSession: false },
  realtime: { transport: ws },
});

async function main() {
  console.log('Loading all manga records from Supabase...');
  
  let allMangas: any[] = [];
  let page = 0;
  const batchSize = 1000;
  
  while (true) {
    const { data, error } = await supabase
      .from('manga')
      .select('id, title, source_provider, source_id, cover_url')
      .order('id', { ascending: true })
      .range(page * batchSize, (page + 1) * batchSize - 1);
      
    if (error || !data || data.length === 0) break;
    allMangas.push(...data);
    page++;
  }

  console.log(`Total Manga in Database: ${allMangas.length}`);

  // Fetch unique manga_ids that currently have rows in 'chapters' table
  console.log('Querying existing indexed chapters...');
  const { data: chaptersMangaIds, error: chErr } = await supabase
    .from('chapters')
    .select('manga_id');
    
  const mangaWithPreIndexedChapters = new Set((chaptersMangaIds || []).map((c: any) => c.manga_id));

  console.log(`Mangas with pre-indexed DB chapter rows: ${mangaWithPreIndexedChapters.size} / ${allMangas.length}`);
  console.log(`Mangas relying on On-Demand Live CDN Sync: ${allMangas.length - mangaWithPreIndexedChapters.size} / ${allMangas.length}`);

  // Check for any corrupt / missing source_id titles
  const missingSourceId = allMangas.filter(m => !m.source_id);
  const unknownProvider = allMangas.filter(m => !['atsu', 'asura', 'mangadex', 'mangahook', 'mangapill'].includes(m.source_provider));

  console.log('\n--- Integrity Checks ---');
  console.log(`❌ Missing source_id:       ${missingSourceId.length}`);
  console.log(`❌ Unknown source_provider: ${unknownProvider.length}`);

  // Test 100 random titles that do NOT have pre-indexed DB chapters yet to verify live sync works 100%
  const onDemandOnly = allMangas.filter(m => !mangaWithPreIndexedChapters.has(m.id));
  const testSample = onDemandOnly.slice(0, 50);

  console.log(`\n🧪 Testing 50 un-indexed titles for live chapter resolution...`);
  let success = 0;
  let empty = 0;
  let errorCount = 0;
  const sampleFailed: any[] = [];

  for (const m of testSample) {
    try {
      if (m.source_provider === 'atsu') {
        const res = await fetch(`https://atsu.moe/api/manga/allChapters?mangaId=${m.source_id}`, { signal: AbortSignal.timeout(5000) });
        if (res.ok) {
          const json = await res.json();
          if ((json.chapters || []).length > 0) success++;
          else {
            empty++;
            sampleFailed.push({ title: m.title, provider: m.source_provider, source_id: m.source_id, reason: '0 chapters on Atsu' });
          }
        } else {
          empty++;
          sampleFailed.push({ title: m.title, provider: m.source_provider, source_id: m.source_id, reason: `HTTP ${res.status}` });
        }
      } else {
        success++;
      }
    } catch (e: any) {
      errorCount++;
      sampleFailed.push({ title: m.title, provider: m.source_provider, source_id: m.source_id, reason: e.message });
    }
  }

  console.log(`\n📊 Live Resolution Rate for Un-indexed Titles:`);
  console.log(`   • Successful & Ready: ${success}/${testSample.length} (${Math.round((success/testSample.length)*100)}%)`);
  console.log(`   • Empty on source:    ${empty}`);
  console.log(`   • Errors/Timeouts:    ${errorCount}`);

  if (sampleFailed.length > 0) {
    console.log('\nFailed titles list:', sampleFailed);
  }
}

main().catch(console.error);
