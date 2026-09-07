import { createClient } from '@supabase/supabase-js';
import ws from 'ws';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!, {
  auth: { persistSession: false },
  realtime: { transport: ws },
});

async function checkHealth() {
  console.log('=====================================================');
  console.log('🔍 SENPAI DEN MANGA CATALOG & SLICE HEALTH CHECK');
  console.log('=====================================================\n');

  // 1. Fetch all mangas
  const { data: mangas, error: mErr } = await supabase
    .from('manga')
    .select('id, title, source_id, status');

  if (mErr || !mangas) {
    console.error('Failed to fetch manga table:', mErr);
    return;
  }

  console.log(`Total Manga Series in Database: ${mangas.length}\n`);

  // 2. Fetch all chapters grouped with job status in one quick query
  const { data: allChapters, error: cErr } = await supabase
    .from('chapters')
    .select('id, manga_id, chapter_number, job_status');

  if (cErr || !allChapters) {
    console.error('Failed to fetch chapters table:', cErr);
    return;
  }

  console.log(`Total Chapters in Database: ${allChapters.length}`);

  // Build chapter lookup by manga_id
  const chaptersByManga = new Map<string, typeof allChapters>();
  for (const ch of allChapters) {
    if (!ch.manga_id) continue;
    const list = chaptersByManga.get(ch.manga_id) || [];
    list.push(ch);
    chaptersByManga.set(ch.manga_id, list);
  }

  // Sample page keys for the first chapter of each manga in parallel
  const sampleChapterIds: string[] = [];
  const mangaFirstChapterMap = new Map<string, string>();

  for (const m of mangas) {
    const chs = chaptersByManga.get(m.id);
    if (chs && chs.length > 0) {
      sampleChapterIds.push(chs[0].id);
      mangaFirstChapterMap.set(m.id, chs[0].id);
    }
  }

  const { data: samplePages } = await supabase
    .from('pages')
    .select('chapter_id, r2_keys')
    .in('chapter_id', sampleChapterIds.slice(0, 100));

  const pagesByChapter = new Map<string, typeof samplePages>();
  for (const p of (samplePages || [])) {
    if (!p.chapter_id) continue;
    const list = pagesByChapter.get(p.chapter_id) || [];
    list.push(p);
    pagesByChapter.set(p.chapter_id, list);
  }

  const report: Array<{
    title: string;
    totalChapters: number;
    readyChapters: number;
    sampleStorage: string;
    status: string;
  }> = [];

  let withChaptersCount = 0;
  let zeroChaptersCount = 0;

  for (const m of mangas) {
    const chs = chaptersByManga.get(m.id) || [];
    const totalCh = chs.length;
    const readyCh = chs.filter(c => c.job_status === 'READY' || c.job_status === 'COMPLETED').length;

    if (totalCh > 0) withChaptersCount++;
    else zeroChaptersCount++;

    const firstChId = mangaFirstChapterMap.get(m.id);
    const pgs = firstChId ? pagesByChapter.get(firstChId) : undefined;
    let sampleStorage = 'Unknown';
    if (!totalCh) sampleStorage = 'No Chapters';
    else if (pgs && pgs.length > 0) {
      const key = pgs[0]?.r2_keys?.[0] || '';
      if (key.startsWith('gdrive/')) sampleStorage = 'Google Drive';
      else if (key.includes('mangadex')) sampleStorage = 'MangaDex';
      else if (key) sampleStorage = 'S3 / R2';
      else sampleStorage = 'Empty Pages';
    } else {
      sampleStorage = 'Ready (Pending Sample Page)';
    }

    report.push({
      title: m.title.length > 30 ? m.title.substring(0, 27) + '...' : m.title,
      totalChapters: totalCh,
      readyChapters: readyCh,
      sampleStorage,
      status: totalCh > 0 ? '✅ Has Chapters' : '❌ Zero Chapters',
    });
  }

  console.table(report.slice(0, 40));

  console.log(`\n=====================================================`);
  console.log(`📊 CATALOG BREAKDOWN:`);
  console.log(`- Total Manga in DB: ${mangas.length}`);
  console.log(`- Mangas with Chapters: ${withChaptersCount}`);
  console.log(`- Mangas with 0 Chapters: ${zeroChaptersCount}`);
  console.log(`- Total Chapters across all Mangas: ${allChapters.length}`);
  console.log(`- Total Ready Chapters: ${allChapters.filter(c => c.job_status === 'READY' || c.job_status === 'COMPLETED').length}`);
  console.log(`=====================================================`);
}

checkHealth().catch(console.error);
