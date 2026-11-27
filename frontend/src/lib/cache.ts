import { getSupabase } from './supabase';
import { MATURE_GENRES, isMatureGenre, isMatureManga } from './age-restriction';

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const memoryCache = new Map<string, CacheEntry<any>>();
const maxChapterMemCache = new Map<string, number>();
const inFlightPromises = new Map<string, Promise<any>>();

const SEARCH_ALIASES: Record<string, string> = {
  shippuden: 'naruto',
  'naruto shippuden': 'naruto',
  'naruto sippuden': 'naruto',
  'naruto sippudent': 'naruto',
  aot: 'attack on titan',
  snk: 'shingeki no kyojin',
  jjk: 'jujutsu kaisen',
  mha: 'my hero academia',
  bnha: 'boku no hero academia',
  tbate: 'the beginning after the end',
  sl: 'solo leveling',
};

export function getCached<T>(key: string): T | null {
  const entry = memoryCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    memoryCache.delete(key);
    return null;
  }
  return entry.data;
}

export function setCached<T>(key: string, data: T, ttlSeconds: number = 180): void {
  if (memoryCache.size > 1000) {
    const firstKey = memoryCache.keys().next().value;
    if (firstKey) memoryCache.delete(firstKey);
  }
  memoryCache.set(key, {
    data,
    expiresAt: Date.now() + ttlSeconds * 1000,
  });
}

export async function getCachedMangaList(params: {
  q?: string;
  genre?: string;
  included?: string | string[];
  excluded?: string | string[];
  sort?: string;
  page?: number;
  limit?: number;
  allow18Plus?: boolean;
  matureOnly?: boolean;
}) {
  const { q = '', genre = '', sort = '', page = 1, limit = 24 } = params;

  // Normalize included genres array (stripping any mature genres)
  const incList = Array.isArray(params.included)
    ? params.included
    : (params.included ? params.included.split(',').map((s) => s.trim()).filter(Boolean) : []);
  const normalizedIncluded = Array.from(
    new Set(incList.map((g) => g.trim()).filter((g) => Boolean(g) && !isMatureGenre(g)))
  ).sort();

  // Normalize excluded genres array (ALWAYS include all MATURE_GENRES unconditionally)
  const rawExcList = Array.isArray(params.excluded)
    ? params.excluded
    : (params.excluded ? params.excluded.split(',').map((s) => s.trim()).filter(Boolean) : []);
  const excList = [...rawExcList, ...MATURE_GENRES];
  const normalizedExcluded = Array.from(new Set(excList.map((g) => g.trim()).filter(Boolean))).sort();

  const cacheKey = `manga_list:q=${q}:genre=${genre}:inc=${normalizedIncluded.join(',')}:exc=${normalizedExcluded.join(',')}:sort=${sort}:p=${page}:l=${limit}:safe=1`;
  const cached = getCached<{ data: any[]; total: number; page: number; limit: number }>(cacheKey);
  if (cached) return cached;

  const inFlight = inFlightPromises.get(cacheKey);
  if (inFlight) return inFlight;

  const supabase = getSupabase();
  if (!supabase) return { data: [], total: 0, page, limit };

  const fetchPromise = (async () => {
    const offset = (page - 1) * limit;
    let query: any = supabase
      .from('manga')
    .select('id, title, cover_url, status, genres, description, updated_at, view_count, title_i18n', { count: 'exact' })
    .neq('title', 'm')
    .not('title', 'is', null)
    .not('cover_url', 'is', null)
    .or('title_i18n->disabled.is.null,title_i18n->disabled.eq.false');

  if (sort === 'views' || sort === 'rating' || sort === 'top' || sort === 'popular') {
    query = query.order('view_count', { ascending: false, nullsFirst: false });
  } else {
    query = query.order('updated_at', { ascending: false });
  }
  const rawQ = (q || '').trim().toLowerCase();
  const searchQ = SEARCH_ALIASES[rawQ] || (rawQ.includes('shippuden') || rawQ.includes('sippuden') ? 'naruto' : (q ? q.trim() : ''));

  if (searchQ && searchQ.trim() !== '') {
    query = query.ilike('title', `%${searchQ.trim()}%`);
  }

  // Combined included genres (from param or single genre filter)
  const effectiveIncluded = [...normalizedIncluded];
  if (genre && genre.trim() !== '' && genre !== 'All' && !isMatureGenre(genre) && !effectiveIncluded.some((g) => g.toLowerCase() === genre.toLowerCase())) {
    effectiveIncluded.push(genre);
  }

  if (effectiveIncluded.length > 0) {
    query = query.contains('genres', effectiveIncluded);
  }

  if (normalizedExcluded.length > 0) {
    // Quote genres that contain spaces for proper PostgreSQL array literal parsing
    const pgArray = `{${normalizedExcluded.map((g) => g.includes(' ') ? `"${g}"` : g).join(',')}}`;
    query = query.not('genres', 'ov', pgArray);
  }

  query = query.range(offset, offset + limit - 1);

  const { data, count, error } = await query;
  if (error) {
    console.warn('[Cache] Supabase query error:', error.message);
    return { data: [], total: 0, page, limit };
  }

  // Filter out disabled/broken legacy titles and any mature titles
  const rawList = (data || []).filter(
    (m: any) => !m.title_i18n?.disabled && !m.title_i18n?.is_disabled && !isMatureManga(m.genres)
  );

  // If this is a search query, sort by relevance and views so exact/prefix matches come first
  if (searchQ && searchQ.trim() !== '') {
    const qLower = searchQ.trim().toLowerCase();
    rawList.sort((a: any, b: any) => {
      const titleA = (a.title || '').trim().toLowerCase();
      const titleB = (b.title || '').trim().toLowerCase();

      const exactA = titleA === qLower;
      const exactB = titleB === qLower;
      if (exactA && !exactB) return -1;
      if (!exactA && exactB) return 1;

      const startsA = titleA.startsWith(qLower);
      const startsB = titleB.startsWith(qLower);
      if (startsA && !startsB) return -1;
      if (!startsA && startsB) return 1;

      return (b.view_count || 0) - (a.view_count || 0);
    });
  }

  // Deduplicate by normalized title so identical titles NEVER appear twice in search/catalog
  const seenTitles = new Set<string>();
  const dedupedData: any[] = [];
  for (const item of rawList) {
    const norm = (item.title || '').trim().toLowerCase();
    if (!seenTitles.has(norm)) {
      seenTitles.add(norm);
      dedupedData.push(item);
    }
  }

  let enrichedData = dedupedData;
  if (enrichedData.length > 0) {
    try {
      const mangaIds = enrichedData.map((m: any) => m.id);
      const neededIds = mangaIds.filter((id: string) => !maxChapterMemCache.has(id));

      if (neededIds.length > 0) {
        const { data: chapters } = await supabase
          .from('chapters')
          .select('manga_id, chapter_number')
          .in('manga_id', neededIds)
          .order('chapter_number', { ascending: false });

        for (const ch of chapters || []) {
          const current = maxChapterMemCache.get(ch.manga_id) || 0;
          if (ch.chapter_number > current) {
            maxChapterMemCache.set(ch.manga_id, ch.chapter_number);
          }
        }
      }

      enrichedData = enrichedData.map((m: any) => ({
        ...m,
        latest_chapter_number: maxChapterMemCache.get(m.id) || m.title_i18n?.latest_chapter || m.title_i18n?.total_chapters || 1,
      }));
    } catch {}
  }

    const result = { data: enrichedData, total: count || 0, page, limit };
    setCached(cacheKey, result, 300); // Cache for 5 minutes
    return result;
  })().finally(() => {
    inFlightPromises.delete(cacheKey);
  });

  inFlightPromises.set(cacheKey, fetchPromise);
  return fetchPromise;
}

export async function getCachedGenres() {
  const cacheKey = 'global_genres_list_safe';
  const cached = getCached<{ name: string; slug: string }[]>(cacheKey);
  if (cached) return cached;

  const STANDARD_GENRES = [
    "Action", "Adventure", "Comedy", "Drama", "Fantasy", "Horror", 
    "Isekai", "Martial Arts", "Mystery", "Psychological", "Romance", 
    "Sci-Fi", "Seinen", "Shounen", "Slice of Life", "Sports", 
    "Supernatural", "Thriller", "Tragedy", "Manhwa", "Webtoon"
  ].filter((g) => !isMatureGenre(g)).map(g => ({ name: g, slug: g.toLowerCase().replace(/\s+/g, '-') }));

  const supabase = getSupabase();
  if (!supabase) return STANDARD_GENRES;

  try {
    const { data, error } = await supabase.from('genres').select('name, slug').order('name');
    if (!error && data && data.length > 0) {
      const safeGenres = data.filter((g: any) => !isMatureGenre(g.name));
      setCached(cacheKey, safeGenres, 1800); // 30 minutes
      return safeGenres;
    }
  } catch {}

  setCached(cacheKey, STANDARD_GENRES, 1800);
  return STANDARD_GENRES;
}

export async function getCachedCatalogVectors(_allow18Plus: boolean = false) {
  const cacheKey = `catalog_vectors_data:safe=1`;
  const cached = getCached<any[]>(cacheKey);
  if (cached) return cached;

  const supabase = getSupabase();
  if (!supabase) return [];

  try {
    const pgArray = `{${MATURE_GENRES.map((g) => g.includes(' ') ? `"${g}"` : g).join(',')}}`;
    const query: any = supabase
      .from('manga')
      .select('id, title, cover_url, status, genres, title_i18n')
      .neq('title', 'm')
      .not('cover_url', 'is', null)
      .or('title_i18n->disabled.is.null,title_i18n->disabled.eq.false')
      .not('genres', 'ov', pgArray);

    const { data: initialItems, error } = await query
      .order('view_count', { ascending: false, nullsFirst: false })
      .limit(60);

    if (error || !initialItems) return [];

    const mangaIds = initialItems.map((m: any) => m.id);
    const neededIds = mangaIds.filter((id: string) => !maxChapterMemCache.has(id));

    if (neededIds.length > 0) {
      const { data: chapters } = await supabase
        .from('chapters')
        .select('manga_id, chapter_number')
        .in('manga_id', neededIds);

      for (const ch of chapters || []) {
        const current = maxChapterMemCache.get(ch.manga_id) || 0;
        if (ch.chapter_number > current) {
          maxChapterMemCache.set(ch.manga_id, ch.chapter_number);
        }
      }
    }

    const mapped = (initialItems || [])
      .filter((item: any) => !item.title_i18n?.disabled && !item.title_i18n?.is_disabled && !isMatureManga(item.genres))
      .map((item: any) => ({
        slug: item.id,
        title: item.title,
        cover_url: item.cover_url,
        status: item.status,
        genres: item.genres,
        latest_chapter_number: maxChapterMemCache.get(item.id) || item.title_i18n?.latest_chapter || item.title_i18n?.total_chapters || 1,
        client_vector: [1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0],
      }));

    setCached(cacheKey, mapped, 600); // 10 minutes
    return mapped;
  } catch {
    return [];
  }
}

const isUUID = (str: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);

export async function resolveMangaRecord(idOrSlug: string, supabase: any) {
  if (!idOrSlug) return null;

  // 1. Direct UUID lookup
  if (isUUID(idOrSlug)) {
    const { data } = await supabase
      .from('manga')
      .select('*')
      .eq('id', idOrSlug)
      .maybeSingle();
    if (data && !isMatureManga(data.genres)) return data;
    if (data && isMatureManga(data.genres)) return null;
  }

  // 2. Source ID lookup (e.g. MangaDex UUID or MangaPill ID)
  const { data: bySource } = await supabase
    .from('manga')
    .select('*')
    .eq('source_id', idOrSlug)
    .order('view_count', { ascending: false, nullsFirst: false })
    .limit(5);
  if (bySource && bySource.length > 0) {
    const active = bySource.find((m: any) => !m.title_i18n?.disabled && !isMatureManga(m.genres));
    if (active) return active;
    if (bySource.some((m: any) => isMatureManga(m.genres))) return null;
  }

  // 3. Exact Title / Clean Slug lookup (preferring active titles)
  const cleanTitle = decodeURIComponent(idOrSlug).replace(/[-_]+/g, ' ').trim();
  const { data: byTitle } = await supabase
    .from('manga')
    .select('*')
    .ilike('title', cleanTitle)
    .order('view_count', { ascending: false, nullsFirst: false })
    .limit(5);
  if (byTitle && byTitle.length > 0) {
    const active = byTitle.find((m: any) => !m.title_i18n?.disabled && !isMatureManga(m.genres));
    if (active) return active;
    if (byTitle.some((m: any) => isMatureManga(m.genres))) return null;
  }

  // 4. Fuzzy / Substring Title lookup
  const { data: byFuzzy } = await supabase
    .from('manga')
    .select('*')
    .ilike('title', `%${cleanTitle}%`)
    .order('view_count', { ascending: false, nullsFirst: false })
    .limit(5);
  if (byFuzzy && byFuzzy.length > 0) {
    const active = byFuzzy.find((m: any) => !m.title_i18n?.disabled && !isMatureManga(m.genres));
    if (active) return active;
    if (byFuzzy.some((m: any) => isMatureManga(m.genres))) return null;
  }

  return null;
}

const UPSTREAM_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Referer': 'https://atsu.moe/',
};

export async function getCachedMangaDetail(id: string) {
  const cacheKey = `manga_detail:${id}`;
  const cached = getCached<any>(cacheKey);
  if (cached) {
    if (isMatureManga(cached.genres)) return null;
    return cached;
  }

  const inFlight = inFlightPromises.get(cacheKey);
  if (inFlight) return inFlight;

  const supabase = getSupabase();
  if (!supabase) return null;

  const fetchPromise = (async () => {
    try {
      const manga = await resolveMangaRecord(id, supabase);
      if (!manga || isMatureManga(manga.genres)) return null;

    let chapters: any[] = [];
    let from = 0;
    while (true) {
      const { data: chunk, error } = await supabase
        .from('chapters')
        .select('id, chapter_number, title, job_status, language, scanlation_group, created_at')
        .eq('manga_id', manga.id)
        .order('chapter_number', { ascending: true })
        .range(from, from + 999);
      if (error || !chunk || chunk.length === 0) break;
      chapters.push(...chunk);
      if (chunk.length < 1000) break;
      from += 1000;
    }

    const currentMax = (chapters || []).reduce(
      (max: number, c: any) => Math.max(max, Number(c.chapter_number) || 0),
      0
    );
    const expectedMax = Number(manga.title_i18n?.latest_chapter || 0);
    const isStaleOrMissing = !chapters || chapters.length === 0 || (expectedMax > 0 && currentMax < expectedMax);

    // On-Demand Auto-Sync: If chapters are missing or behind latest chapter, fetch live from Atsu / Asura
    if (isStaleOrMissing) {
      try {
        let rawChapters: any[] = [];
        if (manga.source_provider === 'atsu') {
          const res = await fetch(`https://atsu.moe/api/manga/allChapters?mangaId=${manga.source_id}`, {
            headers: UPSTREAM_HEADERS,
            signal: AbortSignal.timeout(8000),
          });
          if (res.ok) {
            const json = await res.json();
            rawChapters = (json.chapters || []).map((c: any) => ({
              manga_id: manga.id,
              chapter_number: c.number !== undefined && c.number !== null ? c.number : (c.index || 1),
              title: c.title || `Chapter ${c.number ?? c.index ?? 1}`,
              source_url: `https://atsu.moe/api/read/chapter?mangaId=${manga.source_id}&chapterId=${c.id}`,
              job_status: 'READY',
              language: 'en',
              scanlation_group: 'Official',
            }));
          }
        } else if (manga.source_provider === 'asura') {
          const slug = manga.source_id.replace(/^asura:/, '');
          const res = await fetch(`https://api.asurascans.com/api/series/${slug}/chapters`, {
            headers: UPSTREAM_HEADERS,
            signal: AbortSignal.timeout(8000),
          });
          if (res.ok) {
            const json = await res.json();
            rawChapters = (json.data || []).map((c: any) => ({
              manga_id: manga.id,
              chapter_number: c.number,
              title: c.title ? `Chapter ${c.number}: ${c.title}` : `Chapter ${c.number}`,
              source_url: `https://api.asurascans.com/api/series/${slug}/chapters/${c.number}`,
              job_status: 'READY',
              language: 'en',
              scanlation_group: 'Asura Scans',
            }));
          }
        }

        if (rawChapters.length > 0) {
          // Strictly deduplicate by chapter_number: keep highest quality / English
          const uniqueMap = new Map<number, any>();
          for (const raw of rawChapters) {
            const num = Number(raw.chapter_number);
            if (!uniqueMap.has(num)) {
              uniqueMap.set(num, raw);
            } else {
              const prev = uniqueMap.get(num)!;
              const prevHasTitle = prev.title && !prev.title.match(/^Chapter\s+\d+$/i);
              const rawHasTitle = raw.title && !raw.title.match(/^Chapter\s+\d+$/i);
              if (!prevHasTitle && rawHasTitle) {
                uniqueMap.set(num, raw);
              }
            }
          }
          const deduplicatedList = Array.from(uniqueMap.values()).sort(
            (a, b) => Number(a.chapter_number) - Number(b.chapter_number)
          );

          // Asynchronously persist deduplicated chapters to Supabase with upsert onConflict
          (async () => {
            try {
              for (let i = 0; i < deduplicatedList.length; i += 200) {
                const batch = deduplicatedList.slice(i, i + 200);
                await supabase.from('chapters').upsert(batch, { onConflict: 'manga_id,chapter_number' });
              }
            } catch {}
          })();

          chapters = deduplicatedList as any;
        }
      } catch (syncErr) {
        console.warn('[Cache] On-demand chapter sync error:', syncErr);
      }
    }

    // Always guarantee chapters returned from DB or sync are strictly unique by chapter_number
    if (chapters && chapters.length > 0) {
      const finalUniqueMap = new Map<number, any>();
      for (const ch of chapters) {
        const num = Number(ch.chapter_number);
        if (!finalUniqueMap.has(num)) {
          finalUniqueMap.set(num, ch);
        } else {
          const prev = finalUniqueMap.get(num)!;
          const prevHasTitle = prev.title && !prev.title.match(/^Chapter\s+\d+$/i);
          const curHasTitle = ch.title && !ch.title.match(/^Chapter\s+\d+$/i);
          if (!prevHasTitle && curHasTitle) {
            finalUniqueMap.set(num, ch);
          }
        }
      }
      chapters = Array.from(finalUniqueMap.values()).sort(
        (a, b) => Number(a.chapter_number) - Number(b.chapter_number)
      );
    }

    const chapterNumbers = (chapters || []).map(c => Number(c.chapter_number) || 0);
    const latestChapter = chapterNumbers.length > 0 ? Math.max(...chapterNumbers) : 1;

    const result = {
      ...manga,
      artist: manga.artist || manga.title_i18n?.artist || null,
      studio: manga.studio || manga.title_i18n?.studio || null,
      latest_chapter_number: latestChapter,
      chapters: chapters || [],
    };

    setCached(cacheKey, result, 300); // 5 minutes
    if (manga.id && cacheKey !== `manga_detail:${manga.id}`) {
      setCached(`manga_detail:${manga.id}`, result, 300);
    }
    return result;
  } catch {
    return null;
  }
  })().finally(() => {
    inFlightPromises.delete(cacheKey);
  });

  inFlightPromises.set(cacheKey, fetchPromise);
  return fetchPromise;
}

export async function getCachedRecommendations(excludeId: string) {
  const cacheKey = `manga_recs:${excludeId}`;
  const cached = getCached<any[]>(cacheKey);
  if (cached) return cached;

  const inFlight = inFlightPromises.get(cacheKey);
  if (inFlight) return inFlight;

  const supabase = getSupabase();
  if (!supabase) return [];

  const fetchPromise = (async () => {
    try {
    const pgArray = `{${MATURE_GENRES.map((g) => g.includes(' ') ? `"${g}"` : g).join(',')}}`;
    const { data: mangas } = await supabase
      .from('manga')
      .select('id, title, cover_url, status, genres, description, title_i18n')
      .neq('id', excludeId)
      .neq('title', 'm')
      .not('cover_url', 'is', null)
      .or('title_i18n->disabled.is.null,title_i18n->disabled.eq.false')
      .not('genres', 'ov', pgArray)
      .order('updated_at', { ascending: false })
      .limit(6);

    const mangaIds = (mangas || []).map((m: any) => m.id);
    const neededIds = mangaIds.filter((id: string) => !maxChapterMemCache.has(id));

    if (neededIds.length > 0) {
      const { data: chapters } = await supabase
        .from('chapters')
        .select('manga_id, chapter_number')
        .in('manga_id', neededIds)
        .order('chapter_number', { ascending: false });

      for (const ch of chapters || []) {
        const current = maxChapterMemCache.get(ch.manga_id) || 0;
        if (ch.chapter_number > current) {
          maxChapterMemCache.set(ch.manga_id, ch.chapter_number);
        }
      }
    }

    const result = (mangas || []).filter((m: any) => !isMatureManga(m.genres)).map((m: any) => ({
      ...m,
      latest_chapter_number: maxChapterMemCache.get(m.id) || m.title_i18n?.latest_chapter || m.title_i18n?.total_chapters || 1,
    }));

      setCached(cacheKey, result, 600); // 10 minutes
      return result;
    } catch {
      return [];
    }
  })().finally(() => {
    inFlightPromises.delete(cacheKey);
  });

  inFlightPromises.set(cacheKey, fetchPromise);
  return fetchPromise;
}
