import { createClient } from '@supabase/supabase-js';
import ws from 'ws';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!, {
  auth: { persistSession: false },
  realtime: { transport: ws }
});

async function testChapterQuery() {
  console.log('====================================================');
  console.log('🧪 TESTING CHAPTER API QUERY LOGIC');
  console.log('====================================================\n');

  const mangaId = '462c034e-180d-40a9-8533-8a6c81ccb268'; // One Piece
  const testChapters = [1, 28, 998, 1000, 1148, 1190];

  for (const chNum of testChapters) {
    console.log(`Checking Ch. ${chNum}...`);
    
    // Simulate current route.ts query
    const { data: chapter, error: chErr } = await supabase
      .from('chapters')
      .select('*')
      .eq('manga_id', mangaId)
      .eq('chapter_number', chNum)
      .maybeSingle();

    if (chErr || !chapter) {
      console.log(`  ❌ Query Error for Ch. ${chNum}:`, chErr ? chErr.message : 'Not Found');
    } else {
      console.log(`  ✅ Found Ch. ${chNum} (ID: ${chapter.id}, Status: ${chapter.job_status}, Lang: ${chapter.language})`);

      // Check pages
      const { data: pages } = await supabase
        .from('pages')
        .select('page_number, r2_keys')
        .eq('chapter_id', chapter.id)
        .order('page_number', { ascending: true });

      console.log(`     Pages count in DB: ${pages?.length || 0}`);
      if (pages && pages.length > 0) {
        console.log(`     Sample slice key: ${pages[0].r2_keys?.[0]}`);
      }
    }
  }

  // Also check if there are any other mangas in the database where language is NOT English
  console.log('\n── CHECKING ALL MANGAS IN DB FOR NON-ENGLISH CHAPTERS ──');
  const { data: allLangs } = await supabase
    .from('chapters')
    .select('language')
    .limit(5000);

  const langCounts: Record<string, number> = {};
  (allLangs || []).forEach(c => {
    langCounts[c.language || 'unknown'] = (langCounts[c.language || 'unknown'] || 0) + 1;
  });
  console.log('Global Database Language Distribution (5,000 sample):', langCounts);

  console.log('\n====================================================');
}

testChapterQuery();
