import { createClient } from '@supabase/supabase-js';
import ws from 'ws';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!, {
  auth: { persistSession: false },
  realtime: { transport: ws }
});

interface MangaSummary {
  id: string;
  title: string;
  provider: string;
  totalChapters: number;
  readyChapters: number;
  leftChapters: number;
  englishChapters: number;
  otherLanguages: Record<string, number>;
  progressPercent: string;
}

async function generateMangaReport() {
  console.log('========================================================================================');
  console.log('📚 SENPAI DEN — COMPLETE MANGA CATALOG PROGRESS & LANGUAGE REPORT');
  console.log('========================================================================================\n');

  // 1. Fetch all manga
  const { data: mangas, error: mErr } = await supabase
    .from('manga')
    .select('id, title, source_provider')
    .order('title', { ascending: true })
    .limit(1000);

  if (mErr || !mangas) {
    console.error('Error fetching manga list:', mErr);
    return;
  }

  console.log(`Fetched ${mangas.length} manga titles. Aggregating chapter metrics...\n`);

  // 2. Fetch all chapters with pagination (handling 17,000+ chapters)
  let allChapters: any[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from('chapters')
      .select('manga_id, job_status, language')
      .range(from, from + 999);

    if (error || !data || data.length === 0) break;
    allChapters = allChapters.concat(data);
    if (data.length < 1000) break;
    from += 1000;
  }

  // 3. Aggregate per manga
  const mangaMap = new Map<string, { total: number; ready: number; left: number; en: number; others: Record<string, number> }>();

  for (const c of allChapters) {
    if (!c.manga_id) continue;
    if (!mangaMap.has(c.manga_id)) {
      mangaMap.set(c.manga_id, { total: 0, ready: 0, left: 0, en: 0, others: {} });
    }
    const stat = mangaMap.get(c.manga_id)!;
    stat.total++;
    if (c.job_status === 'READY' || c.job_status === 'COMPLETED') {
      stat.ready++;
    } else {
      stat.left++;
    }

    const lang = c.language || 'en';
    if (lang === 'en') {
      stat.en++;
    } else {
      stat.others[lang] = (stat.others[lang] || 0) + 1;
    }
  }

  const reports: MangaSummary[] = mangas.map((m) => {
    const stats = mangaMap.get(m.id) || { total: 0, ready: 0, left: 0, en: 0, others: {} };
    const pct = stats.total > 0 ? ((stats.ready / stats.total) * 100).toFixed(1) : '0.0';
    return {
      id: m.id,
      title: m.title.length > 34 ? m.title.slice(0, 31) + '...' : m.title,
      provider: m.source_provider || 'mangadex',
      totalChapters: stats.total,
      readyChapters: stats.ready,
      leftChapters: stats.left,
      englishChapters: stats.en,
      otherLanguages: stats.others,
      progressPercent: `${pct}%`,
    };
  });

  // Sort by Total Chapters (descending)
  reports.sort((a, b) => b.totalChapters - a.totalChapters);

  // 4. Print Table
  const pad = (str: string | number, len: number, right = false) => {
    const s = String(str);
    return right ? s.padStart(len) : s.padEnd(len);
  };

  console.log('┌─────┬────────────────────────────────────┬──────────┬──────────┬──────────┬──────────┬─────────┐');
  console.log('│ No. │ Manga Title                        │ Total Ch │ Ready ✓  │ Left ⏳  │ Eng (EN) │ Progress│');
  console.log('├─────┼────────────────────────────────────┼──────────┼──────────┼──────────┼──────────┼─────────┤');

  let grandTotal = 0;
  let grandReady = 0;
  let grandLeft = 0;
  let grandEn = 0;

  reports.forEach((r, idx) => {
    grandTotal += r.totalChapters;
    grandReady += r.readyChapters;
    grandLeft += r.leftChapters;
    grandEn += r.englishChapters;

    console.log(
      `│ ${pad(idx + 1, 3, true)} │ ${pad(r.title, 34)} │ ${pad(r.totalChapters, 8, true)} │ ${pad(r.readyChapters, 8, true)} │ ${pad(r.leftChapters, 8, true)} │ ${pad(r.englishChapters, 8, true)} │ ${pad(r.progressPercent, 7, true)} │`
    );
  });

  const grandPct = grandTotal > 0 ? ((grandReady / grandTotal) * 100).toFixed(2) : '0.00';

  console.log('├─────┴────────────────────────────────────┼──────────┼──────────┼──────────┼──────────┼─────────┤');
  console.log(
    `│ GRAND TOTALS (${mangas.length} MANGA TITLES)        │ ${pad(grandTotal, 8, true)} │ ${pad(grandReady, 8, true)} │ ${pad(grandLeft, 8, true)} │ ${pad(grandEn, 8, true)} │ ${pad(`${grandPct}%`, 7, true)} │`
  );
  console.log('└──────────────────────────────────────────┴──────────┴──────────┴──────────┴──────────┴─────────┘');
  console.log('\n========================================================================================');
}

generateMangaReport();
