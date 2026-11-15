import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';
import { resolveMangaRecord } from '@/lib/cache';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = getSupabase();
    if (!supabase) {
      return NextResponse.json({ error: 'Database unconfigured' }, { status: 500 });
    }

    const { id } = await params;
    const manga = await resolveMangaRecord(id, supabase);
    if (!manga) {
      return NextResponse.json({ error: 'Manga not found' }, { status: 404 });
    }

    const allChapters: any[] = [];
    let from = 0;
    while (true) {
      const { data: chunk, error } = await supabase
        .from('chapters')
        .select('id, chapter_number, title, job_status, language, scanlation_group, created_at')
        .eq('manga_id', manga.id)
        .order('chapter_number', { ascending: true })
        .range(from, from + 999);

      if (error || !chunk || chunk.length === 0) break;
      allChapters.push(...chunk);
      if (chunk.length < 1000) break;
      from += 1000;
    }

    return NextResponse.json(
      { chapters: allChapters },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
          'CDN-Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
          'Vercel-CDN-Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
        },
      }
    );
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Server error' }, { status: 500 });
  }
}
