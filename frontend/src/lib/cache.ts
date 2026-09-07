import { getSupabase } from './supabase';

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const memoryCache = new Map<string, CacheEntry<any>>();

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
  page?: number;
  limit?: number;
}) {
  const { q = '', genre = '', page = 1, limit = 24 } = params;
  const cacheKey = `manga_list:${q}:${genre}:${page}:${limit}`;
  const cached = getCached<{ data: any[]; total: number; page: number; limit: number }>(cacheKey);
  if (cached) return cached;

  const supabase = getSupabase();
  if (!supabase) return { data: [], total: 0, page, limit };

  const offset = (page - 1) * limit;
  let query = supabase
    .from('manga')
    .select('id, title, cover_url, status, genres, description, updated_at', { count: 'exact' })
    .neq('title', 'm')
    .not('title', 'is', null)
    .not('cover_url', 'is', null)
    .order('updated_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (q && q.trim() !== '') {
    query = query.ilike('title', `%${q}%`);
  }

  if (genre && genre.trim() !== '' && genre !== 'All') {
    query = query.contains('genres', [genre]);
  }

  const { data, count, error } = await query;
  if (error) {
    console.warn('[Cache] Supabase query error:', error.message);
    return { data: [], total: 0, page, limit };
  }

  let enrichedData = data || [];
  if (enrichedData.length > 0) {
    try {
      const mangaIds = enrichedData.map((m: any) => m.id);
      const { data: chapters } = await supabase
        .from('chapters')
        .select('manga_id, chapter_number')
        .in('manga_id', mangaIds);

      const maxMap = new Map<string, number>();
      for (const ch of chapters || []) {
        const current = maxMap.get(ch.manga_id) || 0;
        if (ch.chapter_number > current) {
          maxMap.set(ch.manga_id, ch.chapter_number);
        }
      }

      enrichedData = enrichedData.map((m: any) => ({
        ...m,
        latest_chapter_number: maxMap.get(m.id) || 1,
      }));
    } catch {}
  }

  const result = { data: enrichedData, total: count || 0, page, limit };
  setCached(cacheKey, result, 120); // Cache for 2 minutes
  return result;
}

export async function getCachedGenres() {
  const cacheKey = 'global_genres_list';
  const cached = getCached<{ name: string; slug: string }[]>(cacheKey);
  if (cached) return cached;

  const STANDARD_GENRES = [
    "Action", "Adventure", "Comedy", "Drama", "Fantasy", "Horror", 
    "Isekai", "Martial Arts", "Mystery", "Psychological", "Romance", 
    "Sci-Fi", "Seinen", "Shounen", "Slice of Life", "Sports", 
    "Supernatural", "Thriller", "Tragedy", "Manhwa", "Webtoon"
  ].map(g => ({ name: g, slug: g.toLowerCase().replace(/\s+/g, '-') }));

  const supabase = getSupabase();
  if (!supabase) return STANDARD_GENRES;

  try {
    const { data, error } = await supabase.from('genres').select('name, slug').order('name');
    if (!error && data && data.length > 0) {
      setCached(cacheKey, data, 1800); // 30 minutes
      return data;
    }
  } catch {}

  setCached(cacheKey, STANDARD_GENRES, 1800);
  return STANDARD_GENRES;
}

export async function getCachedCatalogVectors() {
  const cacheKey = 'catalog_vectors_data';
  const cached = getCached<any[]>(cacheKey);
  if (cached) return cached;

  const supabase = getSupabase();
  if (!supabase) return [];

  try {
    const { data: initialItems, error } = await supabase
      .from('manga')
      .select('id, title, cover_url, status, genres')
      .neq('title', 'm')
      .not('cover_url', 'is', null)
      .order('updated_at', { ascending: false })
      .limit(60);

    if (error || !initialItems) return [];

    const mangaIds = initialItems.map((m: any) => m.id);
    const { data: chapters } = await supabase
      .from('chapters')
      .select('manga_id, chapter_number')
      .in('manga_id', mangaIds);

    const maxMap = new Map<string, number>();
    for (const ch of chapters || []) {
      const current = maxMap.get(ch.manga_id) || 0;
      if (ch.chapter_number > current) {
        maxMap.set(ch.manga_id, ch.chapter_number);
      }
    }

    const mapped = initialItems.map((item) => ({
      slug: item.id,
      title: item.title,
      cover_url: item.cover_url,
      status: item.status,
      genres: item.genres,
      latest_chapter_number: maxMap.get(item.id) || 1,
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
    if (data) return data;
  }

  // 2. Source ID lookup (e.g. MangaDex UUID or MangaPill ID)
  const { data: bySource } = await supabase
    .from('manga')
    .select('*')
    .eq('source_id', idOrSlug)
    .maybeSingle();
  if (bySource) return bySource;

  // 3. Exact Title / Clean Slug lookup
  const cleanTitle = decodeURIComponent(idOrSlug).replace(/[-_]+/g, ' ').trim();
  const { data: byTitle } = await supabase
    .from('manga')
    .select('*')
    .ilike('title', cleanTitle)
    .limit(1);
  if (byTitle && byTitle.length > 0) return byTitle[0];

  // 4. Fuzzy / Substring Title lookup
  const { data: byFuzzy } = await supabase
    .from('manga')
    .select('*')
    .ilike('title', `%${cleanTitle}%`)
    .limit(1);
  if (byFuzzy && byFuzzy.length > 0) return byFuzzy[0];

  return null;
}

export async function getCachedMangaDetail(id: string) {
  const cacheKey = `manga_detail:${id}`;
  const cached = getCached<any>(cacheKey);
  if (cached) return cached;

  const supabase = getSupabase();
  if (!supabase) return null;

  try {
    const manga = await resolveMangaRecord(id, supabase);
    if (!manga) return null;

    const { data: chapters } = await supabase
      .from('chapters')
      .select('id, chapter_number, title, job_status, language, scanlation_group, created_at')
      .eq('manga_id', manga.id)
      .order('chapter_number', { ascending: true })
      .limit(5000);

    const chapterNumbers = (chapters || []).map(c => Number(c.chapter_number) || 0);
    const latestChapter = chapterNumbers.length > 0 ? Math.max(...chapterNumbers) : 1;

    const result = {
      ...manga,
      latest_chapter_number: latestChapter,
      chapters: chapters || [],
    };

    setCached(cacheKey, result, 300); // 5 minutes
    return result;
  } catch {
    return null;
  }
}

export async function getCachedRecommendations(excludeId: string) {
  const cacheKey = `manga_recs:${excludeId}`;
  const cached = getCached<any[]>(cacheKey);
  if (cached) return cached;

  const supabase = getSupabase();
  if (!supabase) return [];

  try {
    const { data: mangas } = await supabase
      .from('manga')
      .select('id, title, cover_url, status, genres, description')
      .neq('id', excludeId)
      .neq('title', 'm')
      .not('cover_url', 'is', null)
      .order('updated_at', { ascending: false })
      .limit(6);

    const mangaIds = (mangas || []).map((m: any) => m.id);
    const { data: chapters } = await supabase
      .from('chapters')
      .select('manga_id, chapter_number')
      .in('manga_id', mangaIds);

    const maxMap = new Map<string, number>();
    for (const ch of chapters || []) {
      const current = maxMap.get(ch.manga_id) || 0;
      if (ch.chapter_number > current) {
        maxMap.set(ch.manga_id, ch.chapter_number);
      }
    }

    const result = (mangas || []).map((m: any) => ({
      ...m,
      latest_chapter_number: maxMap.get(m.id) || 1,
    }));

    setCached(cacheKey, result, 600); // 10 minutes
    return result;
  } catch {
    return [];
  }
}
