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

    // Fetch all chapters for navigation (up to 5,000 for long-running series)
    const { data: chapters } = await supabase
      .from('chapters')
      .select('id, chapter_number, title, job_status, language, scanlation_group')
      .eq('manga_id', mangaId)
      .order('chapter_number', { ascending: true })
      .limit(5000);

    // Fetch current target chapter (prioritizing English and READY status)
    const { data: candidateChapters } = await supabase
      .from('chapters')
      .select('*')
      .eq('manga_id', mangaId)
      .eq('chapter_number', chapterNumber)
      .limit(10);

    // Pick English or first ready candidate
    let chapter = candidateChapters?.find((c) => c.language === 'en') || candidateChapters?.[0];

    // If chapter record is missing, query upstream provider to resolve a valid semantic source URL
    if (!chapter) {
      const newChapterId = crypto.randomUUID();
      let resolvedSourceUrl = '';
      let resolvedLanguage = 'en';

      // 1. Check MangaDex if source_id is a UUID or provider is mangadex
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

      // 2. Only persist to DB if a real valid upstream source URL was obtained
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
        // No valid upstream source URL found yet: keep candidate safely in memory without violating NOT NULL
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
        let livePagesResolved = false;

        // 1. If chapter source is MangaPill, prioritize MangaPill
        if (chapter.source_url && chapter.source_url.includes('mangapill.com/chapters/')) {
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
                const livePages = imgMatches.map((imgUrl: string, idx: number) => ({
                  chapter_id: chapter.id,
                  page_number: idx + 1,
                  r2_keys: [imgUrl],
                  slice_dimensions: [{ width: 800, height: 1200 }],
                }));
                try {
                  await supabase.from('pages').delete().eq('chapter_id', chapter.id);
                  await supabase.from('pages').insert(livePages);
                } catch {}
                pages = livePages as any;
                livePagesResolved = true;
              }
            }
          } catch (e) {
            console.warn('[Chapter Route] MangaPill scrape error:', e);
          }
        }

        // 2. If not resolved via MangaPill, attempt MangaDex resolution
        if (!livePagesResolved) {
          let chapterUuid = '';
          if (chapter.source_url && chapter.source_url.includes('mangadex.org/chapter/')) {
            chapterUuid = chapter.source_url.split('mangadex.org/chapter/')[1]?.split('/')[0]?.split('?')[0] || '';
          }

          // First try the specific chapterUuid if available
          if (chapterUuid) {
            try {
              const atHomeRes = await fetch(
                `https://api.mangadex.org/at-home/server/${chapterUuid}`,
                { signal: AbortSignal.timeout(8000) }
              );
              if (atHomeRes.ok) {
                const atHomeJson = await atHomeRes.json();
                const hash = atHomeJson.chapter?.hash;
                const files = atHomeJson.chapter?.data || [];
                if (hash && files.length > 0) {
                  const livePages = files.map((file: string, idx: number) => ({
                    chapter_id: chapter.id,
                    page_number: idx + 1,
                    r2_keys: [`https://uploads.mangadex.org/data/${hash}/${file}`],
                    slice_dimensions: [{ width: 800, height: 1200 }],
                  }));
                  try {
                    await supabase.from('pages').delete().eq('chapter_id', chapter.id);
                    await supabase.from('pages').insert(livePages);
                  } catch {}
                  pages = livePages as any;
                  livePagesResolved = true;
                }
              }
            } catch {}
          }

          // If the specific chapterUuid had 0 pages (e.g. external link to Tapas) or failed,
          // search MangaDex for alternative readable candidates with pages > 0!
          if (!livePagesResolved) {
            let dexMangaId = '';
            if (manga.source_id && /^[0-9a-f-]{36}$/i.test(manga.source_id)) {
              dexMangaId = manga.source_id;
            } else {
              try {
                const searchRes = await fetch(
                  `https://api.mangadex.org/manga?title=${encodeURIComponent(manga.title)}&limit=1`,
                  { signal: AbortSignal.timeout(8000) }
                );
                if (searchRes.ok) {
                  const searchJson = await searchRes.json();
                  dexMangaId = searchJson.data?.[0]?.id || '';
                }
              } catch {}
            }

            if (dexMangaId) {
              try {
                const chRes = await fetch(
                  `https://api.mangadex.org/chapter?manga=${dexMangaId}&chapter=${chapterNumber}&limit=25&order[readableAt]=desc`,
                  { signal: AbortSignal.timeout(8000) }
                );
                if (chRes.ok) {
                  const chData = await chRes.json();
                  const candidates = (chData.data || []).filter((c: any) => 
                    (c.attributes?.pages > 0 || c.attributes?.data?.length > 0) && !c.attributes?.externalUrl
                  );
                  const enCh = candidates.find((c: any) => c.attributes?.translatedLanguage === 'en') ||
                               candidates[0];
                  if (enCh) {
                    const atHomeRes = await fetch(
                      `https://api.mangadex.org/at-home/server/${enCh.id}`,
                      { signal: AbortSignal.timeout(8000) }
                    );
                    if (atHomeRes.ok) {
                      const atHomeJson = await atHomeRes.json();
                      const hash = atHomeJson.chapter?.hash;
                      const files = atHomeJson.chapter?.data || [];
                      if (hash && files.length > 0) {
                        const livePages = files.map((file: string, idx: number) => ({
                          chapter_id: chapter.id,
                          page_number: idx + 1,
                          r2_keys: [`https://uploads.mangadex.org/data/${hash}/${file}`],
                          slice_dimensions: [{ width: 800, height: 1200 }],
                        }));

                        try {
                          await supabase.from('pages').delete().eq('chapter_id', chapter.id);
                          await supabase.from('pages').insert(livePages);
                          await supabase.from('chapters').update({
                            source_url: `https://mangadex.org/chapter/${enCh.id}`,
                            language: enCh.attributes?.translatedLanguage || chapter.language,
                          }).eq('id', chapter.id);
                        } catch {}

                        pages = livePages as any;
                        livePagesResolved = true;
                      }
                    }
                  }
                }
              } catch (e) {
                console.warn('[Chapter Route] MangaDex candidate fetch error:', e);
              }
            }
          }
        }
      } catch (err) {
        console.warn('[Chapter Route] Live page fetch fallback error:', err);
      }
    }

    // Sanitize pages: filter out records with no keys
    const sanitizedPages = (pages || []).filter(p => {
      if (!Array.isArray(p.r2_keys) || p.r2_keys.length === 0) return false;
      return p.r2_keys.some((k: string) => typeof k === 'string' && k.length > 0);
    });

    const available_languages = Array.from(
      new Set((chapters || []).map((c) => (c as { language?: string }).language).filter(Boolean))
    );

    return NextResponse.json({
      manga,
      chapter,
      chapters: chapters || [],
      pages: sanitizedPages.length > 0 ? sanitizedPages : (pages || []),
      available_languages: available_languages.length > 0 ? available_languages : ['en'],
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
