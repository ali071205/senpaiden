import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';
import { resolveMangaRecord } from '@/lib/cache';
import { isGDriveConfigured } from '@/lib/gdrive';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; chapter: string }> }
) {
  try {
    const supabase = getSupabase();
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase environment variables not configured.' }, { status: 500 });
    }

    const { id: rawMangaId, chapter: chapterNumStr } = await params;
    const chapterNumber = parseFloat(chapterNumStr);

    // Fetch manga details via universal resolver (UUID, slug, title, or source_id)
    const manga = await resolveMangaRecord(rawMangaId, supabase);
    if (!manga) {
      return NextResponse.json({ error: 'Manga not found' }, { status: 404 });
    }
    const mangaId = manga.id;

    // Fetch all chapters for navigation
    let { data: chapters } = await supabase
      .from('chapters')
      .select('id, chapter_number, title, job_status, language, scanlation_group, source_url')
      .eq('manga_id', mangaId)
      .order('chapter_number', { ascending: true })
      .limit(5000);

    // On-Demand Auto-Sync: If chapters are not yet in DB, fetch live from source provider (Atsu / Asura)
    if (!chapters || chapters.length === 0) {
      try {
        let rawChapters: any[] = [];
        if (manga.source_provider === 'atsu') {
          const res = await fetch(`https://atsu.moe/api/manga/allChapters?mangaId=${manga.source_id}`, {
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
          // Strictly deduplicate by chapter_number
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

          // Persist to Supabase asynchronously in background
          (async () => {
            try {
              for (let i = 0; i < deduplicatedList.length; i += 200) {
                const batch = deduplicatedList.slice(i, i + 200);
                await supabase.from('chapters').insert(batch);
              }
            } catch {}
          })();

          chapters = deduplicatedList as any;
        }
      } catch (err) {
        console.warn('[Chapter Route] On-demand chapter sync error:', err);
      }
    }

    // Fetch current target chapter (prioritizing English and READY status)
    const { data: candidateChapters } = await supabase
      .from('chapters')
      .select('*')
      .eq('manga_id', mangaId)
      .eq('chapter_number', chapterNumber)
      .limit(10);

    // Pick English or first ready candidate
    let chapter = candidateChapters?.find((c) => c.language === 'en') || candidateChapters?.[0];

    // Fallback to in-memory/synced chapters list
    if (!chapter && (chapters || []).length > 0) {
      chapter = (chapters || []).find((c) => parseFloat(String(c.chapter_number)) === chapterNumber);
      if (!chapter && (chapterNumber === 1 || chapterNumber === 0)) {
        chapter = (chapters || [])[0];
      }
    }

    // If chapter record is missing, query upstream provider to resolve a valid semantic source URL
    if (!chapter) {
      const newChapterId = crypto.randomUUID();
      let resolvedSourceUrl = '';
      let resolvedLanguage = 'en';

      // Check MangaDex if source_id is a UUID or provider is mangadex
      const dexId = (manga.source_id && /^[0-9a-f-]{36}$/i.test(manga.source_id)) ? manga.source_id : null;
      if (dexId) {
        try {
          const dexChRes = await fetch(
            `https://api.mangadex.org/chapter?manga=${dexId}&chapter=${chapterNumber}&limit=10&order[readableAt]=desc`,
            { signal: AbortSignal.timeout(6000) }
          );
          if (dexChRes.ok) {
            const chJson = await dexChRes.json();
            const candidates = (chJson.data || []).filter((c: any) => 
              (c.attributes?.pages > 0 || c.attributes?.data?.length > 0) && !c.attributes?.externalUrl
            );
            const enCh = candidates.find((c: any) => c.attributes?.translatedLanguage === 'en') || candidates[0];
            if (enCh) {
              resolvedSourceUrl = `https://mangadex.org/chapter/${enCh.id}`;
              resolvedLanguage = enCh.attributes?.translatedLanguage || 'en';
            }
          }
        } catch {}
      }

      if (resolvedSourceUrl) {
        const newCh = {
          id: newChapterId,
          manga_id: mangaId,
          chapter_number: chapterNumber,
          title: `Chapter ${chapterNumber}`,
          source_url: resolvedSourceUrl,
          job_status: 'READY',
          language: resolvedLanguage,
          scanlation_group: 'MangaDex'
        };
        try {
          await supabase.from('chapters').insert(newCh);
        } catch (dbErr) {
          console.warn('[Chapter Route] Could not persist resolved chapter to DB:', dbErr);
        }
        chapter = newCh as any;
      } else {
        chapter = {
          id: newChapterId,
          manga_id: mangaId,
          chapter_number: chapterNumber,
          title: `Chapter ${chapterNumber}`,
          source_url: '',
          job_status: 'PROCESSING'
        } as any;
      }
    } else if (chapter.job_status !== 'READY' && chapter.job_status !== 'COMPLETED') {
      try {
        await supabase.from('chapters').update({ job_status: 'READY' }).eq('id', chapter.id);
        chapter.job_status = 'READY';
      } catch {}
    }

    // Fetch pages for this chapter
    let { data: pages } = await supabase
      .from('pages')
      .select('*')
      .eq('chapter_id', chapter.id)
      .order('page_number', { ascending: true });

    // Fallback: If pages are missing, empty, or have unresolvable GDrive keys when GDrive is not configured
    const gdriveConfigured = isGDriveConfigured();
    const hasInvalidKeys = !pages || pages.length === 0 || pages.some(p => 
      !Array.isArray(p.r2_keys) || 
      p.r2_keys.length === 0 || 
      p.r2_keys.every((k: string) => !k || k.trim() === '' || (!gdriveConfigured && k.startsWith('gdrive/')))
    );

    if (!pages || pages.length === 0 || hasInvalidKeys) {
      try {
        let livePages: any[] = [];

        // 1. Atsu.moe Direct CDN Resolution
        if (manga.source_provider === 'atsu' || (chapter.source_url && chapter.source_url.includes('atsu.moe'))) {
          let chapterId = '';
          if (chapter.source_url) {
            try {
              const urlObj = new URL(chapter.source_url, 'https://atsu.moe');
              chapterId = urlObj.searchParams.get('chapterId') || '';
            } catch {}
          }
          if (!chapterId) {
            const allChRes = await fetch(`https://atsu.moe/api/manga/allChapters?mangaId=${manga.source_id}`, {
              signal: AbortSignal.timeout(8000),
            });
            if (allChRes.ok) {
              const chData = await allChRes.json();
              const target = (chData.chapters || []).find((c: any) => c.number === chapterNumber || c.index === chapterNumber);
              if (target) chapterId = target.id;
            }
          }

          if (chapterId) {
            const readRes = await fetch(
              `https://atsu.moe/api/read/chapter?mangaId=${manga.source_id}&chapterId=${chapterId}`,
              { signal: AbortSignal.timeout(8000) }
            );
            if (readRes.ok) {
              const readData = await readRes.json();
              const rawPages = readData.readChapter?.pages || [];
              if (rawPages.length > 0) {
                livePages = rawPages.map((p: any, idx: number) => ({
                  chapter_id: chapter.id,
                  page_number: idx + 1,
                  r2_keys: [`https://cdn.atsu.moe${p.image}`],
                  slice_dimensions: [{ width: p.width || 800, height: p.height || 1200 }],
                }));
              }
            }
          }
        }

        // 2. Asura Scans Direct CDN Resolution
        else if (manga.source_provider === 'asura' || (chapter.source_url && chapter.source_url.includes('asurascans.com'))) {
          const seriesSlug = manga.source_id.replace(/^asura:/, '');
          const asuraRes = await fetch(
            `https://api.asurascans.com/api/series/${seriesSlug}/chapters/${chapterNumber}`,
            { signal: AbortSignal.timeout(8000) }
          );
          if (asuraRes.ok) {
            const asuraJson = await asuraRes.json();
            const rawPages = asuraJson.data?.chapter?.pages || [];
            if (rawPages.length > 0) {
              livePages = rawPages.map((p: any, idx: number) => ({
                chapter_id: chapter.id,
                page_number: idx + 1,
                r2_keys: [p.url],
                slice_dimensions: [{ width: p.width || 800, height: p.height || 1200 }],
              }));
            }
          }
        }

        // 3. MangaPill HTML Scrape
        else if (chapter.source_url && chapter.source_url.includes('mangapill.com/chapters/')) {
          try {
            const pillRes = await fetch(chapter.source_url, {
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                'Referer': 'https://mangapill.com/'
              },
              signal: AbortSignal.timeout(8000)
            });
            if (pillRes.ok) {
              const html = await pillRes.text();
              const imgMatches = [...html.matchAll(/data-src=["']([^"']+)["']/g)].map(m => m[1]);
              if (imgMatches.length > 0) {
                livePages = imgMatches.map((imgUrl: string, idx: number) => ({
                  chapter_id: chapter.id,
                  page_number: idx + 1,
                  r2_keys: [imgUrl],
                  slice_dimensions: [{ width: 800, height: 1200 }],
                }));
              }
            }
          } catch (e) {
            console.warn('[Chapter Route] MangaPill scrape error:', e);
          }
        }

        // 4. MangaDex Fallback
        else {
          let chapterUuid = '';
          if (chapter.source_url && chapter.source_url.includes('mangadex.org/chapter/')) {
            chapterUuid = chapter.source_url.split('mangadex.org/chapter/')[1]?.split('/')[0]?.split('?')[0] || '';
          }

          if (!chapterUuid && manga.source_id && /^[0-9a-f-]{36}$/i.test(manga.source_id)) {
            const chRes = await fetch(
              `https://api.mangadex.org/chapter?manga=${manga.source_id}&chapter=${chapterNumber}&limit=10&order[readableAt]=desc`,
              { signal: AbortSignal.timeout(8000) }
            );
            if (chRes.ok) {
              const chData = await chRes.json();
              const candidates = (chData.data || []).filter((c: any) => 
                (c.attributes?.pages > 0 || c.attributes?.data?.length > 0) && !c.attributes?.externalUrl
              );
              const enCh = candidates.find((c: any) => c.attributes?.translatedLanguage === 'en') || candidates[0];
              if (enCh) {
                chapterUuid = enCh.id;
              }
            }
          }

          if (chapterUuid) {
            const atHomeRes = await fetch(
              `https://api.mangadex.org/at-home/server/${chapterUuid}`,
              { signal: AbortSignal.timeout(8000) }
            );
            if (atHomeRes.ok) {
              const atHomeJson = await atHomeRes.json();
              const hash = atHomeJson.chapter?.hash;
              const files = atHomeJson.chapter?.data || [];
              if (hash && files.length > 0) {
                livePages = files.map((file: string, idx: number) => ({
                  chapter_id: chapter.id,
                  page_number: idx + 1,
                  r2_keys: [`https://uploads.mangadex.org/data/${hash}/${file}`],
                  slice_dimensions: [{ width: 800, height: 1200 }],
                }));
              }
            }
          }
        }

        // Cache resolved pages in background to Supabase
        if (livePages.length > 0) {
          (async () => {
            try {
              await supabase.from('pages').delete().eq('chapter_id', chapter.id);
              await supabase.from('pages').insert(livePages);
            } catch (cacheErr) {
              console.warn('[Chapter Route] Failed to cache live pages to DB:', cacheErr);
            }
          })();

          pages = livePages as any;
        }
      } catch (err) {
        console.warn('[Chapter Route] Live CDN page fetch fallback error:', err);
      }
    }

    // Sanitize pages: filter out records with no keys
    const sanitizedPages = (pages || []).filter(p => {
      if (!Array.isArray(p.r2_keys) || p.r2_keys.length === 0) return false;
      return p.r2_keys.some((k: string) => typeof k === 'string' && k.length > 0);
    });

    // Guarantee strictly unique chapter numbers for reader navigation
    const dedupedNavMap = new Map<number, any>();
    for (const c of chapters || []) {
      const num = Number(c.chapter_number);
      if (!dedupedNavMap.has(num)) {
        dedupedNavMap.set(num, c);
      }
    }
    const finalChapters = Array.from(dedupedNavMap.values()).sort(
      (a, b) => Number(a.chapter_number) - Number(b.chapter_number)
    );

    const available_languages = Array.from(
      new Set((finalChapters || []).map((c) => (c as { language?: string }).language).filter(Boolean))
    );

    return NextResponse.json({
      manga,
      chapter,
      chapters: finalChapters,
      pages: sanitizedPages.length > 0 ? sanitizedPages : (pages || []),
      available_languages: available_languages.length > 0 ? available_languages : ['en'],
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
