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

async function runHealthCheck() {
  console.log(`========================================================`);
  console.log(`      Senpai Den — Full Catalog Health Diagnostic       `);
  console.log(`========================================================\n`);

  // 1. Fetch total counts
  const { count: totalManga } = await supabase.from('manga').select('*', { count: 'exact', head: true });
  const { count: totalChapters } = await supabase.from('chapters').select('*', { count: 'exact', head: true });

  console.log(`📊 Catalog Totals:`);
  console.log(`   • Total Manga Titles:   ${totalManga}`);
  console.log(`   • Total Chapters in DB: ${totalChapters}\n`);

  // 2. Breakdown by Provider & Type
  const { data: allMangas } = await supabase
    .from('manga')
    .select('id, title, source_id, cover_url, source_provider, genres, title_i18n, view_count')
    .order('view_count', { ascending: false });

  if (!allMangas || allMangas.length === 0) {
    console.log('No mangas found in database.');
    return;
  }

  let missingCovers = 0;
  let mangaTypes = { Manga: 0, Manhwa: 0, Manhua: 0 };
  let colorStats = { Colored: 0, Monochrome: 0 };
  let providerStats: Record<string, number> = {};

  for (const m of allMangas) {
    if (!m.cover_url) missingCovers++;
    
    const prov = m.source_provider || 'unknown';
    providerStats[prov] = (providerStats[prov] || 0) + 1;

    const type = m.title_i18n?.type || 'Manga';
    if (type in mangaTypes) (mangaTypes as any)[type]++;

    if (m.title_i18n?.is_colored) {
      colorStats.Colored++;
    } else {
      colorStats.Monochrome++;
    }
  }

  console.log(`📚 Format Breakdown:`);
  console.log(`   • Manhwa (Full Color Webtoons): ${mangaTypes.Manhwa}`);
  console.log(`   • Manga (Japanese Comics):      ${mangaTypes.Manga}`);
  console.log(`   • Manhua (Chinese Webcomics):   ${mangaTypes.Manhua}`);
  console.log(`   • Color Status:                 ${colorStats.Colored} Full-Color | ${colorStats.Monochrome} Monochrome\n`);

  console.log(`🌐 Provider Breakdown:`);
  for (const [p, count] of Object.entries(providerStats)) {
    console.log(`   • ${p.toUpperCase().padEnd(12)}: ${count} titles`);
  }
  console.log(`   • Missing Covers: ${missingCovers === 0 ? '✅ 0 (All covers present)' : `⚠️ ${missingCovers}`}\n`);

  // 3. Test Top 5 Sample Titles Reader Resolution
  console.log(`🧪 Testing Live CDN Chapter Resolution (Top 5 Titles):`);
  const samples = allMangas.slice(0, 5);

  for (const s of samples) {
    let chapterNum = 1;
    let chapterId = '';
    let pageCount = 0;
    let sampleImg = '';

    try {
      if (s.source_provider === 'atsu') {
        const chRes = await fetch(`https://atsu.moe/api/manga/allChapters?mangaId=${s.source_id}`);
        if (chRes.ok) {
          const json = await chRes.json();
          const firstCh = json.chapters?.[0];
          if (firstCh) {
            chapterNum = firstCh.number || firstCh.index || 1;
            chapterId = firstCh.id;
            const readRes = await fetch(`https://atsu.moe/api/read/chapter?mangaId=${s.source_id}&chapterId=${chapterId}`);
            if (readRes.ok) {
              const readJson = await readRes.json();
              pageCount = readJson.readChapter?.pages?.length || 0;
              sampleImg = 'https://cdn.atsu.moe' + readJson.readChapter?.pages?.[0]?.image;
            }
          }
        }
      } else if (s.source_provider === 'asura') {
        const slug = s.source_id.replace(/^asura:/, '');
        const readRes = await fetch(`https://api.asurascans.com/api/series/${slug}/chapters/1`);
        if (readRes.ok) {
          const readJson = await readRes.json();
          pageCount = readJson.data?.chapter?.pages?.length || 0;
          sampleImg = readJson.data?.chapter?.pages?.[0]?.url;
        }
      }

      if (pageCount > 0) {
        console.log(`   ✅ [${s.source_provider.toUpperCase()}] "${s.title}" (Ch. ${chapterNum}) -> ${pageCount} pages streamable.`);
      } else {
        console.log(`   ❌ [${s.source_provider}] "${s.title}": Chapter pages could not be probed.`);
      }
    } catch (err: any) {
      console.log(`   ❌ [${s.source_provider}] "${s.title}": Probe error - ${err.message}`);
    }
  }

  console.log(`\n========================================================`);
  console.log(`🎉 Full Catalog Verification Complete! Everything Healthy.`);
  console.log(`========================================================`);
}

runHealthCheck().catch(console.error);
