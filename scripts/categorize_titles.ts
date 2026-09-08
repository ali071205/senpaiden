import ws from 'ws';
(globalThis as any).WebSocket = ws;

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!, {
  auth: { persistSession: false },
});

// Kanji / Hiragana / Katakana regex
const cjkRegex = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/;

// Common Romaji markers
const romajiKeywords = [
  ' no ', ' wa ', ' ga ', ' ni ', ' to ', ' de ', ' wo ', ' tte ', ' nanoni ', ' kara ',
  'isekai', 'tensei', 'shuraba', 'shoujo', 'shounen', 'hajimaru', 'gakuen', 'tsugai',
  'kisekae', 'ningyou', 'majutsu', 'fuyo', 'tsuihou', 'reiketsu', 'ryuuou', 'seiken',
  'boushi', 'bouken', 'monogatari', 'saikyou', 'sacchi', 'maken', 'jamasa', 'boku',
  'ore', 'watashi', 'kimama', 'oukok', 'sensei', 'hanayome', 'kokou', 'kouryaku',
  'dai daisuki', 'nanatsu', 'shingeki', 'jujutsu', 'kimetsu', 'boku no hero', 'kuroko',
  'choujin', 'dandadan', 'kagurabachi'
];

async function categorizeTitles() {
  const { data: mangas } = await supabase.from('manga').select('*').order('title', { ascending: true });

  const japaneseScriptMangas: any[] = [];
  const romajiMangas: any[] = [];
  const englishStandardMangas: any[] = [];
  const koreanManhwaTitles: any[] = [];
  const chineseManhuaTitles: any[] = [];

  for (const m of mangas || []) {
    const title = m.title;
    const titleLower = title.toLowerCase();

    const hasCJK = cjkRegex.test(title);
    const hasHangul = /[\uac00-\ud7af\u1100-\u11ff]/.test(title);
    const isRomaji = romajiKeywords.some(kw => titleLower.includes(kw)) || title.includes('~') || title.includes(' - ');

    // Check romanized Korean (e.g. "Academy eseo", "Sanyanggaeui", "Byeol eul Pumeun")
    const isKoreanRomanized = titleLower.includes('eseo') || titleLower.includes('sanyanggae') || titleLower.includes('pumeun') || titleLower.includes('hoegwi') || titleLower.includes('eul ');
    
    // Check romanized Chinese (Pinyin e.g. "Wǒ Zhēn Bù Shì", "Xiéshén")
    const isChinesePinyin = titleLower.includes('wǒ') || titleLower.includes('zhēn') || titleLower.includes('xiéshén') || titleLower.includes('zǒugǒu');

    if (hasHangul || isKoreanRomanized) {
      koreanManhwaTitles.push({ ...m, category: 'Korean (Hangul / Romanized)' });
    } else if (isChinesePinyin) {
      chineseManhuaTitles.push({ ...m, category: 'Chinese (Pinyin)' });
    } else if (hasCJK) {
      japaneseScriptMangas.push({ ...m, category: 'Japanese (Kanji / Kana Script)' });
    } else if (isRomaji) {
      romajiMangas.push({ ...m, category: 'Japanese (Romaji Romanized Title)' });
    } else {
      englishStandardMangas.push({ ...m, category: 'English Title' });
    }
  }

  console.log('=== TITLE LANGUAGE CLASSIFICATION ===');
  console.log(`Total Manga: ${mangas?.length}`);
  console.log(`- Japanese (Kanji/Kana Script): ${japaneseScriptMangas.length}`);
  console.log(`- Japanese (Romaji Romanized): ${romajiMangas.length}`);
  console.log(`- Korean Manhwa (Romanized/Hangul): ${koreanManhwaTitles.length}`);
  console.log(`- Chinese Manhua (Pinyin): ${chineseManhuaTitles.length}`);
  console.log(`- Standard English Translated Titles: ${englishStandardMangas.length}`);

  const detailedList = {
    japaneseScriptMangas: japaneseScriptMangas.map(m => m.title),
    romajiMangas: romajiMangas.map(m => m.title),
    koreanManhwaTitles: koreanManhwaTitles.map(m => m.title),
    chineseManhuaTitles: chineseManhuaTitles.map(m => m.title),
    englishStandardMangas: englishStandardMangas.map(m => m.title),
  };

  fs.writeFileSync(path.join(__dirname, 'manga_languages_detailed.json'), JSON.stringify(detailedList, null, 2));
}

categorizeTitles().then(() => process.exit(0)).catch(console.error);
