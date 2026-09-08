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

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function syncChaptersForManga(manga: any) {
  try {
    let rawChapters: any[] = [];

    // 1. Atsu.moe Chapters
    if (manga.source_provider === 'atsu') {
      const res = await fetch(`https://atsu.moe/api/manga/allChapters?mangaId=${manga.source_id}`, {
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) return;
      const json = await res.json();
      const chs = json.chapters || [];

      rawChapters = chs.map((c: any) => ({
        manga_id: manga.id,
        chapter_number: c.number || c.index || 1,
        title: c.title || `Chapter ${c.number}`,
        source_url: `https://atsu.moe/api/read/chapter?mangaId=${manga.source_id}&chapterId=${c.id}`,
        job_status: 'READY',
        content_freshness: 'fresh',
        language: 'en',
        scanlation_group: 'Official',
      }));
    }

    // 2. Asura Scans Chapters
    else if (manga.source_provider === 'asura') {
      const slug = manga.source_id.replace(/^asura:/, '');
      const res = await fetch(`https://api.asurascans.com/api/series/${slug}/chapters`, {
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) return;
      const json = await res.json();
      const chs = json.data || [];

      rawChapters = chs.map((c: any) => ({
        manga_id: manga.id,
        chapter_number: c.number,
        title: c.title ? `Chapter ${c.number}: ${c.title}` : `Chapter ${c.number}`,
        source_url: `https://api.asurascans.com/api/series/${slug}/chapters/${c.number}`,
        job_status: 'READY',
        content_freshness: 'fresh',
        language: 'en',
        scanlation_group: 'Asura Scans',
      }));
    }

    if (rawChapters.length > 0) {
      // Check existing chapter numbers to avoid duplicate inserts
      const { data: existing } = await supabase
        .from('chapters')
        .select('chapter_number')
        .eq('manga_id', manga.id);
      
      const existingSet = new Set((existing || []).map((e: any) => Number(e.chapter_number)));
      const toInsert = rawChapters.filter((c: any) => !existingSet.has(Number(c.chapter_number)));

      if (toInsert.length > 0) {
        for (let i = 0; i < toInsert.length; i += 100) {
          const batch = toInsert.slice(i, i + 100);
          await supabase.from('chapters').insert(batch);
        }
      }
    }
  } catch (err: any) {
    console.warn(`[Sync Chapters] Error for ${manga.title}:`, err.message);
  }
}

async function main() {
  console.log(`====================================================`);
  console.log(`   Senpai Den — Progressive Chapter Indexer          `);
  console.log(`====================================================`);

  // Fetch all mangas that don't have chapters yet or need sync
  const { data: mangas, error } = await supabase
    .from('manga')
    .select('id, title, source_id, source_provider')
    .in('source_provider', ['atsu', 'asura'])
    .order('created_at', { ascending: false });

  if (error || !mangas) {
    console.error('Error fetching mangas:', error);
    return;
  }

  console.log(`Found ${mangas.length} candidate mangas to sync chapters.`);
  let processed = 0;

  for (const m of mangas) {
    await syncChaptersForManga(m);
    processed++;
    process.stdout.write(`\rSynced chapters: ${processed}/${mangas.length} (${m.title.substring(0, 30)}...)`);
    await sleep(100);
  }

  console.log(`\n\n✅ Finished syncing chapters!`);
}

main().catch(console.error);
