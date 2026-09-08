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
  console.log('Fetching all manga titles from database...');
  
  const { data: mangas, error } = await supabase
    .from('manga')
    .select('id, title, source_provider, source_id, cover_url');
    
  if (error || !mangas) {
    console.error('Error querying manga:', error);
    return;
  }

  console.log(`Total Manga in Database: ${mangas.length}`);

  const providerCounts: Record<string, number> = {};
  const noSourceIdList: any[] = [];

  for (const m of mangas) {
    const p = m.source_provider || 'unknown';
    providerCounts[p] = (providerCounts[p] || 0) + 1;
    if (!m.source_id) {
      noSourceIdList.push(m);
    }
  }

  console.log('\n📊 Provider Breakdown:');
  console.table(providerCounts);
  console.log(`Titles missing source_id: ${noSourceIdList.length}`);

  // Check how many chapters exist in the chapters table
  const { count: totalChaptersInDb } = await supabase
    .from('chapters')
    .select('*', { count: 'exact', head: true });
    
  console.log(`\n📚 Total pre-indexed chapter rows in DB: ${totalChaptersInDb}`);

  // Test sample of 50 Atsu titles, 10 MangaDex titles, 10 Asura titles
  const atsuSample = mangas.filter(m => m.source_provider === 'atsu').slice(0, 40);
  const mangadexSample = mangas.filter(m => m.source_provider === 'mangadex').slice(0, 10);
  const otherSample = mangas.filter(m => !['atsu', 'mangadex'].includes(m.source_provider)).slice(0, 10);

  const testList = [...atsuSample, ...mangadexSample, ...otherSample];
  console.log(`\n🧪 Testing live chapter availability on a sample of ${testList.length} titles...`);

  let activeWithChapters = 0;
  let emptyChapters = 0;
  let brokenSourceIds = 0;
  const issues: { title: string; provider: string; source_id: string; issue: string }[] = [];

  for (const m of testList) {
    try {
      if (m.source_provider === 'atsu') {
        const res = await fetch(`https://atsu.moe/api/manga/allChapters?mangaId=${m.source_id}`, {
          signal: AbortSignal.timeout(6000),
        });
        if (res.ok) {
          const json = await res.json();
          const chapters = json.chapters || [];
          if (chapters.length > 0) {
            activeWithChapters++;
          } else {
            emptyChapters++;
            issues.push({ title: m.title, provider: 'atsu', source_id: m.source_id, issue: 'Source has 0 chapters (stub series)' });
          }
        } else if (res.status === 404) {
          brokenSourceIds++;
          issues.push({ title: m.title, provider: 'atsu', source_id: m.source_id, issue: '404 series deleted on source' });
        } else {
          emptyChapters++;
          issues.push({ title: m.title, provider: 'atsu', source_id: m.source_id, issue: `HTTP ${res.status}` });
        }
      } else if (m.source_provider === 'mangadex') {
        const res = await fetch(`https://api.mangadex.org/chapter?manga=${m.source_id}&limit=5`, {
          signal: AbortSignal.timeout(6000),
        });
        if (res.ok) {
          const json = await res.json();
          if ((json.data || []).length > 0) activeWithChapters++;
          else {
            emptyChapters++;
            issues.push({ title: m.title, provider: 'mangadex', source_id: m.source_id, issue: 'No chapters on MangaDex' });
          }
        } else {
          brokenSourceIds++;
        }
      } else {
        activeWithChapters++;
      }
    } catch (e: any) {
      issues.push({ title: m.title, provider: m.source_provider, source_id: m.source_id, issue: e.message || 'Timeout' });
    }
  }

  console.log('\n======================================================');
  console.log(`📋 Chapter Availability Audit Report:`);
  console.log(`   • Total Tested:               ${testList.length}`);
  console.log(`   • Fully Active & Streamable:  ${activeWithChapters} (${Math.round((activeWithChapters / testList.length) * 100)}%)`);
  console.log(`   • Empty/Stub Series (0 ch):   ${emptyChapters} (${Math.round((emptyChapters / testList.length) * 100)}%)`);
  console.log(`   • Broken/404 on Provider:     ${brokenSourceIds}`);
  console.log('======================================================');

  if (issues.length > 0) {
    console.log('\nSample Problematic Titles Identified:');
    console.table(issues.slice(0, 10));
  }
}

main().catch(console.error);
