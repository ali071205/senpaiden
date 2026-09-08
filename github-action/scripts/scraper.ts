// ============================================================
// scraper.ts — Main entry point for the GitHub Actions scraper (Phase 2)
// Runs hourly via GitHub Actions cron.
// Discovers manga + chapters via providers, upserts to Supabase.
// On provider blackout: marks READY chapters stale, inserts DLQ.
// ============================================================

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { ProviderOrchestrator } from '../src/providers/ProviderOrchestrator.js';
import type { MangaDiscovery, ChapterDiscovery } from '../src/providers/MangaProvider.js';

import WebSocket from 'ws';

// ── Supabase client (service role — full write access) ──────────────────────
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
  {
    auth: { persistSession: false },
    realtime: { transport: WebSocket as any } // Fix for Node 20 WebSocket support
  }
);

const orchestrator = new ProviderOrchestrator();

// Max pages of manga listings to scrape per run (1 page ≈ 20 manga titles)
const MAX_PAGES = 5;

// ── Helper: log an error to the error_log table ──────────────────────────────
async function logError(provider: string, errorType: string, detail: string, chapterId?: string) {
  const { error } = await supabase.from('error_log').insert({
    provider,
    error_type: errorType,
    error_detail: detail,
    chapter_id: chapterId ?? null,
  });
  if (error) console.error(`[Scraper] Failed to write error_log: ${error.message}`);
}

// ── Helper: insert a DLQ entry ───────────────────────────────────────────────
async function insertDLQ(errorType: string, detail: string, chapterId?: string) {
  const retryBase = parseInt(process.env.DLQ_RETRY_BASE_DELAY_MS ?? '30000', 10);
  const { error } = await supabase.from('dead_letter_queue').insert({
    chapter_id: chapterId ?? null,
    error_type: errorType,
    error_detail: detail,
    retry_count: 0,
    max_retries: parseInt(process.env.DLQ_MAX_RETRIES ?? '3', 10),
    resolved: false,
    next_retry_at: new Date(Date.now() + retryBase).toISOString(),
  });
  if (error) console.error(`[Scraper] Failed to write DLQ: ${error.message}`);
}

// ── Handle dual-provider blackout (AD-001) ────────────────────────────────────
async function handleProviderBlackout(error: string) {
  console.error('[Scraper] PROVIDER BLACKOUT:', error);

  // 1. Log the blackout event
  await logError('orchestrator', 'PROVIDER_BLACKOUT', error);

  // 2. Insert a global DLQ record for the blackout
  await insertDLQ('PROVIDER_BLACKOUT', error);

  // 3. Record system event for the autonomous control plane
  try {
    await supabase.from('system_events').insert({
      event_type: 'SCRAPER_RUN',
      severity: 'ERROR',
      source: 'scraper',
      detail: `Provider blackout encountered: ${error}`,
      metadata: { error },
    });
  } catch (err: any) {
    console.warn('[Scraper] Failed to record system event:', err.message);
  }
}

// ── Upsert a single manga (insert or update if title/cover changed) ──────────
async function upsertManga(manga: MangaDiscovery): Promise<string | null> {
  const { data, error } = await supabase
    .from('manga')
    .upsert(
      {
        source_id:       manga.sourceId,
        source_provider: manga.sourceProvider,
        title:           manga.title,
        cover_url:       manga.coverUrl ?? null,
        genres:          manga.genres ?? [],
        author:          manga.author ?? null,
        status:          manga.status ?? 'ongoing',
        description:     manga.description ?? null,
        updated_at:      new Date().toISOString(),
      },
      { onConflict: 'source_id', ignoreDuplicates: false }
    )
    .select('id')
    .single();

  if (error) {
    console.error(`[Scraper] Failed to upsert manga "${manga.title}": ${error.message}`);
    await logError(manga.sourceProvider, 'UPSERT_MANGA_FAILED', error.message);
    return null;
  }

  return data?.id ?? null;
}

// ── Upsert chapters for a manga (only insert NEW chapters as QUEUED) ──────────
async function upsertChapters(
  mangaId: string,
  mangaSourceId: string,
  chapters: ChapterDiscovery[]
): Promise<{ queued: number; skipped: number }> {
  let queued = 0;
  let skipped = 0;

  for (const ch of chapters) {
    const { error, data } = await supabase
      .from('chapters')
      .upsert(
        {
          manga_id:       mangaId,
          chapter_number: ch.chapterNumber,
          title:          ch.title ?? null,
          source_url:     ch.sourceUrl,
          job_status:     'QUEUED',
          content_freshness: 'fresh',
        },
        {
          // Only insert new chapters; DO NOT overwrite READY/PROCESSING/ARCHIVED
          onConflict: 'manga_id,chapter_number',
          ignoreDuplicates: true,
        }
      )
      .select('id');

    if (error) {
      console.error(`[Scraper] Failed to upsert chapter ${ch.chapterNumber} for manga ${mangaSourceId}: ${error.message}`);
      await logError('scraper', 'UPSERT_CHAPTER_FAILED', error.message);
      skipped++;
    } else if (data && data.length > 0) {
      queued++;
    } else {
      skipped++; // Chapter already existed
    }
  }

  return { queued, skipped };
}

// ── Main scraper loop ─────────────────────────────────────────────────────────
async function main() {
  console.log('[Scraper] ── Starting manga discovery run ──────────────────');

  let totalMangaUpserted = 0;
  let totalChaptersQueued = 0;
  let blackout = false;

  for (let page = 1; page <= MAX_PAGES; page++) {
    console.log(`[Scraper] Fetching page ${page}/${MAX_PAGES}...`);

    const mangaResult = await orchestrator.fetchLatestManga(page);

    if (!mangaResult.success) {
      await handleProviderBlackout(mangaResult.error);
      blackout = true;
      break;
    }

    if (mangaResult.data.length === 0) {
      console.log(`[Scraper] Page ${page} returned 0 manga — stopping pagination.`);
      break;
    }

    console.log(`[Scraper] Page ${page}: ${mangaResult.data.length} manga from ${mangaResult.provider}`);

    for (const manga of mangaResult.data) {
      // Upsert the manga metadata
      const mangaId = await upsertManga(manga);
      if (!mangaId) continue;
      totalMangaUpserted++;

      // Fetch chapter list for this manga
      const chapterResult = await orchestrator.fetchChapterList(manga.sourceId);

      if (!chapterResult.success) {
        console.warn(`[Scraper] Failed to fetch chapters for "${manga.title}": ${chapterResult.error}`);
        await logError(manga.sourceProvider, 'FETCH_CHAPTER_LIST_FAILED', chapterResult.error);
        continue;
      }

      if (chapterResult.data.length === 0) {
        console.log(`[Scraper] No chapters found for "${manga.title}".`);
        continue;
      }

      // Upsert chapters (only new ones become QUEUED; existing ones are untouched)
      const { queued, skipped } = await upsertChapters(mangaId, manga.sourceId, chapterResult.data);
      totalChaptersQueued += queued;
      console.log(`[Scraper] "${manga.title}": +${queued} QUEUED, ${skipped} skipped (already exist).`);
    }
  }

  console.log('[Scraper] ── Run Summary ─────────────────────────────────────');
  if (blackout) {
    console.log('[Scraper] Run ended with PROVIDER BLACKOUT.');
  } else {
    console.log(`[Scraper] Manga upserted:   ${totalMangaUpserted}`);
    console.log(`[Scraper] Chapters queued:  ${totalChaptersQueued}`);
    console.log('[Scraper] Run complete. ✓');

    try {
      await supabase.from('system_events').insert({
        event_type: 'SCRAPER_RUN',
        severity: 'INFO',
        source: 'scraper',
        detail: `Scraper completed successfully. Upserted: ${totalMangaUpserted}, Queued: ${totalChaptersQueued}`,
        metadata: { totalMangaUpserted, totalChaptersQueued },
      });
    } catch (err: any) {
      console.warn('[Scraper] Failed to record system event:', err.message);
    }
  }
}

main().catch((err) => {
  console.error('[Scraper] Fatal unhandled error:', err);
  process.exit(1);
});
