import ws from 'ws';
(globalThis as any).WebSocket = ws;

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!, {
  auth: { persistSession: false },
});

async function checkSupabaseStorage() {
  console.log('--- CHECKING SUPABASE STORAGE BUCKETS ---');
  const { data: buckets, error: bErr } = await supabase.storage.listBuckets();
  if (bErr) {
    console.error('Bucket list error:', bErr);
    return;
  }
  console.log('Buckets found:', buckets);

  for (const b of buckets || []) {
    console.log(`\nInspecting bucket: ${b.name}`);
    const { data: files, error: fErr } = await supabase.storage.from(b.name).list('', { limit: 100 });
    if (fErr) {
      console.log(`Error listing files in ${b.name}:`, fErr.message);
    } else {
      console.log(`Files count in root of ${b.name}: ${files?.length}`);
      console.log('Sample files:', files?.slice(0, 5));
    }
  }

  // Check Database Table sizes in Supabase PostgreSQL
  console.log('\n--- CHECKING DATABASE TABLE ROW COUNTS IN SUPABASE ---');
  const tables = ['manga', 'chapters', 'pages', 'dead_letter_queue', 'error_log'];
  for (const t of tables) {
    const { count, error } = await supabase.from(t).select('*', { count: 'exact', head: true });
    console.log(`Table '${t}': ${count ?? 'error'} rows`);
  }
}

checkSupabaseStorage().then(() => process.exit(0)).catch(console.error);
