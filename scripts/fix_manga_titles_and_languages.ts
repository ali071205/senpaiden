import ws from 'ws';
(globalThis as any).WebSocket = ws;

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!, {
  auth: { persistSession: false },
});

// Helper to convert kebab-case slug to Title Case
function slugToTitle(slug: string): string {
  // Remove leading numbers like "1092/"
  const cleanSlug = slug.includes('/') ? slug.split('/')[1] : slug;
  return cleanSlug
    .split('-')
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

// Known English mapping for Japanese Romaji titles and special slugs
const knownEnglishTitles: Record<string, { en: string; ja?: string }> = {
  // 1. Japanese Romaji titles
  "Ao no Exorcist": { en: "Blue Exorcist", ja: "青の祓魔師" },
  "Tongari Boushi no Atelier": { en: "Witch Hat Atelier", ja: "とんがり帽子のアトリエ" },
  "Fumetsu no Anata e": { en: "To Your Eternity", ja: "不滅のあなたへ" },
  "Komi-san wa Komyushou Desu.": { en: "Komi Can't Communicate", ja: "古見さんは、コミュ症です。" },
  "Mushoku Tensei: Isekai Ittara Honki Dasu": { en: "Mushoku Tensei: Jobless Reincarnation", ja: "無職転生 〜異世界行ったら本気だす〜" },
  "Hametsu no Oukoku": { en: "The Kingdoms of Ruin", ja: "はめつのおうこく" },
  "Kaoru Hana wa Rin to Saku": { en: "The Fragrant Flower Blooms With Dignity", ja: "薫る花は凛と咲く" },
  "Kimi no Koto ga Dai Dai Dai Dai Daisuki na 100-nin no Kanojo": { en: "The 100 Girlfriends Who Really Love You", ja: "君のことが大大大大大好きな100人の彼女" },
  "Zombie 100 ~Zombie ni Naru Made ni Shitai 100 no Koto~": { en: "Zom 100: Bucket List of the Dead", ja: "ゾン100〜ゾンビになるまでにしたい100のこと〜" },
  "Baki Gaiden - Retsu Kaiou wa Isekai Tensei Shitemo Ikkou ni Kamawan": { en: "Baki Gaiden: Retsu Kaioh in Another World", ja: "バキ外伝 烈海王は異世界転生しても一向にかまわんッッ" },
  "Hajime no Ippo": { en: "Hajime no Ippo: The Fighting!", ja: "はじめの一歩" },
  "Kokou no Hito": { en: "The Climber", ja: "孤高の人" },
  "Kokuyou no Hanayome": { en: "The Obsidian Bride", ja: "黒曜の花嫁" },
  "Madan no Ichi": { en: "Ichi the Witch", ja: "魔男のイチ" },
  "Seiken Gakuin no Maken Tsukai": { en: "The Demon Sword Master of Excalibur Academy", ja: "聖剣学院の魔剣使い" },
  "Sacchi Sarenai Saikyou Shoku Rule Breaker": { en: "Undetected Strongest Job: Rule Breaker", ja: "察知されない最強職" },
  "Gakuen no Hime Kouryaku Hajimetara Shuraba ni Natteta Ken": { en: "Conquering the Academy Princess", ja: "学園の姫攻略" },
  "Anta to Osananajimi tte dake demo Iya nanoni! ~Zekkou kara Hajimaru S-kyuu Bishoujo to no Gakuen Nariagari Seikatsu~": { en: "Being Just Your Childhood Friend Is Bad Enough!", ja: "あんたと幼馴染ってだけでも嫌なのに！" },
  "Onnanoko wa Otoko no Tame no Kisekae Ningyou ja Neenda yo (Fan Colored)": { en: "Girls Are Not Dress-Up Dolls for Men", ja: "女の子は男のための着せ替え人形じゃねえんだよ" },
  "Oshi no Yuri o Zettai ni Jamasasenai Kishi-tachi": { en: "Knights Who Won't Let Anyone Ruin Yuri", ja: "推しの百合を絶対に邪魔させない騎士たち" },
  "Reiketsu Ryuuou Heika no \"Unmei no Tsugai\" rashii Desu ga, Koukyuu ni Hikikomorou to Omoimasu": { en: "Destined Pair of the Cold-Blooded Dragon King", ja: "冷血竜王陛下の「運命の番」らしいですが" },
  "Tsuihou Sareta Cheat Fuyo Majutsushi wa Kimama na Second Life o Ouka Suru.: Ore wa Buki dake ja Naku, Arayuru Mono ni \"Kyouka Point\" o Fuyo Dekiru shi, Ore no Ishi de Itsudemo Kouka o Kaijo Dekiru kedo, Nokotta Hitotachi Daijoubu?": { en: "The Banished Cheat Enchanter's Carefree Second Life", ja: "追放されたチート付与魔術師" },

  // Korean Romanized titles
  "Academy eseo Saranamgi": { en: "Surviving at the Academy", ja: "アカデミーで生き残る" },
  "Byeol eul Pumeun Swordmaster": { en: "The Star-Embracing Swordmaster", ja: "星を抱くソードマスター" },
  "Cheolhyeolgeomga Sanyanggaeui Hoegwi": { en: "Revenge of the Iron-Blooded Sword Hound", ja: "鉄血剣家猟犬の回帰" },
  "Oneul man Saneun Gisa": { en: "The Knight Only Lives for Today", ja: "今日だけ生きる騎士" },
  "I Alone Level Grinding": { en: "Solo Leveling", ja: "俺だけレベルアップな件" },

  // Chinese Pinyin
  "Wǒ Zhēn Bù Shì Xiéshén Zǒugǒu": { en: "I'm Really Not the Evil God's Lackey", ja: "僕は本当に邪神の使い魔じゃない" },

  // MangaPill 'm' Special cleanups
  "1092/dungeon-meshi": { en: "Delicious in Dungeon (Dungeon Meshi)", ja: "ダンジョン飯" },
  "2589/leviathan": { en: "Leviathan (Deep Water)", ja: "リヴァイアサン" },
  "1839/i-am-a-hero": { en: "I Am a Hero", ja: "アイアムアヒーロー" },
  "96/absolute-duo": { en: "Absolute Duo", ja: "アブソリュート・デュオ" },
  "4372/the-dark-myth": { en: "The Dark Myth", ja: "暗黒神話" },
  "6301/takane-no-ran-san": { en: "Takane & Ran", ja: "高嶺の蘭さん" },
  "1851/i-swear-i-won-t-bother-you-again": { en: "I Swear I Won't Bother You Again!", ja: "二度と邪魔いたしません！" },
  "8101/kemono-no-souja": { en: "The Beast Player (Kemono no Souja)", ja: "獣の奏者" },
  "2133/kaiko-sareta-ankoku-heishi-30-dai-no-slow-na-second-life": { en: "Chillin' in My 30s After Getting Fired from the Demon King's Army", ja: "解雇された暗黒兵士（30代）のスローなセカンドライフ" },
  "7512/slime-taoshite-300-nen-shiranai-uchi-ni-level-max-ni-nattemashita-spin-off-red-dragon-jogakuin": { en: "I've Been Killing Slimes for 300 Years (Spin-off: Red Dragon Academy)", ja: "スライム倒して300年 スピンオフ" },
  "6868/henkyou-no-renkinjutsushi-imasara-yosan-zero-no-shokuba-ni-modoru-toka-mou-muri": { en: "The Frontier Alchemist", ja: "辺境の錬金術師" },
  "10109/tsume-kudaki-no-rarabai": { en: "Nail-Biting Lullaby", ja: "爪砕きのララバイ" },
  "9931/koujo-tensei-densetsu-no-daimadoushi-himekishi-to-narite-densetsu-no-reijou-kishidan-wo-tsukuri-musou-suru": { en: "Princess Reincarnation: The Legendary Archmage Becomes a Princess Knight", ja: "皇女転生" },
  "7111/akuyaku-reijou-to-akuyaku-reisoku-ga-deatte-koi-ni-ochita-nara-nanashi-no-seirei-to-keiyaku-shite-oidasareta-reijou-wa-kyou-mo-reisoku-to-kisoiatteiru-you-desu": { en: "When the Villainess and the Villain Fall in Love", ja: "悪役令嬢と悪役令息が恋に落ちたら" },
  "9279/shinu-unmei-ni-aru-akuyaku-reijou-no-ani-ni-tensei-shita-node-imouto-wo-sodatete-mirai-wo-kaetai-to-omoimasu-sekai-saikyou-wa-ore-dakedo-sekai-saikawa-wa-imouto-ni-chigainai": { en: "Reincarnated as the Brother of the Doomed Villainess", ja: "死ぬ運命にある悪役令嬢の兄に転生した" }
};

async function fixAllTitles() {
  console.log('=====================================================');
  console.log('🛠️ REPAIRING MANGA TITLES & ENRICHING ENGLISH NAMES');
  console.log('=====================================================\n');

  const { data: mangas, error } = await supabase.from('manga').select('*');
  if (error || !mangas) {
    console.error('Failed to fetch mangas:', error);
    return;
  }

  let updatedCount = 0;

  for (const m of mangas) {
    let newTitle = m.title;
    let titleI18n = m.title_i18n || {};
    let shouldUpdate = false;

    // 1. Check if title is 'm'
    if (m.title === 'm' || m.title === 'manga') {
      const mappedBySource = knownEnglishTitles[m.source_id];
      if (mappedBySource) {
        newTitle = mappedBySource.en;
        titleI18n = { ...titleI18n, en: mappedBySource.en, ja: mappedBySource.ja || m.title };
      } else {
        newTitle = slugToTitle(m.source_id);
        titleI18n = { ...titleI18n, en: newTitle };
      }
      shouldUpdate = true;
      console.log(`[FIX 'm'] ID ${m.id}: '${m.title}' -> '${newTitle}' (source_id: ${m.source_id})`);
    }

    // 2. Check if known English mapping exists for current title
    const mappedByTitle = knownEnglishTitles[m.title];
    if (mappedByTitle) {
      const originalTitle = m.title;
      newTitle = mappedByTitle.en;
      titleI18n = {
        ...titleI18n,
        en: mappedByTitle.en,
        ja: mappedByTitle.ja || originalTitle,
        romaji: originalTitle,
      };
      shouldUpdate = true;
      console.log(`[LOCALIZE] ID ${m.id}: '${originalTitle}' -> '${newTitle}'`);
    }

    if (shouldUpdate) {
      const { error: uErr } = await supabase
        .from('manga')
        .update({
          title: newTitle,
          title_i18n: titleI18n,
          updated_at: new Date().toISOString(),
        })
        .eq('id', m.id);

      if (uErr) {
        console.error(`Error updating manga ${m.id}:`, uErr.message);
      } else {
        updatedCount++;
      }
    }
  }

  console.log(`\n🎉 Successfully repaired and localized ${updatedCount} manga titles in Supabase!`);
}

fixAllTitles().then(() => process.exit(0)).catch(console.error);
