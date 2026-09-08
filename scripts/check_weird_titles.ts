import ws from 'ws';
(globalThis as any).WebSocket = ws;

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!, {
  auth: { persistSession: false },
});

async function checkWeirdTitles() {
  const { data: mTitles } = await supabase
    .from('manga')
    .select('id, title, source_id, source_provider, cover_url, created_at')
    .or('title.eq.m,title.eq.manga');

  console.log(`Found ${mTitles?.length} mangas with title 'm':`);
  console.table(mTitles);
}

checkWeirdTitles().then(() => process.exit(0)).catch(console.error);
