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

// Kanji / Hiragana / Katakana regex
const cjkRegex = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/;
const hangulRegex = /[\uac00-\ud7af\u1100-\u11ff]/;

async function auditChapterLanguages() {
  console.log('Fetching all manga titles...');
  const { data: mangas, error: mErr } = await supabase
    .from('manga')
    .select('id, title, source_id, source_provider')
    .order('title', { ascending: true });

  if (mErr || !mangas) {
    console.error('Failed to fetch mangas:', mErr);
    return;
  }
  console.log(`Auditing chapters for all ${mangas.length} manga titles...\n`);

  // Fetch chapters for all manga
  let allChapters: any[] = [];
  let offset = 0;
  const limit = 1000;
  while (true) {
    const { data: batch, error: cErr } = await supabase
      .from('chapters')
      .select('id, manga_id, chapter_number, title, source_url, language, scanlation_group')
      .range(offset, offset + limit - 1);

    if (cErr) break;
    if (!batch || batch.length === 0) break;
    allChapters.push(...batch);
    if (batch.length < limit) break;
    offset += limit;
  }

  console.log(`Fetched ${allChapters.length} total chapters.`);

  const chaptersByManga = new Map<string, any[]>();
  for (const ch of allChapters) {
    if (!ch.manga_id) continue;
    const list = chaptersByManga.get(ch.manga_id) || [];
    list.push(ch);
    chaptersByManga.set(ch.manga_id, list);
  }

  const mangaAuditList: any[] = [];
  const nonEnglishMangaList: any[] = [];

  // Inspect each manga
  for (const m of mangas) {
    const chs = chaptersByManga.get(m.id) || [];
    const totalCh = chs.length;

    let cjkChapterTitleCount = 0;
    let hangulChapterTitleCount = 0;
    let englishChapterTitleCount = 0;
    let genericChapterTitleCount = 0; // "Chapter 1", "Ch. 5"

    const sampleChapterTitles: string[] = [];
    const sampleSourceUrls: string[] = [];

    for (const c of chs) {
      const chTitle = (c.title || '').trim();
      if (sampleChapterTitles.length < 5 && chTitle) {
        sampleChapterTitles.push(chTitle);
      }
      if (sampleSourceUrls.length < 3 && c.source_url) {
        sampleSourceUrls.push(c.source_url);
      }

      if (cjkRegex.test(chTitle)) {
        cjkChapterTitleCount++;
      } else if (hangulRegex.test(chTitle)) {
        hangulChapterTitleCount++;
      } else if (/^chapter\s+\d+/i.test(chTitle) || /^ch\.\s*\d+/i.test(chTitle) || !chTitle) {
        genericChapterTitleCount++;
      } else {
        englishChapterTitleCount++;
      }
    }

    // Identify MangaDex chapters vs MangaPill vs other
    let dexChapterIds: string[] = [];
    for (const u of sampleSourceUrls) {
      if (u.includes('mangadex.org/chapter/')) {
        const parts = u.split('mangadex.org/chapter/')[1]?.split('/')[0]?.split('?')[0];
        if (parts) dexChapterIds.push(parts);
      }
    }

    const hasCJK = cjkChapterTitleCount > 0;
    const hasHangul = hangulChapterTitleCount > 0;

    const reportItem = {
      id: m.id,
      title: m.title,
      source_provider: m.source_provider,
      totalChapters: totalCh,
      cjkChapterTitleCount,
      hangulChapterTitleCount,
      englishChapterTitleCount,
      genericChapterTitleCount,
      sampleChapterTitles,
      sampleSourceUrls,
      dexChapterIds,
      hasNonEnglishChapterTitles: hasCJK || hasHangul,
    };

    mangaAuditList.push(reportItem);
    if (hasCJK || hasHangul) {
      nonEnglishMangaList.push(reportItem);
    }
  }

  console.log(`\n=== CHAPTER TITLE LANGUAGE AUDIT ===`);
  console.log(`Total Manga Checked: ${mangaAuditList.length}`);
  console.log(`Manga with Japanese/Chinese chapter titles (CJK characters): ${mangaAuditList.filter(m => m.cjkChapterTitleCount > 0).length}`);
  console.log(`Manga with Korean chapter titles (Hangul characters): ${mangaAuditList.filter(m => m.hangulChapterTitleCount > 0).length}`);
  console.log(`Manga with English/Generic numbered chapter titles: ${mangaAuditList.filter(m => m.cjkChapterTitleCount === 0 && m.hangulChapterTitleCount === 0).length}`);

  console.log('\n--- SAMPLE MANGA WITH CJK / NON-ENGLISH CHAPTER TITLES ---');
  console.table(nonEnglishMangaList.slice(0, 20).map(m => ({
    title: m.title.slice(0, 30),
    totalCh: m.totalChapters,
    cjkTitles: m.cjkChapterTitleCount,
    hangulTitles: m.hangulChapterTitleCount,
    sample: m.sampleChapterTitles.slice(0, 2).join(' | ')
  })));

  fs.writeFileSync(path.join(__dirname, 'chapter_languages_audit.json'), JSON.stringify(mangaAuditList, null, 2));
}

auditChapterLanguages().then(() => process.exit(0)).catch(console.error);
