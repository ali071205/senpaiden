// ============================================================
// BaseAdapter — Abstract base for all provider adapters (Phase 2)
// Enforces: 2 req/s throttle, UA rotation, 100 req/run hard cap
// Architecture Decision: AD-005
// ============================================================

import type { MangaProvider, MangaDiscovery, ChapterDiscovery } from './MangaProvider.js';

// Rotate through 5 common browser UAs to avoid fingerprinting
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1',
];



export abstract class BaseAdapter implements MangaProvider {
  abstract readonly providerName: string;

  // Promise chain queue enforces sequential, delayed requests
  private requestQueue: Promise<unknown> = Promise.resolve();
  private requestCount = 0;

  /**
   * Throttled fetch: enforces 2 req/s and 100 req/run limits.
   * Uses a promise chain (not setInterval) for precise serialization.
   */
  protected async throttledFetch(url: string, init?: RequestInit): Promise<Response> {
    // Read lazily so tests can override process.env values per-test
    const maxRequests = parseInt(process.env.MAX_REQUESTS_PER_RUN ?? '100', 10);
    const delayMs    = parseInt(process.env.REQUEST_DELAY_MS    ?? '500', 10);
    const maxRetries = parseInt(process.env.REQUEST_MAX_RETRIES ?? '3', 10);

    if (this.requestCount >= maxRequests) {
      throw new Error(
        `[${this.providerName}] Rate limit hit: max ${maxRequests} requests per run reached.`
      );
    }

    const result = this.requestQueue.then(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, delayMs));

      let lastError: any = null;
      let lastResponse: Response | null = null;

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        if (attempt > 0) {
          const baseDelay = parseInt(process.env.REQUEST_RETRY_BASE_MS ?? '1000', 10);
          const backoff = Math.min(baseDelay * Math.pow(2, attempt - 1) + Math.random() * 200, 10000);
          console.warn(`[${this.providerName}] Retrying request (${attempt}/${maxRetries}) after ${Math.round(backoff)}ms: ${url}`);
          await new Promise<void>((resolve) => setTimeout(resolve, backoff));
        }

        const ua = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)]!;
        const defaultHeaders: Record<string, string> = {
          'User-Agent': ua,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate, br',
          'DNT': '1',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
        };

        const mergedHeaders = { ...defaultHeaders, ...(init?.headers as Record<string, string> ?? {}) };

        try {
          const response = await fetch(url, {
            ...init,
            headers: mergedHeaders,
            signal: init?.signal ?? AbortSignal.timeout(15000),
          });

          // Retry on 429 (Rate Limit) or 5xx (Server Error)
          if (response.status === 429 || (response.status >= 500 && response.status <= 504)) {
            lastResponse = response;
            continue;
          }

          this.requestCount++;
          console.log(`[${this.providerName}] Req ${this.requestCount}/${maxRequests}: ${url} → ${response.status}`);
          return response;
        } catch (err: any) {
          lastError = err;
          if (attempt === maxRetries) {
            break;
          }
        }
      }

      this.requestCount++;
      if (lastResponse) {
        console.warn(`[${this.providerName}] Req ${this.requestCount}/${maxRequests}: ${url} → ${lastResponse.status} (exhausted ${maxRetries} retries)`);
        return lastResponse;
      }
      throw lastError || new Error(`[${this.providerName}] Failed to fetch ${url} after ${maxRetries} retries`);
    });

    // Swallow errors in the chain so the queue doesn't stall
    this.requestQueue = result.then(() => undefined, () => undefined);
    return result as Promise<Response>;
  }

  /**
   * Normalizes dirty genres from upstream providers into a clean set of core genres.
   */
  protected normalizeGenres(rawGenres: string[] | undefined): string[] {
    if (!rawGenres || rawGenres.length === 0) return [];
    
    // Comprehensive mapping dictionary to fix dirty data across all manga/manhwa/manhua
    const GENRE_MAP: Record<string, string> = {
      // Sci-Fi / Cyberpunk
      'science fiction': 'Sci-Fi',
      'sci fi': 'Sci-Fi',
      'sci-fi': 'Sci-Fi',
      'cyberpunk': 'Sci-Fi',
      'mecha': 'Sci-Fi',
      
      // Demographics & Base
      'shounen': 'Action',
      'shojo': 'Romance',
      'shoujo': 'Romance',
      'seinen': 'Drama',
      'josei': 'Drama',
      
      // Action & Martial Arts
      'martial arts': 'Action',
      'wuxia': 'Action',
      'xianxia': 'Action',
      'cultivation': 'Action',
      
      // Isekai & Reincarnation
      'isekai': 'Isekai',
      'reincarnation': 'Isekai',
      'transmigration': 'Isekai',
      'time travel': 'Isekai',
      'system': 'Isekai',
      
      // Fantasy & Supernatural
      'magic': 'Fantasy',
      'supernatural': 'Supernatural',
      'demons': 'Supernatural',
      'vampires': 'Supernatural',
      'zombies': 'Supernatural',
      'monsters': 'Fantasy',
      'ghosts': 'Supernatural',
      
      // Romance
      'romcom': 'Romance',
      'romance': 'Romance',
      
      // Mature & NSFW
      'ecchi': 'Mature',
      'smut': 'Mature',
      'mature': 'Mature',
      'adult': 'Mature',
      'hentai': 'Mature',
      '18+': 'Mature',
      
      // LGBTQ+
      'boys love': 'BL',
      'bl': 'BL',
      'yaoi': 'BL',
      'shounen ai': 'BL',
      'shounen-ai': 'BL',
      'girls love': 'GL',
      'gl': 'GL',
      'yuri': 'GL',
      'shoujo ai': 'GL',
      'shoujo-ai': 'GL',
      
      // School & Slice of Life
      'school life': 'School Life',
      'school': 'School Life',
      'slice of life': 'Slice of Life',
      'everyday': 'Slice of Life',
      
      // General
      'comedy': 'Comedy',
      'horror': 'Horror',
      'mystery': 'Mystery',
      'psychological': 'Psychological',
      'thriller': 'Thriller',
      'tragedy': 'Tragedy',
      'historical': 'Historical',
      'sports': 'Sports',
      'cooking': 'Slice of Life',
      'medical': 'Drama',
      
      // Formats (often tagged as genres)
      'webtoon': 'Webtoon',
      'manhwa': 'Webtoon',
      'manhua': 'Webtoon',
      'colored': 'Webtoon',
      'full color': 'Webtoon'
    };

    const validGenres = new Set<string>();

    rawGenres.forEach(g => {
      const lower = g.trim().toLowerCase();
      if (!lower) return;
      
      const mapped = GENRE_MAP[lower];
      if (mapped) {
        validGenres.add(mapped);
      } else {
        // Fallback: Capitalize first letter of each word
        const formatted = lower.replace(/\b\w/g, c => c.toUpperCase());
        validGenres.add(formatted);
      }
    });

    return Array.from(validGenres);
  }

  // Abstract methods — implemented by concrete adapters
  abstract fetchLatestManga(page: number): Promise<MangaDiscovery[]>;
  abstract fetchChapterPages(chapterId: string): Promise<string[]>;
  abstract fetchChapterList(mangaId: string): Promise<ChapterDiscovery[]>;
}
