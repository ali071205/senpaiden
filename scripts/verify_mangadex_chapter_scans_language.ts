import ws from 'ws';
(globalThis as any).WebSocket = ws;

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!, {
  auth: { persistSession: false },
});

async function verifyMangaDexChapterLanguages() {
  console.log('Fetching sample MangaDex chapters from database...');
  
  const { data: chapters } = await supabase
    .from('chapters')
    .select('id, manga_id, chapter_number, title, source_url, language, manga(title)')
    .ilike('source_url', '%mangadex.org/chapter/%')
    .limit(40);

  if (!chapters || chapters.length === 0) {
    console.log('No MangaDex chapters found.');
    return;
  }

  console.log(`Found ${chapters.length} sample MangaDex chapters. Querying MangaDex API to check actual scan languages...\n`);

  const results: any[] = [];
  const languageCounts: Record<string, number> = {};

  for (const c of chapters) {
    const chapterId = c.source_url.split('mangadex.org/chapter/')[1]?.split('/')[0]?.split('?')[0];
    if (!chapterId) continue;

    try {
      // MangaDex API endpoint
      const res = await fetch(`https://api.mangadex.org/chapter/${chapterId}`);
      if (res.ok) {
        const json = await res.json();
        const scanLang = json.data?.attributes?.translatedLanguage || 'unknown';
        const scanTitle = json.data?.attributes?.title || '';
        const pagesCount = json.data?.attributes?.pages || 0;
        
        languageCounts[scanLang] = (languageCounts[scanLang] || 0) + 1;
        results.push({
          manga: (c.manga as any)?.title?.slice(0, 25),
          chNum: c.chapter_number,
          dbLang: c.language,
          scanLang,
          scanTitle,
          pages: pagesCount,
        });
      } else {
        results.push({
          manga: (c.manga as any)?.title?.slice(0, 25),
          chNum: c.chapter_number,
          dbLang: c.language,
          scanLang: `HTTP ${res.status}`,
          scanTitle: '',
          pages: 0,
        });
      }
    } catch (err: any) {
      results.push({
        manga: (c.manga as any)?.title?.slice(0, 25),
        chNum: c.chapter_number,
        dbLang: c.language,
        scanLang: `Fetch Error: ${err.message}`,
        scanTitle: '',
        pages: 0,
      });
    }

    // Small delay to be polite to MangaDex API
    await new Promise(r => setTimeout(r, 200));
  }

  console.table(results);
  console.log('\nMangaDex Actual Scan Language Distribution in Sample:');
  console.log(languageCounts);
}

verifyMangaDexChapterLanguages().then(() => process.exit(0)).catch(console.error);
