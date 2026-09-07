import { createClient } from '@supabase/supabase-js';
import ws from 'ws';
import dotenv from 'dotenv';
dotenv.config();

import { resolveMangaRecord, getCachedMangaDetail } from '../frontend/src/lib/cache';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!, {
  auth: { persistSession: false },
  realtime: { transport: ws }
});

async function testLinks() {
  console.log('====================================================');
  console.log('🔗 TESTING UNIVERSAL LINK RESOLUTION');
  console.log('====================================================\n');

  const testCases = [
    { label: 'Direct UUID', input: '462c034e-180d-40a9-8533-8a6c81ccb268' }, // One Piece UUID
    { label: 'Clean Slug', input: 'one-piece' },
    { label: 'Exact Title', input: 'One Piece' },
    { label: 'Slug Case 2', input: 'naruto' },
    { label: 'Slug Case 3', input: 'solo-leveling' },
    { label: 'Slug Case 4', input: 'fairy-tail' },
    { label: 'Slug Case 5', input: 'berserk' },
  ];

  for (const tc of testCases) {
    const res = await resolveMangaRecord(tc.input, supabase);
    if (res) {
      console.log(`✅ [${tc.label}] "${tc.input}" -> Resolved to "${res.title}" (ID: ${res.id})`);
    } else {
      console.log(`❌ [${tc.label}] "${tc.input}" -> FAILED to resolve!`);
    }
  }

  console.log('\nTesting getCachedMangaDetail with slug "one-piece"...');
  const detail = await getCachedMangaDetail('one-piece');
  if (detail) {
    console.log(`✅ getCachedMangaDetail: Found "${detail.title}" with ${detail.chapters?.length || 0} chapters!`);
  } else {
    console.log('❌ getCachedMangaDetail: Failed');
  }

  console.log('\n====================================================');
}

testLinks();
