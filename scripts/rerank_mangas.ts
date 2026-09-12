import ws from 'ws';
(globalThis as any).WebSocket = ws;

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false },
  realtime: { transport: ws },
});

async function rerankMangas(mode = 'views') {
  console.log(`====================================================`);
  console.log(`   Senpai Den — Manga Catalog Re-Ranking Utility   `);
  console.log(`   Mode: ${mode}                                    `);
  console.log(`====================================================\n`);

  const { data: mangas, error } = await supabase
    .from('manga')
    .select('id, title, view_count, title_i18n, source_provider, genres')
    .order('view_count', { ascending: false, nullsFirst: false })
    .limit(2000);

  if (error || !mangas) {
    console.error('Error fetching mangas:', error);
    return;
  }

  console.log(`Found ${mangas.length} mangas to re-rank.`);

  // Sort titles based on chosen mode
  let sorted = [...mangas];
  if (mode === 'views' || mode === 'popular') {
    sorted.sort((a, b) => {
      const vA = a.view_count || 0;
      const vB = b.view_count || 0;
      return vB - vA;
    });
  } else if (mode === 'title' || mode === 'alphabetical') {
    sorted.sort((a, b) => a.title.localeCompare(b.title));
  } else if (mode === 'manhwa-first') {
    sorted.sort((a, b) => {
      const aIsManhwa = a.title_i18n?.type === 'Manhwa' || a.genres?.includes('Manhwa') ? 1 : 0;
      const bIsManhwa = b.title_i18n?.type === 'Manhwa' || b.genres?.includes('Manhwa') ? 1 : 0;
      if (aIsManhwa !== bIsManhwa) return bIsManhwa - aIsManhwa;
      return (b.view_count || 0) - (a.view_count || 0);
    });
  }

  console.log('Top 10 Re-Ranked Titles:');
  sorted.slice(0, 10).forEach((m, idx) => {
    console.log(`   #${idx + 1}: ${m.title} (${m.view_count?.toLocaleString() || 0} views)`);
  });

  // Batch update ranks in title_i18n
  console.log('\nUpdating rank order in Supabase...');
  for (let i = 0; i < sorted.length; i++) {
    const item = sorted[i];
    const newI18n = {
      ...(item.title_i18n || {}),
      rank: i + 1,
    };

    await supabase
      .from('manga')
      .update({ title_i18n: newI18n })
      .eq('id', item.id);
  }

  console.log('\n✅ Re-ranking complete and saved to Supabase!');
}

const modeArg = process.argv[2] || 'views';
rerankMangas(modeArg).catch(console.error);
