import ws from 'ws';
(globalThis as any).WebSocket = ws;

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!, {
  auth: { persistSession: false },
});

async function checkUuidTitles() {
  const { data } = await supabase
    .from('manga')
    .select('id, title, source_id, source_provider, cover_url')
    .ilike('title', '%7d689360%');

  console.log('UUID-like title:', data);
}

checkUuidTitles().then(() => process.exit(0)).catch(console.error);
