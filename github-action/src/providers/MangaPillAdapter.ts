// ============================================================
// MangaPillAdapter — Primary manga provider HTML DOM scraper
// ============================================================

import { BaseAdapter } from './BaseAdapter.js';
import type { MangaDiscovery, ChapterDiscovery } from './MangaProvider.js';

export class MangaPillAdapter extends BaseAdapter {
  readonly providerName = 'mangapill';
  private readonly baseUrl = 'https://mangapill.com';

  async fetchLatestManga(page: number): Promise<MangaDiscovery[]> {
    const res = await this.throttledFetch(`${this.baseUrl}/?page=${page}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Referer': `${this.baseUrl}/`
      }
    });

    if (!res.ok) throw new Error(`MangaPill fetchLatestManga HTTP ${res.status}`);
    const html = await res.text();

    const matches = [...html.matchAll(/<a href="\/manga\/(\d+)\/([^"]+)"[^>]*>[\s\S]*?<div class="[^"]*font-bold[^"]*">([^<]+)<\/div>/g)];

    return matches.map((match): MangaDiscovery => {
      const id = `${match[1]}/${match[2]}`;
      const title = match[3]?.trim() ?? 'Untitled';
      return {
        sourceId: id,
        sourceProvider: this.providerName,
        title,
        status: 'ongoing',
      };
    });
  }

  async fetchChapterList(mangaId: string): Promise<ChapterDiscovery[]> {
    const res = await this.throttledFetch(`${this.baseUrl}/manga/${mangaId}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Referer': `${this.baseUrl}/`
      }
    });

    if (!res.ok) throw new Error(`MangaPill fetchChapterList HTTP ${res.status} for manga ${mangaId}`);
    const html = await res.text();

    const matches = [...html.matchAll(/href="\/chapters\/([^"]+)"[^>]*>([^<]+)</g)];

    return matches.map((match): ChapterDiscovery => {
      const chapterSlug = match[1];
      const title = match[2]?.trim() ?? '';
      const numMatch = chapterSlug.match(/chapter-([\d.]+)/i);
      const chapterNumber = numMatch ? parseFloat(numMatch[1]) : 0;

      return {
        sourceId: chapterSlug,
        chapterNumber,
        title,
        sourceUrl: `${this.baseUrl}/chapters/${chapterSlug}`,
      };
    });
  }

  async fetchChapterPages(chapterSlug: string): Promise<string[]> {
    const res = await this.throttledFetch(`${this.baseUrl}/chapters/${chapterSlug}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Referer': `${this.baseUrl}/`
      }
    });

    if (!res.ok) throw new Error(`MangaPill fetchChapterPages HTTP ${res.status} for chapter ${chapterSlug}`);
    const html = await res.text();

    const matches = [...html.matchAll(/data-src="([^"]+)"/g)];
    const images = matches.map(m => m[1]).filter((url): url is string => typeof url === 'string' && url.startsWith('http'));

    if (images.length === 0) {
      throw new Error(`MangaPill: No images found for chapter ${chapterSlug}`);
    }

    return images;
  }
}
