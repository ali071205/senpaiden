import ws from 'ws';
(globalThis as any).WebSocket = ws;

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!, {
  auth: { persistSession: false },
});

async function checkNarutoAndFixUuid() {
  const { data: narutos } = await supabase.from('manga').select('id, title, source_id, source_provider').ilike('title', '%Naruto%');
  console.log('Existing Naruto entries:', narutos);

  // Update 7d689360 to Naruto (MangaPill Scans) or Naruto
  const { error } = await supabase.from('manga').update({
    title: 'Naruto (Digital Colored / Scans)',
    title_i18n: { en: 'Naruto', ja: 'NARUTO -ナルト-' },
    genres: ['Action', 'Adventure', 'Fantasy', 'Shounen'],
    author: 'Masashi Kishimoto',
    description: 'Twelve years before the start of the series, the Nine-Tails attacked Konohagakure...',
  }).eq('id', 'eba64162-6908-444a-9d20-2897b1d08150');

  if (error) console.error('Update error:', error);
  else console.log('Successfully updated UUID entry to Naruto (Digital Colored / Scans)!');
}

checkNarutoAndFixUuid().then(() => process.exit(0)).catch(console.error);
