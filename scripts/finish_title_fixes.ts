import ws from 'ws';
(globalThis as any).WebSocket = ws;

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!, {
  auth: { persistSession: false },
});

const additionalLocalizations: Record<string, { en: string; ja?: string }> = {
  "Sousou No Frieren": { en: "Frieren: Beyond Journey's End", ja: "葬送のフリーレン" },
  "Imawa No Kuni No Alice": { en: "Alice in Borderland", ja: "今際の国のアリス" },
  "Hikaru Ga Shinda Natsu": { en: "The Summer Hikaru Died", ja: "光が死んだ夏" },
  "Dungeon Ni Deai Wo Motomeru No Wa Machigatteiru Darou Ka Memoria Freese Seiya No Tr Umerei": { en: "Is It Wrong to Try to Pick Up Girls in a Dungeon? (DanMachi)", ja: "ダンジョンに出会いを求めるのは間違っているだろうか" },
  "Sekai Saikyou No Assassin Isekai Kizoku Ni Tensei Suru": { en: "The World's Finest Assassin Gets Reincarnated in Another World", ja: "世界最高の暗殺者、異世界貴族に転生する" },
  "Maou Gakuin No Futekigousha Shijou Saikyou No Maou No Shiso Tensei Shite Shison Tachi No Gakkou E Kayou": { en: "The Misfit of Demon King Academy", ja: "魔王学院の不適合者" },
  "Akkun To Kanojo": { en: "My Sweet Tyrant (Akkun to Kanojo)", ja: "あっくんとカノジョ" },
  "Isekaigaeri No Ossan Wa Shuumatsu Sekai De Musou Suru": { en: "The Old Man Who Returned from Another World", ja: "異世界帰りのオッサンは終末世界で無双する" },
  "Kemono no Souja": { en: "The Beast Player", ja: "獣の奏者" },
};

async function finishTitleFixes() {
  console.log('Resolving UUID-like title via MangaDex API...');
  
  // 1. Fetch title for 7d689360-9147-409a-9c76-61249a105653
  try {
    const res = await fetch('https://api.mangadex.org/manga/7d689360-9147-409a-9c76-61249a105653');
    if (res.ok) {
      const data = await res.json();
      const titleObj = data.data?.attributes?.title || {};
      const enTitle = titleObj.en || Object.values(titleObj)[0] || 'Chainsaw Man';
      const altTitles = data.data?.attributes?.altTitles || [];
      console.log(`MangaDex returned title for UUID: "${enTitle}"`);

      await supabase
        .from('manga')
        .update({
          title: enTitle,
          title_i18n: { en: enTitle, alt: altTitles },
          updated_at: new Date().toISOString(),
        })
        .eq('source_id', '7d689360-9147-409a-9c76-61249a105653');
      console.log(`Updated UUID title to "${enTitle}"`);
    }
  } catch (err: any) {
    console.error('Failed to resolve MangaDex UUID title:', err.message);
  }

  // 2. Apply additional localizations
  const { data: allMangas } = await supabase.from('manga').select('id, title, title_i18n');
  for (const m of allMangas || []) {
    const match = additionalLocalizations[m.title];
    if (match) {
      console.log(`Updating '${m.title}' -> '${match.en}'`);
      await supabase
        .from('manga')
        .update({
          title: match.en,
          title_i18n: { ...(m.title_i18n || {}), en: match.en, ja: match.ja, romaji: m.title },
          updated_at: new Date().toISOString(),
        })
        .eq('id', m.id);
    }
  }

  console.log('\n✅ All title localizations and fixes successfully applied!');
}

finishTitleFixes().then(() => process.exit(0)).catch(console.error);
