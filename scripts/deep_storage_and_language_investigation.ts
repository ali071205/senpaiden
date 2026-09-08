import ws from 'ws';
(globalThis as any).WebSocket = ws;

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || '';

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false },
});

// Regex to test Japanese characters (Hiragana, Katakana, CJK Unified Ideographs)
const japaneseRegex = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/;

async function checkStorageAndLanguages() {
  console.log('=====================================================');
  console.log('🔍 DEEP STORAGE & LANGUAGE AUDIT');
  console.log('=====================================================\n');

  // 1. Check Supabase Storage Buckets (Binary Data)
  console.log('1. Checking Supabase Storage Buckets for stored binary files...');
  try {
    const { data: buckets, error: bErr } = await supabase.storage.listBuckets();
    if (bErr) {
      console.log('Error listing buckets:', bErr.message);
    } else {
      console.log(`Found ${buckets?.length || 0} buckets in Supabase Storage:`, buckets?.map(b => b.name));
      for (const b of buckets || []) {
        const { data: files, error: fErr } = await supabase.storage.from(b.name).list('', { limit: 10 });
        console.log(`- Bucket '${b.name}' (public: ${b.public}): sample ${files?.length || 0} items`);
      }
    }
  } catch (err: any) {
    console.log('Storage check error:', err.message);
  }

  // 2. Sample 5,000 pages to inspect r2_keys patterns
  console.log('\n2. Inspecting pages.r2_keys patterns across database...');
  const { data: samplePages, error: pErr } = await supabase
    .from('pages')
    .select('id, r2_keys, slice_dimensions')
    .limit(5000);

  const keyPrefixCount: Record<string, number> = {};
  let totalKeysInspected = 0;
  let emptyKeysCount = 0;

  for (const p of samplePages || []) {
    const keys = p.r2_keys || [];
    if (keys.length === 0) {
      emptyKeysCount++;
      continue;
    }
    for (const k of keys) {
      totalKeysInspected++;
      if (typeof k !== 'string') continue;
      if (k.startsWith('gdrive/')) {
        keyPrefixCount['Google Drive (gdrive/...)'] = (keyPrefixCount['Google Drive (gdrive/...)'] || 0) + 1;
      } else if (k.startsWith('manga/')) {
        keyPrefixCount['Cloudflare R2 / S3 (manga/...)'] = (keyPrefixCount['Cloudflare R2 / S3 (manga/...)'] || 0) + 1;
      } else if (k.includes('supabase.co')) {
        keyPrefixCount['Supabase Storage URL'] = (keyPrefixCount['Supabase Storage URL'] || 0) + 1;
      } else if (k.includes('mangadex.org')) {
        keyPrefixCount['MangaDex Direct URL'] = (keyPrefixCount['MangaDex Direct URL'] || 0) + 1;
      } else if (k.startsWith('http://') || k.startsWith('https://')) {
        const urlObj = new URL(k);
        keyPrefixCount[`HTTP URL (${urlObj.hostname})`] = (keyPrefixCount[`HTTP URL (${urlObj.hostname})`] || 0) + 1;
      } else {
        const prefix = k.split('/')[0] || 'other';
        keyPrefixCount[`Other prefix (${prefix})`] = (keyPrefixCount[`Other prefix (${prefix})`] || 0) + 1;
      }
    }
  }

  console.log('Pages Sample Key Distribution:', keyPrefixCount);
  console.log(`Total sample keys: ${totalKeysInspected}, Empty keys in sample: ${emptyKeysCount}`);

  // 3. Inspect Manga Titles & Languages
  console.log('\n3. Analyzing Manga Titles, Japanese text, Romaji & Scanlation groups...');
  const { data: mangas } = await supabase.from('manga').select('*').order('title', { ascending: true });
  const { data: sampleChapters } = await supabase.from('chapters').select('id, manga_id, title, source_url, scanlation_group, language').limit(1000);

  const chaptersByManga = new Map<string, any[]>();
  for (const c of sampleChapters || []) {
    const list = chaptersByManga.get(c.manga_id) || [];
    list.push(c);
    chaptersByManga.set(c.manga_id, list);
  }

  let japaneseScriptCount = 0;
  let romajiOrJapaneseList: any[] = [];
  let englishCleanList: any[] = [];

  for (const m of mangas || []) {
    const hasJapaneseChars = japaneseRegex.test(m.title) || (m.description && japaneseRegex.test(m.description));
    const chs = chaptersByManga.get(m.id) || [];
    const scanGroups = Array.from(new Set(chs.map(c => c.scanlation_group).filter(Boolean)));
    const sampleUrls = chs.map(c => c.source_url).filter(Boolean).slice(0, 2);

    // Check if title is Japanese Romaji or Japanese script
    const titleLower = m.title.toLowerCase();
    const isRomajiLike = titleLower.includes('no ') || 
                         titleLower.includes(' wa ') || 
                         titleLower.includes(' ga ') || 
                         titleLower.includes(' ni ') || 
                         titleLower.includes(' to ') || 
                         titleLower.includes('~') || 
                         titleLower.includes('boushi') || 
                         titleLower.includes('geki') || 
                         titleLower.includes('tensei') || 
                         titleLower.includes('isekai') || 
                         titleLower.includes('tsuki') || 
                         titleLower.includes('shoujo') || 
                         titleLower.includes('shounen') || 
                         hasJapaneseChars;

    const item = {
      id: m.id,
      title: m.title,
      source_provider: m.source_provider,
      hasJapaneseChars,
      isRomajiLike,
      title_i18n: m.title_i18n,
      scanGroups: scanGroups.join(', '),
      sampleUrl: sampleUrls[0] || '',
    };

    if (hasJapaneseChars || isRomajiLike) {
      romajiOrJapaneseList.push(item);
    } else {
      englishCleanList.push(item);
    }
  }

  console.log(`\nTotal Mangas: ${mangas?.length}`);
  console.log(`- Mangas with Japanese/Romaji Titles: ${romajiOrJapaneseList.length}`);
  console.log(`- Mangas with English Titles: ${englishCleanList.length}`);

  console.log('\n--- SAMPLE JAPANESE / ROMAJI TITLES IN DATABASE ---');
  console.table(romajiOrJapaneseList.slice(0, 25).map(m => ({
    title: m.title.slice(0, 45),
    provider: m.source_provider,
    scanGroups: m.scanGroups,
    sampleUrl: m.sampleUrl ? m.sampleUrl.slice(0, 45) : 'None'
  })));

  console.log('\n--- SAMPLE CHAPTER SOURCE URLS (To check what images/pages actually are) ---');
  const { data: randomChapters } = await supabase
    .from('chapters')
    .select('title, source_url, scanlation_group, language, manga(title)')
    .limit(15);

  console.table(randomChapters?.map((c: any) => ({
    manga: c.manga?.title?.slice(0, 25),
    chTitle: c.title,
    language: c.language,
    group: c.scanlation_group,
    sourceUrl: c.source_url?.slice(0, 50)
  })));
}

checkStorageAndLanguages().then(() => process.exit(0)).catch((e) => {
  console.error(e);
  process.exit(1);
});
