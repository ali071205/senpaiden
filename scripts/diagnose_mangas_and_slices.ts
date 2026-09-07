import { createClient } from '@supabase/supabase-js';
import ws from 'ws';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!, {
  auth: { persistSession: false },
  realtime: { transport: ws },
});

async function main() {
  console.log('=== SENPAI DEN MANGA & SLICE DEEP DIAGNOSTIC ===\n');

  // 1. Fetch total manga count and sample list
  const { data: mangas, error: mErr } = await supabase
    .from('manga')
    .select('id, title, source_id, status')
    .limit(25);

  if (mErr || !mangas) {
    console.error('Error fetching mangas:', mErr);
    return;
  }

  console.log(`Fetched ${mangas.length} sample mangas from DB:`);
  console.table(mangas.map(m => ({ id: m.id, title: m.title, source_id: m.source_id })));

  // 2. Check chapters and pages for each manga
  for (const manga of mangas.slice(0, 10)) {
    console.log(`\n--------------------------------------------------`);
    console.log(`Checking: [${manga.title}] (ID: ${manga.id}, Slug: ${manga.slug})`);

    const { data: chapters, error: cErr } = await supabase
      .from('chapters')
      .select('id, chapter_number, title, job_status, language, source_url')
      .eq('manga_id', manga.id)
      .order('chapter_number', { ascending: true })
      .limit(10);

    if (cErr || !chapters || chapters.length === 0) {
      console.log(`  ❌ No chapters found in DB!`);
      continue;
    }

    console.log(`  Found ${chapters.length} sample chapters (Job status: ${chapters.map(c => `${c.chapter_number}:${c.job_status}`).join(', ')})`);

    // Check first 2 chapters
    for (const ch of chapters.slice(0, 3)) {
      const { data: pages, error: pErr } = await supabase
        .from('pages')
        .select('page_number, r2_keys, slice_dimensions')
        .eq('chapter_id', ch.id)
        .order('page_number', { ascending: true })
        .limit(5);

      if (pErr || !pages || pages.length === 0) {
        console.log(`    ❌ Chapter ${ch.chapter_number} has 0 pages in DB (Job status: ${ch.job_status})`);
      } else {
        console.log(`    ✅ Chapter ${ch.chapter_number} has ${pages.length} sample pages in DB.`);
        pages.forEach((p, idx) => {
          const keys = p.r2_keys || [];
          console.log(`       Page ${p.page_number}: ${keys.length} keys -> sample key: ${keys[0] || 'NONE'}`);
        });
      }
    }
  }

  console.log('\n=== DIAGNOSTIC FINISHED ===');
}

main().catch(console.error);
