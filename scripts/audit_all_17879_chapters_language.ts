import ws from 'ws';
(globalThis as any).WebSocket = ws;

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!, {
  auth: { persistSession: false },
});

async function auditAllChapters() {
  console.log('Fetching all 17,879 chapters with manga titles...');
  
  const { data: mangas } = await supabase.from('manga').select('id, title, source_provider');
  const mangaMap = new Map((mangas || []).map(m => [m.id, m]));

  let allChapters: any[] = [];
  let offset = 0;
  const limit = 1000;
  while (true) {
    const { data: batch, error } = await supabase
      .from('chapters')
      .select('id, manga_id, chapter_number, title, source_url, language, scanlation_group')
      .range(offset, offset + limit - 1);

    if (error) break;
    if (!batch || batch.length === 0) break;
    allChapters.push(...batch);
    if (batch.length < limit) break;
    offset += limit;
  }

  console.log(`Fetched ${allChapters.length} chapters.`);

  // 1. Domain distribution of source_urls
  const domainCounts: Record<string, number> = {};
  const languageColCounts: Record<string, number> = {};
  const scanGroups: Record<string, number> = {};

  const nonEnglishSuspects: any[] = [];

  for (const c of allChapters) {
    const m = mangaMap.get(c.manga_id);
    const lang = c.language || 'none';
    languageColCounts[lang] = (languageColCounts[lang] || 0) + 1;

    const group = c.scanlation_group || 'none';
    scanGroups[group] = (scanGroups[group] || 0) + 1;

    let domain = 'unknown';
    try {
      if (c.source_url) {
        domain = new URL(c.source_url).hostname;
      }
    } catch {}
    domainCounts[domain] = (domainCounts[domain] || 0) + 1;

    // Check for non-English keywords in URL or scanlation group or chapter title
    const urlLower = (c.source_url || '').toLowerCase();
    const titleLower = (c.title || '').toLowerCase();
    const groupLower = (c.scanlation_group || '').toLowerCase();

    if (
      urlLower.includes('/raw') ||
      urlLower.includes('-raw') ||
      urlLower.includes('language=ja') ||
      urlLower.includes('language=pt') ||
      urlLower.includes('language=es') ||
      groupLower.includes('spanish') ||
      groupLower.includes('portuguese') ||
      groupLower.includes('french') ||
      groupLower.includes('raws')
    ) {
      nonEnglishSuspects.push({
        manga: m?.title,
        chNum: c.chapter_number,
        title: c.title,
        group: c.scanlation_group,
        url: c.source_url,
      });
    }
  }

  console.log('\n=== CHAPTER SOURCE DOMAIN BREAKDOWN ===');
  console.log(domainCounts);

  console.log('\n=== CHAPTER LANGUAGE COLUMN BREAKDOWN ===');
  console.log(languageColCounts);

  console.log('\n=== TOP SCANLATION GROUPS ===');
  const sortedGroups = Object.entries(scanGroups).sort((a, b) => b[1] - a[1]).slice(0, 15);
  console.log(sortedGroups);

  console.log(`\n=== SUSPECT NON-ENGLISH CHAPTERS FOUND: ${nonEnglishSuspects.length} ===`);
  if (nonEnglishSuspects.length > 0) {
    console.table(nonEnglishSuspects.slice(0, 20));
  } else {
    console.log('Zero non-English URLs or scan groups detected across all 17,879 chapters.');
  }

  // 2. Breakdown per manga
  const mangaChapterSummary: any[] = [];
  const chaptersByManga = new Map<string, any[]>();
  for (const c of allChapters) {
    const list = chaptersByManga.get(c.manga_id) || [];
    list.push(c);
    chaptersByManga.set(c.manga_id, list);
  }

  for (const m of mangas || []) {
    const chs = chaptersByManga.get(m.id) || [];
    const domains = Array.from(new Set(chs.map(c => {
      try { return new URL(c.source_url).hostname; } catch { return 'unknown'; }
    })));

    mangaChapterSummary.push({
      title: m.title,
      totalChapters: chs.length,
      domains: domains.join(', '),
      sampleUrl: chs[0]?.source_url || 'No Chapters',
    });
  }

  fs.writeFileSync(path.join(__dirname, 'manga_chapter_domains.json'), JSON.stringify(mangaChapterSummary, null, 2));
}

auditAllChapters().then(() => process.exit(0)).catch(console.error);
