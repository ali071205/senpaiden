import { NextResponse } from 'next/server';
import { getCachedCatalogVectors } from '@/lib/cache';

export async function GET() {
  try {
    const catalog = await getCachedCatalogVectors(false);
    return NextResponse.json(
      { catalog },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
        },
      }
    );
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
