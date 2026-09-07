import { createClient } from '@supabase/supabase-js';
import ws from 'ws';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!, {
  auth: { persistSession: false },
  realtime: { transport: ws }
});

async function fixMangaPlusUrls() {
  const mangaId = '462c034e-180d-40a9-8533-8a6c81ccb268';
  
  const replacements: Record<number, string> = {
    1148: 'https://mangapill.com/chapters/2-11148000/one-piece-chapter-1148',
    1183: 'https://mangapill.com/chapters/2-11183000/one-piece-chapter-1183',
    1184: 'https://mangapill.com/chapters/2-11184000/one-piece-chapter-1184',
    1185: 'https://mangapill.com/chapters/2-11185000/one-piece-chapter-1185',
    1186: 'https://mangapill.com/chapters/2-11186000/one-piece-chapter-1186',
    1189: 'https://mangapill.com/chapters/2-11189000/one-piece-chapter-1189',
  };

  for (const [chNumStr, newUrl] of Object.entries(replacements)) {
    const chNum = parseFloat(chNumStr);
    const { error } = await supabase
      .from('chapters')
      .update({
        source_url: newUrl,
        job_status: 'QUEUED',
        processing_started_at: null,
        updated_at: new Date().toISOString()
      })
      .eq('manga_id', mangaId)
      .eq('chapter_number', chNum);

    console.log(`Updated Ch. ${chNum} to MangaPill URL:`, error ? error : 'Success ✓');
  }
}

fixMangaPlusUrls();
