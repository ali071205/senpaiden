import { createClient } from '@supabase/supabase-js';
import ws from 'ws';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!, {
  auth: { persistSession: false },
  realtime: { transport: ws }
});

async function checkOnePiece() {
  console.log('====================================================');
  console.log('🏴‍☠️ CHECKING ONE PIECE CHAPTERS & LANGUAGES IN DATABASE');
  console.log('====================================================\n');

  // 1. Find One Piece manga record
  const { data: mangas, error: mErr } = await supabase
    .from('manga')
    .select('id, title, source_id, source_provider')
    .ilike('title', '%One Piece%');

  if (mErr || !mangas || mangas.length === 0) {
    console.error('No One Piece manga found:', mErr);
    return;
  }

  console.log(`Found ${mangas.length} One Piece manga entries:`);
  for (const m of mangas) {
    console.log(` • Title: "${m.title}" (ID: ${m.id}, Provider: ${m.source_provider})`);

    // 2. Fetch all chapters for this One Piece entry
    const { data: chapters, error: cErr } = await supabase
      .from('chapters')
      .select('id, chapter_number, title, language, source_url, job_status')
      .eq('manga_id', m.id)
      .order('chapter_number', { ascending: true });

    if (cErr || !chapters) {
      console.error('Error fetching chapters:', cErr);
      continue;
    }

    console.log(`   Total Chapters: ${chapters.length}`);

    // Language breakdown
    const langCounts: Record<string, number> = {};
    const statusCounts: Record<string, number> = {};
    const domainCounts: Record<string, number> = {};

    for (const c of chapters) {
      const lang = c.language || 'unknown';
      langCounts[lang] = (langCounts[lang] || 0) + 1;

      statusCounts[c.job_status] = (statusCounts[c.job_status] || 0) + 1;

      try {
        const urlObj = new URL(c.source_url);
        domainCounts[urlObj.hostname] = (domainCounts[urlObj.hostname] || 0) + 1;
      } catch {
        domainCounts['invalid_url'] = (domainCounts['invalid_url'] || 0) + 1;
      }
    }

    console.log('   Languages:', langCounts);
    console.log('   Job Statuses:', statusCounts);
    console.log('   Source Domains:', domainCounts);

    // Sample English vs non-English
    const enChapters = chapters.filter(c => c.language === 'en');
    const nonEnChapters = chapters.filter(c => c.language !== 'en');

    console.log(`   🇬🇧 English Chapters count: ${enChapters.length}`);
    if (enChapters.length > 0) {
      const minCh = enChapters[0].chapter_number;
      const maxCh = enChapters[enChapters.length - 1].chapter_number;
      console.log(`      Range: Ch. ${minCh} to Ch. ${maxCh}`);
      console.log(`      Sample Sources:`, enChapters.slice(0, 3).map(c => `Ch. ${c.chapter_number}: ${c.source_url}`));
    }

    console.log(`   🌐 Non-English Chapters count: ${nonEnChapters.length}`);
    if (nonEnChapters.length > 0) {
      console.log(`      Sample Non-English:`, nonEnChapters.slice(0, 5).map(c => `Ch. ${c.chapter_number} [${c.language}]: ${c.source_url}`));
    }
  }

  console.log('\n====================================================');
}

checkOnePiece();
