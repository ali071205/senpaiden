import { NextRequest, NextResponse } from 'next/server';
import { getCachedMangaList } from '@/lib/cache';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const q = searchParams.get('q') || undefined;
    const genre = searchParams.get('genre') || undefined;
    const sort = searchParams.get('sort') || undefined;
    const included = searchParams.get('included') || undefined;
    const excluded = searchParams.get('excluded') || undefined;
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '24', 10);

    const result = await getCachedMangaList({
      q,
      genre,
      sort,
      included,
      excluded,
      page,
      limit,
    });

    return NextResponse.json(
      result,
      {
        headers: {
          'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=1800',
          'CDN-Cache-Control': 'public, s-maxage=300, stale-while-revalidate=1800',
          'Vercel-CDN-Cache-Control': 'public, s-maxage=300, stale-while-revalidate=1800',
        },
      }
    );
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
