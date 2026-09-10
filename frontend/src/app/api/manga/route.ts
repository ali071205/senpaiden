import { NextRequest, NextResponse } from 'next/server';
import { getCachedMangaList } from '@/lib/cache';
import { AGE_RESTRICTION_COOKIE } from '@/lib/age-restriction';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const q = searchParams.get('q') || undefined;
    const genre = searchParams.get('genre') || undefined;
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '24', 10);
    const allow18Plus = req.cookies.get(AGE_RESTRICTION_COOKIE)?.value === 'true' || searchParams.get('mature') === 'true';

    const result = await getCachedMangaList({ q, genre, page, limit, allow18Plus });

    return NextResponse.json(
      result,
      {
        headers: {
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
        },
      }
    );
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
