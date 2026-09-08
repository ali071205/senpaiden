// ============================================================
// ProviderOrchestrator — Primary & Fallback Ingestion Orchestrator
// Strategy: MangaPill first → MangaDex on failure → DLQ on both failure
//
// Returns wrapped results: { success, data, error, provider }
// This contract is consumed by scraper.ts
// ============================================================

import type { MangaProvider, MangaDiscovery, ChapterDiscovery } from './MangaProvider.js';
import { MangaPillAdapter } from './MangaPillAdapter.js';
import { MangaDexAdapter } from './MangaDexAdapter.js';

export interface OrchestratorResult<T> {
  success: boolean;
  data: T;
  error: string;
  provider: string;
}

export class ProviderOrchestrator {
  private providers: MangaProvider[];

  constructor(customProviders?: MangaProvider[]) {
    this.providers = customProviders ?? [new MangaPillAdapter(), new MangaDexAdapter()];
  }

  async fetchLatestManga(page: number = 1): Promise<OrchestratorResult<MangaDiscovery[]>> {
    const errors: string[] = [];

    for (const provider of this.providers) {
      try {
        console.log(`[Orchestrator] Fetching latest manga via ${provider.providerName}...`);
        const results = await provider.fetchLatestManga(page);
        if (results.length > 0) {
          return { success: true, data: results, error: '', provider: provider.providerName };
        }
      } catch (err: any) {
        const msg = `${provider.providerName}: ${err.message || String(err)}`;
        console.warn(`[Orchestrator] Provider failed latest fetch: ${msg}`);
        errors.push(msg);
      }
    }

    return {
      success: false,
      data: [],
      error: `All providers failed: ${errors.join(' | ')}`,
      provider: 'none',
    };
  }

  async fetchChapterList(mangaSourceId: string): Promise<OrchestratorResult<ChapterDiscovery[]>> {
    const errors: string[] = [];

    for (const provider of this.providers) {
      try {
        const chapters = await provider.fetchChapterList(mangaSourceId);
        if (chapters.length > 0) {
          return { success: true, data: chapters, error: '', provider: provider.providerName };
        }
      } catch (err: any) {
        const msg = `${provider.providerName}: ${err.message || String(err)}`;
        console.warn(`[Orchestrator] Provider failed chapter list for ${mangaSourceId}: ${msg}`);
        errors.push(msg);
      }
    }

    return {
      success: false,
      data: [],
      error: `All providers failed for ${mangaSourceId}: ${errors.join(' | ')}`,
      provider: 'none',
    };
  }

  async fetchChapterPages(chapterId: string): Promise<OrchestratorResult<string[]>> {
    const errors: string[] = [];

    for (const provider of this.providers) {
      try {
        const pages = await provider.fetchChapterPages(chapterId);
        if (pages.length > 0) {
          return { success: true, data: pages, error: '', provider: provider.providerName };
        }
      } catch (err: any) {
        const msg = `${provider.providerName}: ${err.message || String(err)}`;
        console.warn(`[Orchestrator] Provider failed chapter pages for ${chapterId}: ${msg}`);
        errors.push(msg);
      }
    }

    return {
      success: false,
      data: [],
      error: `All providers failed for chapter ${chapterId}: ${errors.join(' | ')}`,
      provider: 'none',
    };
  }
}
