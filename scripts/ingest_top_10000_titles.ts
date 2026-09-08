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

// Helper for delay
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Format and color detector
function detectFormatAndColor(doc: any): { format: string; isColored: boolean } {
  const rawType = (doc.type || '').trim().toLowerCase();
  const tags: string[] = doc.tags || [];
  const tagsLower = tags.map((t) => t.toLowerCase());

  let format = 'Manga';
  if (rawType.includes('manwha') || rawType.includes('manhwa')) {
    format = 'Manhwa';
  } else if (rawType.includes('manhua')) {
    format = 'Manhua';
  } else if (rawType.includes('oel') || rawType.includes('comic') || rawType.includes('webtoon')) {
    format = 'Manhwa';
  }

  // All Manhwa and Manhua are full-color webtoons
  let isColored = format === 'Manhwa' || format === 'Manhua';

  // Check tags for color manga
  if (!isColored) {
    if (
      tagsLower.includes('full color') ||
      tagsLower.includes('colored') ||
      tagsLower.includes('color') ||
      tagsLower.includes('webtoon')
    ) {
      isColored = true;
    }
  }

  return { format, isColored };
}

// Clean status to allowed DB enum ('ongoing', 'completed', 'hiatus')
function normalizeStatus(rawStatus?: string): 'ongoing' | 'completed' | 'hiatus' {
  const s = (rawStatus || '').toLowerCase();
  if (s.includes('complete') || s.includes('finished') || s.includes('end')) return 'completed';
  if (s.includes('hiatus') || s.includes('pause') || s.includes('cancel')) return 'hiatus';
  return 'ongoing';
}

async function ingestAtsuCatalog(targetCount = 10000) {
  console.log(`\n🚀 Ingesting Top ${targetCount} Titles from Atsu (Manga, Manhwa, Manhua)...`);

  const perPage = 40;
  const totalPages = Math.ceil(targetCount / perPage);
  let totalIngested = 0;
  let mangaCount = 0;
  let manhwaCount = 0;
  let manhuaCount = 0;
  let coloredCount = 0;

  // Process in chunks of 5 pages concurrently for high throughput
  const chunkSize = 5;
  for (let i = 1; i <= totalPages; i += chunkSize) {
    const pageBatch = Array.from({ length: Math.min(chunkSize, totalPages - i + 1) }, (_, idx) => i + idx);
    
    const results = await Promise.all(
      pageBatch.map(async (page) => {
        const url = `https://atsu.moe/api/search/manga?q=*&query_by=title&page=${page}&perPage=${perPage}&sort_by=views:desc`;
        try {
          const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
          if (!res.ok) return [];
          const data = await res.json();
          return data.hits || [];
        } catch {
          return [];
        }
      })
    );

    const allHits = results.flat();
    if (allHits.length === 0 && i > 1) {
      console.log(`\nReached end of available pages at page ${i}.`);
      break;
    }

    const records = allHits.map((h: any) => {
      const doc = h.document;
      const { format, isColored } = detectFormatAndColor(doc);

      if (format === 'Manga') mangaCount++;
      else if (format === 'Manhwa') manhwaCount++;
      else if (format === 'Manhua') manhuaCount++;
      if (isColored) coloredCount++;

      const genreSet = new Set<string>(doc.tags || []);
      genreSet.add(format);
      if (isColored) genreSet.add('Full Color');

      const posterPath = doc.posterMedium || doc.poster || '';
      const fullCoverUrl = posterPath.startsWith('http')
        ? posterPath
        : posterPath
        ? `https://cdn.atsu.moe${posterPath}`
        : null;

      return {
        source_id: doc.id,
        source_provider: 'atsu',
        title: doc.title,
        cover_url: fullCoverUrl,
        genres: Array.from(genreSet),
        author: null,
        status: normalizeStatus(doc.status),
        description: doc.synopsis || '',
        view_count: doc.views || 0,
        title_i18n: {
          altTitles: doc.altTitles || [],
          type: format,
          is_colored: isColored,
          weebCentralId: doc.weebCentralId || null,
          releaseYear: doc.releaseYear || doc.year || null,
          popularity: doc.popularity || null,
          rank: totalIngested + 1,
        },
      };
    });

    if (records.length > 0) {
      const { error } = await supabase.from('manga').upsert(records, { onConflict: 'source_id' });
      if (error) {
        console.error(`\nSupabase upsert error at pages ${pageBatch[0]}-${pageBatch[pageBatch.length - 1]}:`, error.message);
      } else {
        totalIngested += records.length;
        process.stdout.write(
          `\r[Progress] Ingested: ${totalIngested}/${targetCount} (Manga: ${mangaCount}, Manhwa: ${manhwaCount}, Manhua: ${manhuaCount} | Colored: ${coloredCount})`
        );
      }
    }

    await sleep(200);
  }

  console.log(`\n✅ Finished Atsu Ingestion: ${totalIngested} Titles saved!`);
}

async function ingestAsuraCatalog() {
  console.log(`\n🚀 Ingesting Full Asura Scans Catalog (All Pages)...`);
  let page = 1;
  let totalAsura = 0;

  while (true) {
    try {
      const res = await fetch(`https://api.asurascans.com/api/series?page=${page}`, {
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) break;

      const json = await res.json();
      const seriesList = json.data || [];
      if (seriesList.length === 0) break;

      const records = seriesList.map((s: any) => ({
        source_id: `asura:${s.slug}`,
        source_provider: 'asura',
        title: s.title,
        cover_url: s.cover_url || null,
        genres: ['Manhwa', 'Full Color', 'Action'],
        author: null,
        status: normalizeStatus(s.status),
        description: s.description || '',
        view_count: 500000,
        title_i18n: {
          altTitles: [],
          type: 'Manhwa',
          is_colored: true,
          asuraSlug: s.slug,
        },
      }));

      const { error } = await supabase.from('manga').upsert(records, { onConflict: 'source_id' });
      if (!error) {
        totalAsura += records.length;
        process.stdout.write(`\r[Asura] Ingested: ${totalAsura} series (Page ${page})...`);
      }

      page++;
      await sleep(150);
    } catch {
      break;
    }
  }

  console.log(`\n✅ Ingested ${totalAsura} Asura Manhwas into Supabase!`);
}

async function main() {
  const args = process.argv.slice(2);
  let limit = 10000;
  const limitIdx = args.indexOf('--limit');
  if (limitIdx !== -1 && args[limitIdx + 1]) {
    limit = parseInt(args[limitIdx + 1], 10);
  }

  console.log(`====================================================`);
  console.log(`   Senpai Den — High-Scale Catalog Ingestion Engine  `);
  console.log(`   Target: Top ${limit} Manga, Manhwa, and Manhua    `);
  console.log(`====================================================`);

  await ingestAtsuCatalog(limit);
  await ingestAsuraCatalog();

  // Final count
  const { count: finalMangaCount } = await supabase.from('manga').select('*', { count: 'exact', head: true });
  console.log(`\n🎉 Total Manga Catalog Count in Supabase: ${finalMangaCount} Titles!`);
}

main().catch(console.error);
