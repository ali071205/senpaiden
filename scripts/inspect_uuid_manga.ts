import ws from 'ws';
(globalThis as any).WebSocket = ws;

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!, {
  auth: { persistSession: false },
});

async function inspectManga() {
  const { data: m } = await supabase.from('manga').select('*').eq('source_id', '7d689360-9147-409a-9c76-61249a105653').single();
  const { data: chs } = await supabase.from('chapters').select('title, source_url').eq('manga_id', m?.id).limit(5);

  console.log('Manga record:', m);
  console.log('Sample chapters:', chs);
}

inspectManga().then(() => process.exit(0)).catch(console.error);
