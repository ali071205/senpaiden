import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; chapter: string }> }
) {
  try {
    const supabase = getSupabase();
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase environment variables not configured.' }, { status: 500 });
    }

    const { id: mangaId, chapter: chapterNumStr } = await params;
    const chapterNumber = parseFloat(chapterNumStr);

    // Fetch manga details
    const { data: manga, error: mangaErr } = await supabase
      .from('manga')
      .select('*')
      .eq('id', mangaId)
      .single();

    if (mangaErr || !manga) {
      return NextResponse.json({ error: 'Manga not found' }, { status: 404 });
    }

    // Fetch all chapters for navigation
    const { data: chapters } = await supabase
      .from('chapters')
      .select('id, chapter_number, title, job_status, language, scanlation_group')
      .eq('manga_id', mangaId)
      .order('chapter_number', { ascending: true });

    // Fetch current target chapter
    let { data: chapter } = await supabase
      .from('chapters')
      .select('*')
      .eq('manga_id', mangaId)
      .eq('chapter_number', chapterNumber)
      .maybeSingle();

    // If chapter record is missing or failed, create a placeholder in memory/DB
    if (!chapter) {
      const newChapterId = crypto.randomUUID();
      const newCh = {
        id: newChapterId,
        manga_id: mangaId,
        chapter_number: chapterNumber,
        title: `Chapter ${chapterNumber}`,
        job_status: 'READY',
      };
      try {
        await supabase.from('chapters').insert(newCh);
      } catch {}
      chapter = newCh as any;
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

    // Fallback: If pages are missing or contain un-hosted relative keys (manga/..., gdrive/...), resolve live MangaDex pages
    const hasInvalidKeys = pages && pages.length > 0 && pages.some(p => 
      !Array.isArray(p.r2_keys) || 
      p.r2_keys.length === 0 || 
      p.r2_keys.some((k: string) => !k.startsWith('http://') && !k.startsWith('https://'))
    );

    if (!pages || pages.length === 0 || hasInvalidKeys) {
      try {
        let chapterUuid = '';
        if (chapter.source_url && chapter.source_url.includes('mangadex.org/chapter/')) {
          chapterUuid = chapter.source_url.split('mangadex.org/chapter/')[1]?.split('/')[0]?.split('?')[0] || '';
        }

        if (!chapterUuid && manga.source_id && /^[0-9a-f-]{36}$/i.test(manga.source_id)) {
          const chRes = await fetch(
            `https://api.mangadex.org/chapter?manga=${manga.source_id}&chapter=${chapterNumber}&limit=15&order[readableAt]=desc`,
            { signal: AbortSignal.timeout(8000) }
          );
          if (chRes.ok) {
            const chData = await chRes.json();
            if (chData.data && chData.data.length > 0) {
              const enCh = chData.data.find((c: any) => c.attributes.pages > 0 && c.attributes.translatedLanguage === 'en') ||
                           chData.data.find((c: any) => c.attributes.pages > 0) ||
                           chData.data[0];
              if (enCh && enCh.attributes?.pages > 0) chapterUuid = enCh.id;
            }
          }
        }

        if (!chapterUuid) {
          // Search MangaDex by manga title if source_id did not yield readable pages
          const searchRes = await fetch(
            `https://api.mangadex.org/manga?title=${encodeURIComponent(manga.title)}&limit=1`,
            { signal: AbortSignal.timeout(8000) }
          );
          if (searchRes.ok) {
            const searchJson = await searchRes.json();
            const foundId = searchJson.data?.[0]?.id;
            if (foundId) {
              const chRes = await fetch(
                `https://api.mangadex.org/chapter?manga=${foundId}&chapter=${chapterNumber}&limit=15&order[readableAt]=desc`,
                { signal: AbortSignal.timeout(8000) }
              );
              if (chRes.ok) {
                const chData = await chRes.json();
                const enCh = chData.data?.find((c: any) => c.attributes.pages > 0 && c.attributes.translatedLanguage === 'en') ||
                             chData.data?.find((c: any) => c.attributes.pages > 0) ||
                             chData.data?.[0];
                if (enCh) chapterUuid = enCh.id;
              }
            }
          }
        }

        // If chapter source is MangaPill
        if ((!pages || pages.length === 0 || hasInvalidKeys) && chapter.source_url && chapter.source_url.includes('mangapill.com/chapters/')) {
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
              }
            }
          } catch (e) {
            console.warn('[Chapter Route] MangaPill scrape error:', e);
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
              const livePages = files.map((file: string, idx: number) => ({
                chapter_id: chapter.id,
                page_number: idx + 1,
                r2_keys: [`https://uploads.mangadex.org/data/${hash}/${file}`],
                slice_dimensions: [{ width: 800, height: 1200 }],
              }));

              // Background update to cache in Supabase
              try {
                await supabase.from('pages').delete().eq('chapter_id', chapter.id);
                await supabase.from('pages').insert(livePages);
              } catch {}

              pages = livePages as any;
            }
          }
        }
      } catch (err) {
        console.warn('[Chapter Route] Live page fetch fallback error:', err);
      }
    }

    // Sanitize pages: never return broken gdrive or un-hosted local keys to client
    const sanitizedPages = (pages || []).filter(p => {
      if (!Array.isArray(p.r2_keys) || p.r2_keys.length === 0) return false;
      return p.r2_keys.some((k: string) => k.startsWith('http://') || k.startsWith('https://'));
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
