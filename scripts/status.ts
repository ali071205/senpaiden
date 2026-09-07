import { createClient } from '@supabase/supabase-js';
import ws from 'ws';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!, {
  auth: { persistSession: false },
  realtime: { transport: ws }
});

async function checkCatalogStatus() {
  console.log('====================================================');
  console.log('📊 SENPAI DEN — REAL-TIME CATALOG & STORAGE STATUS');
  console.log('====================================================\n');

  // Exact counts
  const { count: readyCount } = await supabase
    .from('chapters')
    .select('*', { count: 'exact', head: true })
    .eq('job_status', 'READY');

  const { count: processingCount } = await supabase
    .from('chapters')
    .select('*', { count: 'exact', head: true })
    .eq('job_status', 'PROCESSING');

  const { count: queuedCount } = await supabase
    .from('chapters')
    .select('*', { count: 'exact', head: true })
    .eq('job_status', 'QUEUED');

  const { count: totalChapters } = await supabase
    .from('chapters')
    .select('*', { count: 'exact', head: true });

  const { count: totalPages } = await supabase
    .from('pages')
    .select('*', { count: 'exact', head: true });

  // Latest finished chapters
  const { data: latestReady } = await supabase
    .from('chapters')
    .select('id, title, chapter_number, updated_at')
    .eq('job_status', 'READY')
    .order('updated_at', { ascending: false })
    .limit(5);

  console.log(`✅ Finished (READY) Chapters : ${readyCount} / ${totalChapters}`);
  console.log(`🖼️ Total Sliced WebP Pages   : ${totalPages}`);
  console.log(`⚡ Active Processing Right Now : ${processingCount}`);
  console.log(`⏳ Waiting in Queue          : ${queuedCount}`);
  
  const pct = totalChapters ? ((readyCount! / totalChapters) * 100).toFixed(2) : '0';
  console.log(`📈 Completion Progress       : ${pct}%\n`);

  console.log('── Most Recent Chapters Sliced & Stored ──');
  (latestReady || []).forEach((c, idx) => {
    console.log(` ${idx + 1}. [Ch. ${c.chapter_number}] ${c.title || 'Untitled'} (${new Date(c.updated_at).toLocaleTimeString()})`);
  });

  console.log('\n====================================================');
}

checkCatalogStatus();
