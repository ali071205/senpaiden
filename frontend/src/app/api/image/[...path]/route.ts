import { NextRequest, NextResponse } from 'next/server';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { fetchFileFromGDrive } from '@/lib/gdrive';

function getS3Client() {
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!accessKeyId || !secretAccessKey) return null;

  return new S3Client({
    region: process.env.R2_REGION || 'us-east-005',
    endpoint: process.env.R2_ENDPOINT || 'https://s3.us-east-005.backblazeb2.com',
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });
}

interface CachedProxyImage {
  buffer: Uint8Array;
  contentType: string;
}

const MAX_IMAGE_CACHE_ENTRIES = 500;
const imageProxyCache = new Map<string, CachedProxyImage>();
const inFlightImageFetches = new Map<string, Promise<CachedProxyImage | null>>();

const FALLBACK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1200" viewBox="0 0 800 1200">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0a0a12"/>
      <stop offset="50%" stop-color="#131224"/>
      <stop offset="100%" stop-color="#08070d"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#8B5CF6" stop-opacity="0.18"/>
      <stop offset="100%" stop-color="#8B5CF6" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#bg)"/>
  <circle cx="400" cy="600" r="300" fill="url(#glow)"/>
  <rect x="30" y="30" width="740" height="1140" rx="16" fill="none" stroke="#8B5CF6" stroke-opacity="0.15" stroke-width="2"/>
  <text x="400" y="580" text-anchor="middle" fill="#8B5CF6" font-family="system-ui, -apple-system, sans-serif" font-size="24" font-weight="800" letter-spacing="4">SENPAI DEN</text>
  <text x="400" y="620" text-anchor="middle" fill="#A1A1AA" font-family="system-ui, -apple-system, sans-serif" font-size="14">Processing Page Artwork...</text>
</svg>`;
const FALLBACK_SVG_BUFFER = Buffer.from(FALLBACK_SVG);

const IMMUTABLE_HEADERS: Record<string, string> = {
  'Cache-Control': 'public, max-age=31536000, s-maxage=31536000, stale-while-revalidate=86400, immutable',
  'CDN-Cache-Control': 'public, max-age=31536000, immutable',
  'Vercel-CDN-Cache-Control': 'public, max-age=31536000, immutable',
  'Access-Control-Allow-Origin': '*',
};

const FALLBACK_HEADERS: Record<string, string> = {
  'Content-Type': 'image/svg+xml',
  'Cache-Control': 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800',
  'CDN-Cache-Control': 'public, max-age=86400',
  'Vercel-CDN-Cache-Control': 'public, max-age=86400',
  'Access-Control-Allow-Origin': '*',
};

export async function GET(_req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const key = path.join('/');

  if (!key) {
    return new NextResponse('Bad Request', { status: 400 });
  }

  // 0. Image Proxy for external CDNs (with anti-hotlinking referer support and high-speed memory cache)
  if (path[0] === 'proxy') {
    const targetUrl = _req.nextUrl.searchParams.get('url');
    if (!targetUrl) {
      return new NextResponse('Bad Request: Missing url param', { status: 400 });
    }

    // A. Return from memory cache if available (0ms response)
    const cached = imageProxyCache.get(targetUrl);
    if (cached) {
      return new NextResponse(Buffer.from(cached.buffer), {
        headers: {
          'Content-Type': cached.contentType,
          ...IMMUTABLE_HEADERS,
        },
      });
    }

    // B. De-duplicate concurrent in-flight fetches for the exact same image URL
    try {
      let fetchPromise = inFlightImageFetches.get(targetUrl);
      if (!fetchPromise) {
        fetchPromise = (async () => {
          try {
            const headers: Record<string, string> = {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
              'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
            };
            if (targetUrl.includes('readdetectiveconan.com') || targetUrl.includes('mangapill.com') || targetUrl.includes('atsu.moe')) {
              headers['Referer'] = 'https://mangapill.com/';
            }
            const upstreamRes = await fetch(targetUrl, {
              headers,
              signal: AbortSignal.timeout(3500),
            });

            if (upstreamRes.ok) {
              const contentType = upstreamRes.headers.get('content-type') || 'image/jpeg';
              const arrayBuf = await upstreamRes.arrayBuffer();
              const item: CachedProxyImage = {
                buffer: new Uint8Array(arrayBuf),
                contentType,
              };
              if (imageProxyCache.size >= MAX_IMAGE_CACHE_ENTRIES) {
                const oldestKey = imageProxyCache.keys().next().value;
                if (oldestKey) imageProxyCache.delete(oldestKey);
              }
              imageProxyCache.set(targetUrl, item);
              return item;
            }

            // If upstream responded with non-200 (e.g. 404), cache the stylized fallback SVG
            const fallbackItem: CachedProxyImage = {
              buffer: new Uint8Array(FALLBACK_SVG_BUFFER),
              contentType: 'image/svg+xml',
            };
            imageProxyCache.set(targetUrl, fallbackItem);
            return fallbackItem;
          } catch {
            // If fetch timed out or failed, cache fallback to prevent continuous thread blocking
            const fallbackItem: CachedProxyImage = {
              buffer: new Uint8Array(FALLBACK_SVG_BUFFER),
              contentType: 'image/svg+xml',
            };
            imageProxyCache.set(targetUrl, fallbackItem);
            return fallbackItem;
          }
        })().finally(() => {
          inFlightImageFetches.delete(targetUrl);
        });

        inFlightImageFetches.set(targetUrl, fetchPromise);
      }

      const result = await fetchPromise;
      if (result) {
        return new NextResponse(Buffer.from(result.buffer), {
          headers: {
            'Content-Type': result.contentType,
            ...IMMUTABLE_HEADERS,
          },
        });
      }
      return new NextResponse(FALLBACK_SVG_BUFFER, {
        headers: FALLBACK_HEADERS,
      });
    } catch {
      return new NextResponse(FALLBACK_SVG_BUFFER, {
        headers: FALLBACK_HEADERS,
      });
    }
  }

  // 1. Direct Google Drive fileId path: /api/image/gdrive/<fileId>
  if (path[0] === 'gdrive' && path[1]) {
    const fileId = path[1];
    const decryptedBuffer = await fetchFileFromGDrive(fileId);
    if (decryptedBuffer) {
      return new NextResponse(new Uint8Array(decryptedBuffer), {
        headers: {
          'Content-Type': 'image/webp',
          ...IMMUTABLE_HEADERS,
        },
      });
    }
    return new NextResponse('Image Not Found on Google Drive', { status: 404 });
  }

  const s3 = getS3Client();
  const bucketName = process.env.R2_BUCKET_NAME || 'senpaiden-mangas';

  // 2. Primary: Backblaze B2 S3 storage
  try {
    if (s3) {
      const command = new GetObjectCommand({
        Bucket: bucketName,
        Key: key,
      });

      const response = await s3.send(command);

      if (response.Body) {
        const byteArray = await response.Body.transformToByteArray();
        const contentType = response.ContentType || 'image/webp';

        return new NextResponse(new Uint8Array(byteArray), {
          headers: {
            'Content-Type': contentType,
            ...IMMUTABLE_HEADERS,
          },
        });
      }
    }
  } catch {
    // 3. Fallback: Supabase Storage for legacy uploaded images
    try {
      const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
      if (supabaseUrl) {
        const fallbackUrl = `${supabaseUrl}/storage/v1/object/public/manga-images/${key}`;
        const fallbackRes = await fetch(fallbackUrl, {
          signal: AbortSignal.timeout(3000),
        });

        if (fallbackRes.ok) {
          const fallbackBlob = await fallbackRes.arrayBuffer();
          const contentType = fallbackRes.headers.get('content-type') || 'image/webp';

          return new NextResponse(fallbackBlob, {
            headers: {
              'Content-Type': contentType,
              ...IMMUTABLE_HEADERS,
            },
          });
        }
      }
      // 4. MinIO local storage check (Only in local development)
      if (process.env.NODE_ENV === 'development') {
        try {
          const minioRes = await fetch(`http://localhost:9000/manga-images/${key}`, {
            signal: AbortSignal.timeout(1000),
          });
          if (minioRes.ok) {
            const minioBlob = await minioRes.arrayBuffer();
            const contentType = minioRes.headers.get('content-type') || 'image/webp';
            return new NextResponse(minioBlob, {
              headers: {
                'Content-Type': contentType,
                ...IMMUTABLE_HEADERS,
              },
            });
          }
        } catch {}
      }
    } catch {
      // Ignore fallback errors
    }
  }

  return new NextResponse(FALLBACK_SVG, {
    headers: FALLBACK_HEADERS,
  });
}
