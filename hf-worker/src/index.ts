// ============================================================
// HF Worker — Main Image Processing Pipeline (Phase 3)
//
// 1. Express health check (Port 7860) to keep HF Space alive
// 2. 60s Watchdog: Handles 5-minute processing timeouts
// 3. 10s Poll Loop: Claims QUEUED jobs, downloads, slices, uploads to R2
// ============================================================

import './polyfill.js';
import 'dotenv/config';
import dns from 'dns';
import express from 'express';
import { createClient } from '@supabase/supabase-js';
import { S3Client, PutObjectCommand, HeadBucketCommand, CreateBucketCommand } from '@aws-sdk/client-s3';
import sharp from 'sharp';
sharp.concurrency(0); // Auto-detect & use all available CPU cores for max slicing speed
import pLimit from 'p-limit';
import WebSocket from 'ws';
import { encode } from 'blurhash';
import { Agent, ProxyAgent, setGlobalDispatcher, fetch } from 'undici';

// Load Webshare rotating proxies from .env if available
const PROXY_LIST = process.env.ROTATING_PROXIES
  ? process.env.ROTATING_PROXIES.split(',').map(p => p.trim()).filter(Boolean)
  : [];

let proxyIndex = 0;
const proxyAgents: ProxyAgent[] = PROXY_LIST.map(uri => new ProxyAgent({
  uri,
  connect: { timeout: 30_000 }
}));

if (proxyAgents.length > 0) {
  console.log(`[Worker Engine] Loaded ${proxyAgents.length} Webshare rotating proxies for IP rotation.`);
}

function getNextDispatcher() {
  if (proxyAgents.length === 0) return undefined;
  const agent = proxyAgents[proxyIndex % proxyAgents.length];
  proxyIndex++;
  return agent;
}

// Increase Node undici socket connection timeout from 10s default to 60s
setGlobalDispatcher(new Agent({
  connect: {
    timeout: 60_000,
  },
  connections: 100
}));

// Force Node 20 DNS lookup to prefer IPv4 (fixes undici IPv6 timeout & ENOTFOUND)
if (dns.setDefaultResultOrder) {
  dns.setDefaultResultOrder('ipv4first');
}

// ── Configuration & Clients ───────────────────────────────────────────────────
const PORT = process.env.PORT || 7860;
const MAX_SLICE_HEIGHT = 1500;
const WEBP_QUALITY = 75;
const TIMEOUT_MINUTES = 10; // 10-minute timeout — aligned with CF Worker watchdog

// ── Supabase client (service role — full write access) ──────────────────────
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('[Worker] FATAL: SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in .env');
  console.error('[Worker] Copy .env.example to .env and fill in the required values.');
  process.exit(1);
}

const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_SERVICE_KEY,
  {
    auth: { persistSession: false },
    realtime: { transport: WebSocket as any } // Fix for Node 20 WebSocket support
  }
);

const r2 = new S3Client({
  region: process.env.R2_REGION || 'auto',
  endpoint: process.env.R2_ENDPOINT || `https://${process.env.R2_ACCOUNT_ID || 'dummy'}.r2.cloudflarestorage.com`,
  forcePathStyle: !!process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID || 'dummy_access_key',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || 'dummy_secret_key',
  },
});

const BUCKET_NAME = process.env.R2_BUCKET_NAME ?? 'manga-images';

// ── Bucket Auto-Creation Check ────────────────────────────────────────────────
async function ensureBucketExists() {
  if (process.env.USE_SUPABASE_STORAGE === 'true' || !process.env.R2_ENDPOINT) {
    try {
      await supabase.storage.createBucket(BUCKET_NAME, { public: true });
      console.log(`[Worker] Supabase Storage Bucket '${BUCKET_NAME}' verified.`);
    } catch (e) {
      console.log(`[Worker] Supabase Storage Bucket '${BUCKET_NAME}' ready.`);
    }
    return;
  }
  try {
    await r2.send(new HeadBucketCommand({ Bucket: BUCKET_NAME }));
    console.log(`[Worker] S3/R2 Bucket '${BUCKET_NAME}' verified.`);
  } catch (err: any) {
    console.log(`[Worker] Bucket '${BUCKET_NAME}' check: ${err?.message || err}. Attempting creation...`);
    try {
      await r2.send(new CreateBucketCommand({ Bucket: BUCKET_NAME }));
      console.log(`[Worker] Bucket '${BUCKET_NAME}' created successfully.`);
    } catch (createErr: any) {
      console.warn(`[Worker] Bucket creation note:`, createErr);
    }
  }
}

// ── Health Check Server ───────────────────────────────────────────────────────
const app = express();
app.get('/', (req, res) => res.json({ status: 'ok', worker: 'senpai-den-hf' }));
app.listen(PORT, () => console.log(`[Worker] Health check listening on port ${PORT}`)).on('error', (err: any) => {
  if (err.code === 'EADDRINUSE') {
    console.log(`[Worker] Health check port ${PORT} busy. Proceeding in secondary worker mode.`);
  } else {
    console.error('[Worker] Express server error:', err);
  }
});

// ── Types ─────────────────────────────────────────────────────────────────────
interface SliceDimension {
  width: number;
  height: number;
}

interface SliceResult {
  buffer: Buffer;
  dimension: SliceDimension;
  rawPixelData: { data: Buffer; info: { width: number; height: number } };
}

interface ProcessedPage {
  page_number: number;
  r2_keys: string[];
  slice_dimensions: SliceDimension[];
  blurhashes: string[];
}

// ── Rate Limiting & Robust Fetching ───────────────────────────────────────────
let lastMangaDexRequestTime = 0;
const MANGADEX_MIN_INTERVAL_MS = 1200; // ~50 req/min max rate limit buffer

async function waitMangaDexRateLimit() {
  const now = Date.now();
  const timeSinceLast = now - lastMangaDexRequestTime;
  if (timeSinceLast < MANGADEX_MIN_INTERVAL_MS) {
    const delay = MANGADEX_MIN_INTERVAL_MS - timeSinceLast;
    lastMangaDexRequestTime = now + delay;
    await new Promise(r => setTimeout(r, delay));
  } else {
    lastMangaDexRequestTime = now;
  }
}

async function fetchWithRetry(url: string, retries = 5, isMangaDexApi = false, customOpts: any = {}): Promise<any> {
  const headers: Record<string, string> = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
    ...(url.includes('readdetectiveconan.com') || url.includes('mangapill.com') ? { 'Referer': 'https://mangapill.com/' } : {}),
    ...(customOpts.headers || {})
  };

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      if (isMangaDexApi) {
        await waitMangaDexRateLimit();
      }

      const dispatcher = getNextDispatcher();
      const fetchOpts: any = { ...customOpts, headers, signal: AbortSignal.timeout(60000) };
      if (dispatcher) {
        fetchOpts.dispatcher = dispatcher;
      }

      // 60-second timeout per fetch request to accommodate large PNG downloads
      const res = await fetch(url, fetchOpts);

      if (res.status === 429) {
        const retryAfterHeader = res.headers.get('Retry-After');
        let waitMs = Math.pow(2, attempt) * 2000 + Math.random() * 1000;
        if (retryAfterHeader) {
          const parsedSec = parseInt(retryAfterHeader, 10);
          if (!isNaN(parsedSec)) waitMs = (parsedSec + 1) * 1000;
        }
        console.warn(`[Worker] Rate limited (HTTP 429) fetching ${url}. Retrying in ${Math.round(waitMs)}ms... (Attempt ${attempt + 1}/${retries})`);
        await new Promise(r => setTimeout(r, waitMs));
        continue;
      }

      if (res.status >= 500) {
        const waitMs = Math.pow(2, attempt) * 1000 + Math.random() * 500;
        console.warn(`[Worker] Server error (HTTP ${res.status}) fetching ${url}. Retrying in ${Math.round(waitMs)}ms...`);
        await new Promise(r => setTimeout(r, waitMs));
        continue;
      }

      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText}`);
      }

      return res;
    } catch (err: any) {
      if (attempt === retries - 1) throw err;
      const waitMs = Math.pow(2, attempt) * 1000 + Math.random() * 500;
      console.warn(`[Worker] Fetch error for ${url}: ${err.message || String(err)}. Retrying in ${Math.round(waitMs)}ms...`);
      await new Promise(r => setTimeout(r, waitMs));
    }
  }
  throw new Error(`Failed to fetch ${url} after ${retries} attempts`);
}

// Download image with exponential backoff
async function downloadImage(url: string, retries = 3): Promise<Buffer> {
  const res = await fetchWithRetry(url, retries, false, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      'Referer': url.includes('readdetectiveconan.com') || url.includes('mangapill.com') ? 'https://mangapill.com/' : 'https://mangadex.org/'
    }
  });
  return Buffer.from(await res.arrayBuffer());
}

// ── 1. Watchdog: Timeout Handler ──────────────────────────────────────────────
async function runWatchdog() {
  try {
    const cutoff = new Date(Date.now() - TIMEOUT_MINUTES * 60 * 1000).toISOString();
    
    const { data: timedOutChapters, error: fetchErr } = await supabase
      .from('chapters')
      .select('id, retry_count')
      .eq('job_status', 'PROCESSING')
      .lt('processing_started_at', cutoff);

    if (fetchErr) throw fetchErr;
    if (!timedOutChapters || timedOutChapters.length === 0) return;

    const ids = timedOutChapters.map(c => c.id);
    console.warn(`[Watchdog] Resetting ${ids.length} timed out chapters...`);
    
    const { error: resetErr } = await supabase
      .from('chapters')
      .update({
        job_status: 'QUEUED',
        processing_started_at: null,
        updated_at: new Date().toISOString(),
      })
      .in('id', ids);

    if (resetErr) {
      console.error('[Watchdog] Failed to batch reset timed out chapters:', resetErr);
    }
  } catch (err: any) {
    console.warn(`[Watchdog] Supabase connection notice: ${err?.message || String(err)}`);
  }
}
setInterval(runWatchdog, 60 * 1000); // Run every 60s

// ── 2. Image Processing Core (Supercharged) ───────────────────────────────────

// Slice image at 1500px boundaries for webtoons (height > 2500px); preserve standard manga pages intact
async function processImage(buffer: Buffer): Promise<SliceResult[]> {
  const image = sharp(buffer, { failOn: 'none' });
  const metadata = await image.metadata();
  
  if (!metadata.width || !metadata.height) {
    throw new Error('Invalid image metadata');
  }

  const { width, height } = metadata;
  const results: SliceResult[] = [];

  // Standard manga pages (height <= 2500px) should NEVER be sliced into stubs
  if (height <= 2500) {
    const slicePipeline = sharp(buffer, { failOn: 'none' });
    const [sliceBuffer, rawObj] = await Promise.all([
      slicePipeline
        .clone()
        .webp({ quality: WEBP_QUALITY, effort: 3 })
        .toBuffer(),
      slicePipeline
        .clone()
        .resize(16, 16, { fit: 'inside' })
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true })
    ]);

    results.push({
      buffer: sliceBuffer,
      dimension: { width, height },
      rawPixelData: {
        data: rawObj.data,
        info: { width: rawObj.info.width, height: rawObj.info.height }
      }
    });

    return results;
  }

  let currentY = 0;
  while (currentY < height) {
    const sliceHeight = Math.min(MAX_SLICE_HEIGHT, height - currentY);
    
    const slicePipeline = sharp(buffer, { failOn: 'none' })
      .extract({ left: 0, top: currentY, width, height: sliceHeight });

    const [sliceBuffer, rawObj] = await Promise.all([
      slicePipeline
        .clone()
        .webp({ quality: WEBP_QUALITY, effort: 3 })
        .toBuffer(),
      slicePipeline
        .clone()
        .resize(16, 16, { fit: 'inside' })
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true })
    ]);

    results.push({
      buffer: sliceBuffer,
      dimension: { width, height: sliceHeight },
      rawPixelData: {
        data: rawObj.data,
        info: { width: rawObj.info.width, height: rawObj.info.height }
      }
    });

    currentY += sliceHeight;
  }

  return results;
}

import { isGDriveConfigured, uploadFileToGDrive, getOrCreateFolder } from './gdrive.js';

// Upload buffer to Supabase Storage, Backblaze B2 S3, or Google Drive (5TB)
async function uploadToStorage(key: string, buffer: Buffer, chapterId?: string): Promise<string> {
  const useGDrive = process.env.STORAGE_PROVIDER === 'gdrive' || (isGDriveConfigured() && process.env.USE_GDRIVE === 'true');

  if (useGDrive) {
    let folderId = process.env.GDRIVE_ROOT_FOLDER_ID;
    if (chapterId) {
      const chFolder = await getOrCreateFolder(chapterId, folderId);
      if (chFolder) folderId = chFolder;
    }
    const fileName = key.split('/').pop() || key;
    const res = await uploadFileToGDrive(fileName, buffer, 'image/webp', folderId);
    if (res?.fileId) {
      return `gdrive/${res.fileId}`;
    }
  }

  if (process.env.USE_SUPABASE_STORAGE === 'true' || !process.env.R2_ENDPOINT) {
    const { error } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(key, buffer, {
        contentType: 'image/webp',
        cacheControl: '31536000',
        upsert: true,
      });
    if (error) throw error;
    return key;
  }

  await r2.send(new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    Body: buffer,
    ContentType: 'image/webp',
    CacheControl: 'public, max-age=31536000, immutable'
  }));
  return key;
}

// ── 3. Main Poll Loop ─────────────────────────────────────────────────────────
async function processNextJob() {
  try {
    // 0. Check maintenance mode before claiming any job
    try {
      const { data: isMaint } = await supabase.rpc('is_maintenance_mode');
      if (isMaint === true) {
        console.log('[Worker] Maintenance mode active — skipping job claim.');
        return false;
      }
    } catch {
      // If RPC doesn't exist yet (migration not applied), proceed normally
    }

    // 1. Claim a QUEUED job atomically via RPC
    const { data: qData, error: qErr } = await supabase
      .rpc('claim_next_chapter')
      .maybeSingle();

    if (qErr) throw qErr;
    if (!qData) return false; // No jobs

    const qChapter = qData as { id: string; chapter_number: number; source_url: string };
    const chapterId = qChapter.id;
    console.log(`[Worker] Claiming Chapter ${chapterId} (Ch. ${qChapter.chapter_number})`);

    try {
      // 2. Fetch image URLs from Provider API
      let fetchUrl = qChapter.source_url;
      let isMangaDex = false;

      const UNSUPPORTED_DOMAINS = [
        'mangaplus.shueisha.co.jp',
        'kodansha.us',
        'viz.com',
        'tapas.io',
        'webnovel.com',
        'tappytoon.com',
        'pocketcomics.com',
        'bilibilicomics.com',
        'j-novel.club',
        'mangadex.org/title/'
      ];

      if (UNSUPPORTED_DOMAINS.some(domain => fetchUrl.includes(domain))) {
        throw new Error(`External licensed provider unsupported: ${fetchUrl}`);
      }

      if (fetchUrl.includes('mangadex.org/chapter/')) {
        const chapterUuid = fetchUrl.split('/chapter/')[1]?.split('/')[0]?.split('?')[0];
        fetchUrl = `https://api.mangadex.org/at-home/server/${chapterUuid}`;
        isMangaDex = true;
      }

      let imageUrls: string[] = [];

      if (fetchUrl.includes('mangapill.com')) {
        console.log(`[Worker] Fetching MangaPill HTML page: ${fetchUrl}`);
        const htmlRes = await fetchWithRetry(fetchUrl, 5, false, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Referer': 'https://mangapill.com/'
          }
        });
        const htmlText = await htmlRes.text();
        const matches = [...htmlText.matchAll(/data-src="([^"]+)"/g)];
        imageUrls = matches.map(m => m[1]);
        if (imageUrls.length === 0) {
          throw new Error(`No images found on MangaPill page (${fetchUrl})`);
        }
      } else {
        const sourceRes = await fetchWithRetry(fetchUrl, 5, isMangaDex);
        const textBody = await sourceRes.text();

        if (textBody.trim().startsWith('<')) {
          throw new Error(`Provider returned HTML page instead of API JSON (${fetchUrl})`);
        }

        let sourceData: any;
        try {
          sourceData = JSON.parse(textBody);
        } catch (parseErr) {
          throw new Error(`Invalid JSON response from provider API (${textBody.slice(0, 100)})`);
        }

        if (isMangaDex) {
          const baseUrl = sourceData.baseUrl;
          const hash = sourceData.chapter?.hash;
          const files = sourceData.chapter?.data || [];
          if (baseUrl && hash && files.length > 0) {
            imageUrls = files.map((f: string) => `${baseUrl}/data/${hash}/${f}`);
          }
        } else {
          const rawImgs = sourceData?.images ?? sourceData?.data ?? sourceData?.chapterImages?.map((i: any) => i.image ?? i);
          imageUrls = Array.isArray(rawImgs) ? rawImgs : [];
        }
      }
      
      if (imageUrls.length === 0) throw new Error('No images returned by provider endpoint');

      // 3. Process pages in parallel
      const validUrls = imageUrls.filter(url => typeof url === 'string' && url.startsWith('http'));
      if (validUrls.length === 0) throw new Error('No valid image URLs found');

      console.log(`[Worker] Processing ${validUrls.length} pages in parallel...`);
      const limit = pLimit(4); // Throttled page concurrency for stable memory & network utilization

      const processedPages: ProcessedPage[] = await Promise.all(
        validUrls.map((url, idx) => limit(async () => {
          const pageNumber = idx + 1;
          
          const rawBuffer = await downloadImage(url);
          const slices = await processImage(rawBuffer);

          const r2Keys: string[] = [];
          const blurhashes: string[] = [];

          for (let sliceIdx = 0; sliceIdx < slices.length; sliceIdx++) {
            const key = `manga/${chapterId}/${pageNumber}_${sliceIdx}.webp`;
            const slice = slices[sliceIdx]!;

            const savedKey = await uploadToStorage(key, slice.buffer, chapterId);
            r2Keys.push(savedKey);

            // Fast Blurhash computation using 16x16 raw pixel buffer
            try {
              const bHash = encode(
                new Uint8ClampedArray(slice.rawPixelData.data), 
                slice.rawPixelData.info.width, 
                slice.rawPixelData.info.height, 
                3, 
                3
              );
              blurhashes.push(bHash);
            } catch (e) {
              blurhashes.push('LEHV6nWB2yk8pyo0adR*.7kCMdnj');
            }
          }

          return {
            page_number: pageNumber,
            r2_keys: r2Keys,
            slice_dimensions: slices.map(s => s.dimension),
            blurhashes
          };
        }))
      );

      // 4. Single Bulk Upsert to Database (Idempotent: prevents duplicate key violations on retried chapters)
      console.log(`[Worker] Saving ${processedPages.length} pages to DB (bulk upsert)...`);
      const { error: insertErr } = await supabase.from('pages').upsert(
        processedPages.map(page => ({
          chapter_id: chapterId,
          page_number: page.page_number,
          r2_keys: page.r2_keys,
          slice_dimensions: JSON.stringify(page.slice_dimensions),
          blurhash: JSON.stringify(page.blurhashes)
        })),
        { onConflict: 'chapter_id,page_number' }
      );
      if (insertErr) throw insertErr;

      // 5. Mark READY
      await supabase
        .from('chapters')
        .update({ job_status: 'READY', updated_at: new Date().toISOString() })
        .eq('id', chapterId);

      console.log(`[Worker] Chapter ${chapterId} COMPLETE. ✓`);
      return true;

    } catch (innerErr) {
      console.error(`[Worker] Job Failed for chapter ${chapterId}:`, innerErr);
      
      await supabase
        .from('chapters')
        .update({ job_status: 'FAILED', updated_at: new Date().toISOString() })
        .eq('id', chapterId);
        
      await supabase.from('dead_letter_queue').insert({
        chapter_id: chapterId,
        error_type: 'PROCESSING_ERROR',
        error_detail: String(innerErr),
        max_retries: parseInt(process.env.DLQ_MAX_RETRIES ?? '3', 10),
      });
      return true;
    }

  } catch (err: any) {
    console.warn(`[Worker] Supabase connection notice: ${err?.message || String(err)}`);
    return false;
  }
}

async function requeueFailedJobs() {
  try {
    // Only re-queue chapters that haven't exceeded the retry limit (3 attempts max)
    const { data, error } = await supabase
      .from('chapters')
      .select('id, retry_count')
      .eq('job_status', 'FAILED')
      .lt('retry_count', 3);

    if (error || !data || data.length === 0) return;

    const retryableIds = data.map(c => c.id);

    // Increment retry_count and re-queue
    const { error: updateErr } = await supabase
      .from('chapters')
      .update({
        job_status: 'QUEUED',
        retry_count: data[0]?.retry_count !== undefined ? undefined : 0, // Will be set per-row below
        updated_at: new Date().toISOString(),
      })
      .in('id', retryableIds);

    if (updateErr) {
      console.warn(`[Worker] Re-queue update failed: ${updateErr.message}`);
      return;
    }

    // Increment retry_count for each re-queued chapter
    for (const ch of data) {
      await supabase
        .from('chapters')
        .update({ retry_count: (ch.retry_count || 0) + 1 })
        .eq('id', ch.id);
    }

    console.log(`[Worker] Re-queued ${retryableIds.length} FAILED chapters (retry_count < 3). ${
      data.length < retryableIds.length ? `Skipped chapters at max retries.` : ''
    }`);
  } catch (e: any) {
    console.warn(`[Worker] Re-queue check notice: ${e?.message || e}`);
  }
}

// Multi-Worker Parallel Loop: Run worker threads
const CONCURRENT_WORKERS = parseInt(process.env.WORKER_CONCURRENCY || '2', 10);

async function startWorkerThread(workerId: number) {
  console.log(`[Worker Thread ${workerId}] Started.`);
  let emptyCount = 0;

  while (true) {
    try {
      const didProcess = await processNextJob();
      if (didProcess) {
        emptyCount = 0;
        // Processed a job successfully, check immediately for next job
        await new Promise(r => setTimeout(r, 200));
      } else {
        emptyCount++;
        // Exponential backoff with jitter: 5s -> 7.5s -> 11s -> 17s -> 25s -> max 30s (+ 0-2s jitter)
        const baseDelay = Math.min(5000 * Math.pow(1.5, Math.min(emptyCount - 1, 5)), 30000);
        const jitter = Math.random() * 2000;
        const sleepMs = Math.round(baseDelay + jitter);
        await new Promise(r => setTimeout(r, sleepMs));
      }
    } catch (err) {
      console.error(`[Worker Thread ${workerId}] Fatal error:`, err);
      await new Promise(r => setTimeout(r, 10000));
    }
  }
}

// Launch engine
setTimeout(async () => {
  await ensureBucketExists();
  await requeueFailedJobs();
  console.log(`[Worker Engine] Launching ${CONCURRENT_WORKERS} parallel processing threads...`);
  for (let i = 1; i <= CONCURRENT_WORKERS; i++) {
    startWorkerThread(i);
    await new Promise(r => setTimeout(r, 500)); // Stagger launch by 500ms to smooth out initial socket connections
  }
}, 1000);

