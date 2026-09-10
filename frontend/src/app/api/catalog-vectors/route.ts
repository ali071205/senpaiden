import { NextRequest, NextResponse } from 'next/server';
import { getCachedCatalogVectors } from '@/lib/cache';
import { AGE_RESTRICTION_COOKIE } from '@/lib/age-restriction';

export async function GET(req: NextRequest) {
  try {
    const allow18Plus = req.cookies.get(AGE_RESTRICTION_COOKIE)?.value === 'true';
    const catalog = await getCachedCatalogVectors(allow18Plus);
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
