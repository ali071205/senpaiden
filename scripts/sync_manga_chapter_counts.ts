import ws from 'ws';
(globalThis as any).WebSocket = ws;

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!, {
  auth: { persistSession: false },
  realtime: { transport: ws },
});

const CONCURRENCY = 12;

async function fetchLatestChapterInfo(manga: any): Promise<{ latest_chapter: number; total_chapters: number } | null> {
  try {
    if (manga.source_provider === 'atsu') {
      const res = await fetch(`https://atsu.moe/api/manga/allChapters?mangaId=${manga.source_id}`, {
        signal: AbortSignal.timeout(6000),
      });
      if (!res.ok) return null;
      const json = await res.json();
      const chs = json.chapters || [];
      if (chs.length === 0) return { latest_chapter: 1, total_chapters: 0 };
      
      const numbers = chs.map((c: any) => parseFloat(c.number ?? c.index ?? 0)).filter((n: number) => !isNaN(n));
      const latest = numbers.length > 0 ? Math.max(...numbers) : chs.length;
      return { latest_chapter: latest, total_chapters: chs.length };
    } 
    
    if (manga.source_provider === 'asura') {
      const slug = (manga.source_id || '').replace(/^asura:/, '');
      const res = await fetch(`https://api.asurascans.com/api/series/${slug}/chapters`, {
        signal: AbortSignal.timeout(6000),
      });
      if (!res.ok) return null;
      const json = await res.json();
      const chs = json.data || [];
      if (chs.length === 0) return { latest_chapter: 1, total_chapters: 0 };

      const numbers = chs.map((c: any) => parseFloat(c.number || 0)).filter((n: number) => !isNaN(n));
      const latest = numbers.length > 0 ? Math.max(...numbers) : chs.length;
      return { latest_chapter: latest, total_chapters: chs.length };
    }

    if (manga.source_provider === 'mangadex') {
      const res = await fetch(`https://api.mangadex.org/chapter?manga=${manga.source_id}&limit=100&translatedLanguage[]=en&order[chapter]=desc`, {
        signal: AbortSignal.timeout(6000),
      });
      if (!res.ok) return null;
      const json = await res.json();
      const chs = json.data || [];
      if (chs.length === 0) return { latest_chapter: 1, total_chapters: 0 };

      const latest = parseFloat(chs[0]?.attributes?.chapter || '1') || 1;
      return { latest_chapter: latest, total_chapters: json.total || chs.length };
    }
  } catch {
    return null;
  }
  return null;
}

async function main() {
  console.log('===============================================================');
  console.log('  Senpai Den — Fast Metadata Chapter Counts Sync Engine        ');
  console.log('===============================================================\n');

  console.log('📦 Loading all manga from Supabase...');
  let allMangas: any[] = [];
  let page = 0;
  const batchSize = 1000;

  while (true) {
    const { data, error } = await supabase
      .from('manga')
      .select('id, title, source_provider, source_id, title_i18n')
      .order('id', { ascending: true })
      .range(page * batchSize, (page + 1) * batchSize - 1);

    if (error || !data || data.length === 0) break;
    allMangas.push(...data);
    page++;
  }

  console.log(`Loaded ${allMangas.length} manga titles.`);

  // Filter those that need chapter counts or refresh all
  const queue = [...allMangas];
  let processed = 0;
  let updatedCount = 0;
  const startTime = Date.now();

  async function worker(workerId: number) {
    while (queue.length > 0) {
      const manga = queue.shift();
      if (!manga) break;

      const info = await fetchLatestChapterInfo(manga);
      if (info && (info.latest_chapter > 0 || info.total_chapters > 0)) {
        const currentMeta = manga.title_i18n || {};
        // Check if update is needed
        if (currentMeta.latest_chapter !== info.latest_chapter || currentMeta.total_chapters !== info.total_chapters) {
          const newMeta = {
            ...currentMeta,
            latest_chapter: info.latest_chapter,
            total_chapters: info.total_chapters,
          };

          await supabase
            .from('manga')
            .update({ title_i18n: newMeta })
            .eq('id', manga.id);

          updatedCount++;
        }
      }

      processed++;
      if (processed % 100 === 0 || processed === allMangas.length) {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        const rate = (processed / ((Date.now() - startTime) / 1000)).toFixed(1);
        console.log(`[Progress] ${processed}/${allMangas.length} titles processed (${updatedCount} updated) | Rate: ${rate} titles/s | Elapsed: ${elapsed}s`);
      }
    }
  }

  console.log(`🚀 Spawning ${CONCURRENCY} concurrent sync workers...\n`);
  const workers = Array.from({ length: CONCURRENCY }, (_, i) => worker(i + 1));
  await Promise.all(workers);

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('\n===============================================================');
  console.log(`🎉 Chapter Count Sync Completed in ${totalTime}s!`);
  console.log(`   • Total Processed: ${processed}`);
  console.log(`   • Metadata Updated: ${updatedCount}`);
  console.log('===============================================================\n');
}

main().catch(console.error);
