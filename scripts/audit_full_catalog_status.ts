import ws from 'ws';
(globalThis as any).WebSocket = ws;

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

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

async function runAudit() {
  console.log('Fetching mangas...');
  const { data: mangas, error: mErr } = await supabase
    .from('manga')
    .select('id, source_id, source_provider, title, cover_url, genres, author, status, title_i18n, created_at')
    .order('title', { ascending: true });

  if (mErr || !mangas) {
    console.error('Error fetching mangas:', mErr);
    return;
  }
  console.log(`Fetched ${mangas.length} mangas.`);

  console.log('Fetching chapters...');
  let allChapters: any[] = [];
  let offset = 0;
  const limit = 1000;
  while (true) {
    const { data: batch, error: cErr } = await supabase
      .from('chapters')
      .select('id, manga_id, chapter_number, title, source_url, job_status, content_freshness, language, scanlation_group, error_message')
      .range(offset, offset + limit - 1);

    if (cErr) {
      console.error('Error fetching chapters batch:', cErr);
      break;
    }
    if (!batch || batch.length === 0) break;
    allChapters.push(...batch);
    if (batch.length < limit) break;
    offset += limit;
  }
  console.log(`Fetched ${allChapters.length} chapters.`);

  const chaptersByManga = new Map<string, any[]>();
  for (const ch of allChapters) {
    if (!ch.manga_id) continue;
    const list = chaptersByManga.get(ch.manga_id) || [];
    list.push(ch);
    chaptersByManga.set(ch.manga_id, list);
  }

  // Count total pages in db
  const { count: totalPagesCount } = await supabase
    .from('pages')
    .select('*', { count: 'exact', head: true });
  console.log(`Total page records in DB: ${totalPagesCount}`);

  // Fetch sample pages for each manga (first 3 chapters of each manga)
  const sampleChapterIds: string[] = [];
  for (const m of mangas) {
    const chs = chaptersByManga.get(m.id) || [];
    for (const c of chs.slice(0, 3)) {
      sampleChapterIds.push(c.id);
    }
  }

  let samplePages: any[] = [];
  for (let i = 0; i < sampleChapterIds.length; i += 300) {
    const slice = sampleChapterIds.slice(i, i + 300);
    const { data: pBatch } = await supabase
      .from('pages')
      .select('id, chapter_id, page_number, r2_keys, slice_dimensions, blurhash')
      .in('chapter_id', slice);
    if (pBatch) samplePages.push(...pBatch);
  }
  console.log(`Fetched ${samplePages.length} sample pages for verification.`);

  const pagesByChapter = new Map<string, any[]>();
  for (const p of samplePages) {
    if (!p.chapter_id) continue;
    const list = pagesByChapter.get(p.chapter_id) || [];
    list.push(p);
    pagesByChapter.set(p.chapter_id, list);
  }

  // Fetch DLQ count & items
  const { data: dlqItems } = await supabase.from('dead_letter_queue').select('*');
  console.log(`Total DLQ items in DB: ${(dlqItems || []).length}`);

  // Process details per manga
  const results = mangas.map((m) => {
    const chapters = chaptersByManga.get(m.id) || [];
    const totalChapters = chapters.length;

    const readyChapters = chapters.filter(c => c.job_status === 'READY' || c.job_status === 'COMPLETED');
    const queuedChapters = chapters.filter(c => c.job_status === 'QUEUED');
    const processingChapters = chapters.filter(c => c.job_status === 'PROCESSING');
    const failedChapters = chapters.filter(c => c.job_status === 'FAILED');
    const discoveredChapters = chapters.filter(c => c.job_status === 'DISCOVERED');
    const staleRetryChapters = chapters.filter(c => c.job_status === 'STALE_RETRY');

    // Language identification
    const languages = new Set<string>();
    for (const c of chapters) {
      if (c.language) languages.add(c.language);
    }
    const langList = Array.from(languages);
    if (langList.length === 0) langList.push('en');
    const isEnglish = langList.includes('en');

    // Storage and slicing inspection
    let hasGdrive = false;
    let hasR2 = false;
    let hasMangaDex = false;
    let sampleKey = '';
    let validSlicesFound = false;
    let sliceCountPerChapter = 0;

    for (const ch of chapters.slice(0, 5)) {
      const pgs = pagesByChapter.get(ch.id) || [];
      for (const p of pgs) {
        const keys = p.r2_keys || [];
        if (keys.length > 0 && !sampleKey) sampleKey = keys[0];
        for (const k of keys) {
          if (k.startsWith('gdrive/') || k.includes('drive.google.com') || k.includes('googleusercontent')) {
            hasGdrive = true;
          } else if (k.startsWith('manga/') || k.includes('r2.cloudflarestorage') || k.includes('b2')) {
            hasR2 = true;
          } else if (k.includes('mangadex.org')) {
            hasMangaDex = true;
          }
        }
        if (p.slice_dimensions && (Array.isArray(p.slice_dimensions) ? p.slice_dimensions.length > 0 : Object.keys(p.slice_dimensions).length > 0)) {
          validSlicesFound = true;
          if (Array.isArray(p.slice_dimensions)) {
            sliceCountPerChapter = Math.max(sliceCountPerChapter, p.slice_dimensions.length);
          }
        }
      }
    }

    let storageEngine = 'None / Pending';
    if (hasGdrive) storageEngine = 'Google Drive';
    else if (hasR2) storageEngine = 'Cloudflare R2 / B2';
    else if (hasMangaDex) storageEngine = 'MangaDex Direct';
    else if (readyChapters.length > 0) storageEngine = 'Supabase / S3';

    // Readiness determination
    let readinessGrade = '';
    let actionItem = '';

    if (totalChapters === 0) {
      readinessGrade = '🔴 ZERO_EPISODES';
      actionItem = 'Requires scraping/fetching chapters from provider';
    } else if (readyChapters.length === totalChapters && (validSlicesFound || readyChapters.length > 0)) {
      readinessGrade = '🟢 100% READY (INSTANT)';
      actionItem = 'Fully operational — 0 user wait time';
    } else if (readyChapters.length > 0 && readyChapters.length < totalChapters) {
      readinessGrade = `🟡 PARTIALLY_READY (${readyChapters.length}/${totalChapters})`;
      actionItem = `Batch slice remaining ${totalChapters - readyChapters.length} chapters`;
    } else if (queuedChapters.length > 0) {
      readinessGrade = `🟠 QUEUED (${queuedChapters.length} in queue)`;
      actionItem = 'Trigger Hugging Face worker or manual batch scraper';
    } else if (failedChapters.length > 0) {
      readinessGrade = `🔴 FAILED (${failedChapters.length} failed)`;
      actionItem = 'Resolve DLQ errors and retry';
    } else {
      readinessGrade = '⚪ UNPROCESSED';
      actionItem = 'Ingest & process chapters';
    }

    // Chapter min/max
    const chNums = chapters.map(c => Number(c.chapter_number)).filter(n => !isNaN(n)).sort((a, b) => a - b);
    const minCh = chNums.length > 0 ? chNums[0] : 0;
    const maxCh = chNums.length > 0 ? chNums[chNums.length - 1] : 0;

    return {
      title: m.title,
      source_id: m.source_id,
      source_provider: m.source_provider,
      languages: langList.join(', '),
      isEnglish,
      totalChapters,
      chapterRange: totalChapters > 0 ? `${minCh} -> ${maxCh}` : 'N/A',
      readyCount: readyChapters.length,
      queuedCount: queuedChapters.length,
      failedCount: failedChapters.length,
      readinessGrade,
      storageEngine,
      sampleKey,
      slicesVerified: validSlicesFound ? `Yes (~${sliceCountPerChapter || 1} slices/page)` : (readyChapters.length > 0 ? 'Metadata Present' : 'No'),
      actionItem,
    };
  });

  const summary = {
    totalMangaCount: mangas.length,
    englishMangaCount: results.filter(r => r.isEnglish).length,
    fullyReadyMangaCount: results.filter(r => r.readinessGrade.includes('100% READY')).length,
    partiallyReadyMangaCount: results.filter(r => r.readinessGrade.includes('PARTIALLY_READY')).length,
    zeroEpisodeMangaCount: results.filter(r => r.totalChapters === 0).length,
    queuedMangaCount: results.filter(r => r.queuedCount > 0).length,
    failedMangaCount: results.filter(r => r.failedCount > 0).length,
    totalChaptersInDB: allChapters.length,
    totalReadyChapters: allChapters.filter(c => c.job_status === 'READY' || c.job_status === 'COMPLETED').length,
    totalQueuedChapters: allChapters.filter(c => c.job_status === 'QUEUED').length,
    totalFailedChapters: allChapters.filter(c => c.job_status === 'FAILED').length,
    totalDlqItems: (dlqItems || []).length,
  };

  const finalReport = {
    summary,
    mangas: results,
  };

  fs.writeFileSync(path.join(__dirname, 'full_catalog_audit_results.json'), JSON.stringify(finalReport, null, 2));
  console.log('\n=== AUDIT SUMMARY ===');
  console.log(JSON.stringify(summary, null, 2));
}

runAudit().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});
