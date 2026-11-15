import { NextRequest, NextResponse } from 'next/server';
import { getCachedMangaDetail } from '@/lib/cache';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const result = await getCachedMangaDetail(id);

    if (!result) {
      return NextResponse.json({ error: 'Manga not found' }, { status: 404 });
    }

    return NextResponse.json(
      result,
      {
        headers: {
          'Cache-Control': 'public, s-maxage=1800, stale-while-revalidate=86400',
          'CDN-Cache-Control': 'public, s-maxage=1800, stale-while-revalidate=86400',
          'Vercel-CDN-Cache-Control': 'public, s-maxage=1800, stale-while-revalidate=86400',
        },
      }
    );
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
