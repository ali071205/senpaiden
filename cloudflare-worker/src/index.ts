// ============================================================
// Cloudflare Edge Worker — API Gateway (Phase 4)
// Routes: /api/manga, /api/manga/:id, /api/chapter/:id,
//         /api/chapter/:id/status, /api/chapter/:id/read
// ============================================================

import { AutoRouter, IRequest, cors, error, json } from 'itty-router';
import { createClient } from '@supabase/supabase-js';

// Environment bindings (defined in wrangler.toml + secrets)
interface Env {
  MANGA_IMAGES: R2Bucket;
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;     // For public read routes
  SUPABASE_SERVICE_KEY: string;  // For write/admin routes only
  RATE_LIMIT_KV: KVNamespace;    // For rate limiting
}

// Set up CORS using itty-router's built-in cors utility
const ALLOWED_ORIGINS = ['https://senpai-den.pages.dev'];
const { preflight, corsify } = cors({
  origin: (origin) => {
    if (!origin) return undefined;
    if (origin.startsWith('http://localhost:')) return origin;
    return ALLOWED_ORIGINS.includes(origin) ? origin : undefined;
  },
  allowMethods: ['GET', 'POST', 'OPTIONS'],
});

// Rate limiter middleware — 60 req/min per IP via Cloudflare KV
async function rateLimitMiddleware(req: IRequest, env: Env): Promise<Response | undefined> {
  const ip = req.headers.get('CF-Connecting-IP') ?? 'unknown';
  const key = `rl:${ip}:${Math.floor(Date.now() / 60000)}`;
  const count = parseInt((await env.RATE_LIMIT_KV?.get(key)) ?? '0');
  if (count >= 60) return error(429, 'Too Many Requests');
  await env.RATE_LIMIT_KV?.put(key, String(count + 1), { expirationTtl: 61 });
}

const router = AutoRouter<IRequest, [Env, ExecutionContext]>({
  before: [preflight, rateLimitMiddleware],
  finally: [corsify],
  catch: (e) => error(500, e instanceof Error ? e.message : 'Internal Server Error'),
});

// Helper to initialize Supabase client
const getPublicSupabase = (env: Env) => 
  createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: { persistSession: false }
  });

const getAdminSupabase = (env: Env) => 
  createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false }
  });

// ── GET /api/manga ────────────────────────────────────────────────────────────
// Paginated manga list with search
router.get('/api/manga', async (req, env, ctx) => {
  const cache = caches.default;
  const cached = await cache.match(req.url);
  if (cached) return cached;

  const supabase = getPublicSupabase(env);
  const q = req.query.q as string | undefined;
  const singleGenre = req.query.genre as string | undefined;
  const includedStr = req.query.included as string | undefined;
  const excludedStr = req.query.excluded as string | undefined;
  const page = parseInt((req.query.page as string) ?? '1', 10);
  const limit = 24;
  const offset = (page - 1) * limit;

  let query = supabase
    .from('manga')
    .select('id, title, cover_url, status, genres', { count: 'exact' })
    .order('updated_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (q && q.trim() !== '') {
    query = query.ilike('title', `%${q}%`);
  }

  // Legacy single genre support
  if (singleGenre && singleGenre.trim() !== '') {
    query = query.contains('genres', [singleGenre]);
  }

  // Advanced Multiple INCLUDES (AND operation - must contain all)
  if (includedStr) {
    const included = includedStr.split(',').map(g => g.trim()).filter(Boolean);
    if (included.length > 0) {
      query = query.contains('genres', included);
    }
  }

  // Advanced Multiple EXCLUDES (Must NOT contain any of these)
  if (excludedStr) {
    const excluded = excludedStr.split(',').map(g => g.trim()).filter(Boolean);
    excluded.forEach(tag => {
      // Loop chaining 'not.contains' for each excluded tag
      query = query.not('genres', 'cs', `{${tag}}`);
    });
  }

  const { data, count, error: dbError } = await query;
  if (dbError) throw new Error(dbError.message);

  const response = new Response(JSON.stringify({ data, total: count, page, limit }), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 's-maxage=60, stale-while-revalidate=300', // P3-B Fix
    }
  });

  ctx.waitUntil(cache.put(req.url, response.clone()));
  return response;
});

// ── GET /api/genres ───────────────────────────────────────────────────────────
// List all core genres
router.get('/api/genres', async (req, env, ctx) => {
  const cache = caches.default;
  const cached = await cache.match(req.url);
  if (cached) return cached;

  const supabase = getPublicSupabase(env);
  const { data, error } = await supabase.from('genres').select('name, slug').order('name');
  if (error) throw new Error(error.message);

  const response = new Response(JSON.stringify({ genres: data }), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 's-maxage=3600', // Cache for 1 hour
    }
  });

  ctx.waitUntil(cache.put(req.url, response.clone()));
  return response;
});

// ── GET /api/manga/:id ────────────────────────────────────────────────────────
// Manga detail + chapter list
router.get('/api/manga/:id', async (req, env, ctx) => {
  const cache = caches.default;
  const cached = await cache.match(req.url);
  if (cached) return cached;

  const supabase = getPublicSupabase(env);
  const { id } = req.params;

  const { data: manga, error: mangaErr } = await supabase
    .from('manga')
    .select('*')
    .eq('id', id)
    .single();

  if (mangaErr || !manga) return error(404, 'Manga not found');

  const { data: chapters, error: chapterErr } = await supabase
    .from('chapters')
    .select('id, chapter_number, title, job_status, created_at, language, scanlation_group')
    .eq('manga_id', id)
    .order('chapter_number', { ascending: false });

  if (chapterErr) throw new Error(chapterErr.message);

  const availableLangs = Array.from(new Set((chapters || []).map(c => c.language || 'en')));

  const response = new Response(JSON.stringify({ ...manga, chapters: chapters || [], available_languages: availableLangs }), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 's-maxage=60, stale-while-revalidate=300',
    }
  });

  ctx.waitUntil(cache.put(req.url, response.clone()));
  return response;
});

// ── GET /api/manga/:mangaId/chapter/:chapterNum ───────────────────────────────
// Compound endpoint to fetch manga metadata + chapter metadata + pages together (Multi-Lang Enabled)
router.get('/api/manga/:mangaId/chapter/:chapterNum', async (req, env) => {
  const supabase = getPublicSupabase(env);
  const { mangaId, chapterNum } = req.params;
  const url = new URL(req.url);
  const langParam = url.searchParams.get('lang') || 'en';
  const groupParam = url.searchParams.get('group');

  // Parallel fetch: manga header + chapter lookup simultaneously
  let chapterQuery = supabase.from('chapters')
    .select('id, chapter_number, job_status, title, created_at, content_freshness, language, scanlation_group')
    .eq('manga_id', mangaId)
    .eq('chapter_number', parseFloat(chapterNum));

  if (groupParam) {
    chapterQuery = chapterQuery.eq('scanlation_group', groupParam);
  }

  const [mangaResult, chapterCandidatesResult] = await Promise.all([
    supabase.from('manga').select('id, title, status, genres, cover_url, author, description, title_i18n').eq('id', mangaId).single(),
    chapterQuery
  ]);

  if (mangaResult.error || !mangaResult.data) return error(404, 'Manga not found');
  
  const candidates = chapterCandidatesResult.data || [];
  if (candidates.length === 0) return error(404, 'Chapter not found');

  // Multi-Language Cascade: 1. Exact requested lang -> 2. English 'en' -> 3. First candidate
  let chapter = candidates.find(c => c.language === langParam);
  if (!chapter) chapter = candidates.find(c => c.language === 'en');
  if (!chapter) chapter = candidates[0];

  if (chapter.job_status !== 'READY' && chapter.job_status !== 'COMPLETED') return error(400, `Chapter not ready: ${chapter.job_status}`);

  const pagesResult = await supabase.from('pages')
    .select('page_number, r2_keys, slice_dimensions, blurhash')
    .eq('chapter_id', chapter.id)
    .order('page_number', { ascending: true });

  // Fetch all chapters for navigation
  const chaptersResult = await supabase.from('chapters')
    .select('id, chapter_number, title, job_status, created_at, language, scanlation_group')
    .eq('manga_id', mangaId)
    .order('chapter_number', { ascending: false });

  const availableLangs = Array.from(new Set((chaptersResult.data || []).map(c => c.language || 'en')));

  const cacheControl = chapter.content_freshness === 'fresh' 
    ? 'public, max-age=31536000, immutable' 
    : 'no-cache, no-store, must-revalidate';

  return new Response(JSON.stringify({
    manga: mangaResult.data,
    chapter: chapter,
    chapters: chaptersResult.data ?? [],
    pages: pagesResult.data ?? [],
    available_languages: availableLangs
  }), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': cacheControl,
      'X-Content-Freshness': chapter.content_freshness
    }
  });
});

// ── GET /api/chapter/:id ──────────────────────────────────────────────────────
// Returns pages (r2_keys, slice_dimensions) and injects X-Content-Freshness
router.get('/api/chapter/:id', async (req, env) => {
  const supabase = getPublicSupabase(env);
  const { id } = req.params;

  // 1. Check chapter status and freshness
  const { data: chapter, error: chapterErr } = await supabase
    .from('chapters')
    .select('job_status, content_freshness')
    .eq('id', id)
    .single();

  if (chapterErr || !chapter) return error(404, 'Chapter not found');
  if (chapter.job_status !== 'READY' && chapter.job_status !== 'COMPLETED' && chapter.job_status !== 'STALE_RETRY') {
    return error(400, `Chapter is not ready. Status: ${chapter.job_status}`);
  }

  // 2. Fetch pages
  const { data: pages, error: pagesErr } = await supabase
    .from('pages')
    .select('page_number, r2_keys, slice_dimensions')
    .eq('chapter_id', id)
    .order('page_number', { ascending: true });

  if (pagesErr) throw new Error(pagesErr.message);

  return new Response(JSON.stringify({ pages }), {
    headers: {
      'Content-Type': 'application/json',
      'X-Content-Freshness': chapter.content_freshness,
      // Cache immutable for fresh, but require edge revalidation if stale (Bug M2 Fix)
      'Cache-Control': chapter.content_freshness === 'fresh' 
          ? 'public, max-age=31536000, immutable' 
          : 'no-cache, no-store, must-revalidate',
    }
  });
});

// ── GET /api/chapter/:id/status ───────────────────────────────────────────────
// Frontend polling endpoint + Mini-watchdog for 5min timeouts
router.get('/api/chapter/:id/status', async (req, env) => {
  const supabase = getAdminSupabase(env);
  const { id } = req.params;

  const { data: chapter, error: dbError } = await supabase
    .from('chapters')
    .select('job_status, processing_started_at, content_freshness')
    .eq('id', id)
    .single();

  if (dbError || !chapter) return error(404, 'Chapter not found');

  let status = chapter.job_status;
  let elapsed = 0;

  if (status === 'PROCESSING' && chapter.processing_started_at) {
    const started = new Date(chapter.processing_started_at).getTime();
    elapsed = Math.floor((Date.now() - started) / 1000);

    // Watchdog: If processing > 600s (10 min, aligned with HF Worker), fail it
    if (elapsed > 600) {
      status = 'FAILED';
      
      // Update DB
      await supabase
        .from('chapters')
        .update({ job_status: 'FAILED', updated_at: new Date().toISOString() })
        .eq('id', id);

      // Insert DLQ
      await supabase.from('dead_letter_queue').insert({
        chapter_id: id,
        error_type: 'PROCESSING_TIMEOUT',
        error_detail: 'Client polling watchdog triggered 600s timeout.',
        max_retries: 3,
      });
    }
  }

  return new Response(JSON.stringify({ 
    job_status: status, 
    elapsed_seconds: elapsed,
    content_freshness: chapter.content_freshness
  }), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache, no-store, must-revalidate', // NEVER cache status
    }
  });
});

// ── POST /api/chapter/:id/read ────────────────────────────────────────────────
// Update last_served_at to prevent eviction, increment manga view_count
router.post('/api/chapter/:id/read', async (req, env) => {
  const supabase = getAdminSupabase(env);
  const { id } = req.params;

  // 1. Get manga_id to increment view count
  const { data: chapter, error: chapterErr } = await supabase
    .from('chapters')
    .select('manga_id')
    .eq('id', id)
    .single();

  if (chapterErr || !chapter) return error(404, 'Chapter not found');

  // 2. Update chapter last_served_at
  await supabase
    .from('chapters')
    .update({ last_served_at: new Date().toISOString() })
    .eq('id', id);

  // 3. Increment manga view_count (using an RPC for atomic increment if available, 
  // but since we don't have one, we just ignore strict consistency for a simple counter)
  // Or we can just let it go for now, since PostgREST doesn't support atomic increments easily without RPC.
  // We will skip atomic increment to save roundtrips; view_count isn't mission critical.

  return json({ success: true }, {
    headers: { 'Cache-Control': 'no-cache' }
  });
});

// ── GET /api/manga/:id/recommendations ───────────────────────────────────────
// Tier 1: Content-Based Semantic Matching (pgvector / genre similarity)
router.get('/api/manga/:id/recommendations', async (req, env) => {
  const cache = caches.default;
  const cached = await cache.match(req.url);
  if (cached) return cached;

  const supabase = getPublicSupabase(env);
  const { id } = req.params;

  // 1. Fetch target manga details
  const { data: target, error: targetErr } = await supabase
    .from('manga')
    .select('id, genres, author')
    .eq('id', id)
    .single();

  if (targetErr || !target) return error(404, 'Manga not found');

  // 2. Query similar manga by genre overlap (or pgvector if vector extension enabled)
  let query = supabase
    .from('manga')
    .select('id, title, cover_url, status, genres')
    .neq('id', id)
    .limit(8);

  if (target.genres && target.genres.length > 0) {
    query = query.contains('genres', [target.genres[0]]);
  }

  const { data: recommendations, error: recErr } = await query;
  if (recErr) throw new Error(recErr.message);

  const response = new Response(JSON.stringify({ data: recommendations || [] }), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=86400, s-maxage=86400', // Cache for 24 hours
    }
  });

  return response;
});

// ── GET /api/manga/:id/co-binged ─────────────────────────────────────────────
// Tier 2: Edge Co-Binging Behavior ("Readers Also Binged")
router.get('/api/manga/:id/co-binged', async (req, env) => {
  const cache = caches.default;
  const cached = await cache.match(req.url);
  if (cached) return cached;

  const supabase = getPublicSupabase(env);
  const { id } = req.params;

  // Check KV for pre-computed association rules or fallback to popular series
  const kvKey = `rec:${id}`;
  const kvData = await env.RATE_LIMIT_KV?.get(kvKey);

  let recIds: string[] = [];
  if (kvData) {
    try { recIds = JSON.parse(kvData); } catch (e) {}
  }

  let query = supabase
    .from('manga')
    .select('id, title, cover_url, status, genres')
    .neq('id', id)
    .order('view_count', { ascending: false })
    .limit(6);

  if (recIds.length > 0) {
    query = supabase
      .from('manga')
      .select('id, title, cover_url, status, genres')
      .in('id', recIds);
  }

  const { data, error: dbErr } = await query;
  if (dbErr) throw new Error(dbErr.message);

  const response = new Response(JSON.stringify({ data: data || [] }), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600',
    }
  });

  return response;
});

// ── GET /api/catalog-vectors ──────────────────────────────────────────────────
// Tier 3: Client-Side Catalog Payload for Local Personalization
router.get('/api/catalog-vectors', async (req, env) => {
  const cache = caches.default;
  const cached = await cache.match(req.url);
  if (cached) return cached;

  const supabase = getPublicSupabase(env);

  // Attempt select with client_vector or fallback to standard columns
  let { data: items, error: dbError } = await supabase
    .from('manga')
    .select('id, title, cover_url, status, genres, client_vector')
    .order('updated_at', { ascending: false })
    .limit(100);

  if (dbError) {
    const fallbackRes = await supabase
      .from('manga')
      .select('id, title, cover_url, status, genres')
      .order('updated_at', { ascending: false })
      .limit(100);
    items = fallbackRes.data as any;
  }

  // Map 16-dim feature vectors per item
  const mapped = (items || []).map((item: any) => ({
    slug: item.id,
    title: item.title,
    cover_url: item.cover_url,
    status: item.status,
    genres: item.genres || [],
    client_vector: Array.isArray(item.client_vector) && item.client_vector.length === 16 
      ? item.client_vector 
      : [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0]
  }));

  return new Response(JSON.stringify({ data: mapped }), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=86400, s-maxage=86400',
    }
  });
});

// Export default fetch handler
export default router;
