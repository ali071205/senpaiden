import { createClient } from '@supabase/supabase-js';
import ws from 'ws';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!, {
  auth: { persistSession: false },
  realtime: { transport: ws }
});

async function syncMissingOnePiece() {
  console.log('====================================================');
  console.log('🏴‍☠️ SYNCING MISSING ONE PIECE CHAPTERS (Ch. 999 - 1191+)');
  console.log('====================================================\n');

  // 1. Get One Piece Manga ID
  const { data: manga } = await supabase
    .from('manga')
    .select('id, title')
    .ilike('title', 'One Piece')
    .single();

  if (!manga) {
    console.error('One Piece manga not found in database');
    return;
  }

  const mangaId = manga.id;
  console.log(`One Piece ID: ${mangaId}`);

  // 2. Fetch existing chapter numbers in DB
  const { data: existingChapters } = await supabase
    .from('chapters')
    .select('chapter_number')
    .eq('manga_id', mangaId);

  const existingSet = new Set((existingChapters || []).map(c => Number(c.chapter_number)));
  console.log(`Existing chapters in DB: ${existingSet.size}`);

  // 3. Scrape all chapter links from MangaPill
  const url = 'https://mangapill.com/manga/2/one-piece';
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
  });
  const html = await res.text();
  const matches = [...html.matchAll(/href=\"(\/chapters\/2-[^\"]+)\"[^>]*>([^<]+)<\/a>/g)];

  console.log(`Total chapters available on MangaPill: ${matches.length}`);

  const toInsert: any[] = [];

  for (const m of matches) {
    const rawTitle = m[2].trim();
    const path = m[1];
    const chNumMatch = rawTitle.match(/Chapter\s+([\d.]+)/i);
    const chNum = chNumMatch ? parseFloat(chNumMatch[1]) : null;

    if (chNum !== null && !existingSet.has(chNum)) {
      toInsert.push({
        manga_id: mangaId,
        chapter_number: chNum,
        title: rawTitle,
        source_url: `https://mangapill.com${path}`,
        job_status: 'QUEUED',
        language: 'en',
        scanlation_group: 'Official'
      });
      existingSet.add(chNum);
    }
  }

  console.log(`\nNew missing English chapters to insert: ${toInsert.length}`);

  if (toInsert.length > 0) {
    console.log(`Sample missing chapters:`, toInsert.slice(0, 5).map(c => `Ch. ${c.chapter_number}: ${c.title}`));
    
    // Batch insert in chunks of 50
    for (let i = 0; i < toInsert.length; i += 50) {
      const chunk = toInsert.slice(i, i + 50);
      const { error } = await supabase.from('chapters').insert(chunk);
      if (error) {
        console.error('Error inserting chunk:', error);
      } else {
        console.log(`  Inserted ${chunk.length} chapters...`);
      }
    }
    console.log('\n✅ All missing English One Piece chapters added to queue!');
  } else {
    console.log('All One Piece chapters are already in the database.');
  }

  console.log('====================================================');
}

syncMissingOnePiece();
