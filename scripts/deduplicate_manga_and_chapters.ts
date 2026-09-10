import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: './frontend/.env' });

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

interface MangaItem {
  id: string;
  title: string;
  source_provider: string;
  source_id: string;
  cover_url: string;
  view_count: number;
  status: string;
  updated_at: string;
  chapterCount?: number;
}

function normalizeTitle(t: string): string {
  return t
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

async function main() {
  console.log('=== STARTING FAST MANGA & CHAPTER CONSOLIDATION ===\n');

  // Step 1: Fetch all mangas
  const { data: mangas, error: mErr } = await supabase
    .from('manga')
    .select('id, title, source_provider, source_id, cover_url, view_count, status, updated_at');

  if (mErr || !mangas) {
    console.error('Failed to fetch mangas:', mErr);
    return;
  }

  console.log(`Total mangas in DB: ${mangas.length}`);

  // Group by normalized title
  const groups = new Map<string, MangaItem[]>();
  for (const m of mangas) {
    const key = normalizeTitle(m.title);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(m);
  }

  const dupGroups = Array.from(groups.entries()).filter(([_, list]) => list.length > 1);
  console.log(`Found ${dupGroups.length} duplicate title groups to consolidate.\n`);

  for (const [normTitle, list] of dupGroups) {
    console.log(`--------------------------------------------------`);
    console.log(`Consolidating: "${list[0].title}" (${list.length} copies)`);

    const enriched: MangaItem[] = [];
    for (const item of list) {
      const { count } = await supabase
        .from('chapters')
        .select('*', { count: 'exact', head: true })
        .eq('manga_id', item.id);

      enriched.push({
        ...item,
        chapterCount: count || 0,
      });
      console.log(`  - ID: ${item.id} | Provider: ${item.source_provider} | Chapters: ${count || 0} | Views: ${item.view_count}`);
    }

    // Sort to pick canonical:
    // 1. Prefer copy with non-zero views (or highest views)
    // 2. If views tie, prefer copy with more chapters in DB
    enriched.sort((a, b) => {
      if ((b.view_count || 0) !== (a.view_count || 0)) {
        return (b.view_count || 0) - (a.view_count || 0);
      }
      if ((b.chapterCount || 0) !== (a.chapterCount || 0)) {
        return (b.chapterCount || 0) - (a.chapterCount || 0);
      }
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    });

    const canonical = enriched[0];
    const nonCanonicals = enriched.slice(1);
    console.log(`  => Chosen CANONICAL: ID ${canonical.id} (${canonical.source_provider}, views: ${canonical.view_count})`);

    // Fetch all existing chapter numbers for canonical
    const { data: canonicalChs } = await supabase
      .from('chapters')
      .select('id, chapter_number')
      .eq('manga_id', canonical.id);

    const existingNums = new Set((canonicalChs || []).map((c) => Number(c.chapter_number)));

    for (const redundant of nonCanonicals) {
      if ((redundant.chapterCount || 0) > 0) {
        const { data: redChs } = await supabase
          .from('chapters')
          .select('id, chapter_number')
          .eq('manga_id', redundant.id);

        const toRepointIds: string[] = [];
        const toDeleteIds: string[] = [];

        for (const ch of redChs || []) {
          const num = Number(ch.chapter_number);
          if (!existingNums.has(num)) {
            toRepointIds.push(ch.id);
            existingNums.add(num);
          } else {
            toDeleteIds.push(ch.id);
          }
        }

        if (toDeleteIds.length > 0) {
          console.log(`  Deleting ${toDeleteIds.length} redundant chapters from ${redundant.id}...`);
          for (let i = 0; i < toDeleteIds.length; i += 200) {
            await supabase.from('chapters').delete().in('id', toDeleteIds.slice(i, i + 200));
          }
        }

        if (toRepointIds.length > 0) {
          console.log(`  Repointing ${toRepointIds.length} chapters to canonical ${canonical.id}...`);
          for (let i = 0; i < toRepointIds.length; i += 200) {
            await supabase
              .from('chapters')
              .update({ manga_id: canonical.id })
              .in('id', toRepointIds.slice(i, i + 200));
          }
        }
      }

      console.log(`  Deleting redundant manga row: ${redundant.id}`);
      const { error: delErr } = await supabase
        .from('manga')
        .delete()
        .eq('id', redundant.id);

      if (delErr) {
        console.error(`  Error deleting manga ${redundant.id}:`, delErr.message);
      } else {
        console.log(`  Successfully removed duplicate manga ${redundant.id}`);
      }
    }
  }

  // Step 2: Clean up any duplicate chapters within all remaining manga
  console.log('\n==================================================');
  console.log('STEP 2: SCANNING FOR DUPLICATE CHAPTER NUMBERS IN DB');
  console.log('==================================================\n');

  // Find manga IDs that actually have chapters
  const { data: mangaWithChapters } = await supabase
    .from('chapters')
    .select('manga_id')
    .limit(10000);

  const distinctMangaIds = Array.from(new Set((mangaWithChapters || []).map(c => c.manga_id)));
  console.log(`Checking ${distinctMangaIds.length} mangas with chapters for duplicate numbers...`);

  let totalDupsRemoved = 0;
  for (const mid of distinctMangaIds) {
    const { data: chs } = await supabase
      .from('chapters')
      .select('id, chapter_number, language, title, job_status, created_at')
      .eq('manga_id', mid)
      .order('chapter_number', { ascending: true });

    if (!chs || chs.length === 0) continue;

    const byChapterNum = new Map<number, typeof chs>();
    for (const c of chs) {
      const num = Number(c.chapter_number);
      if (!byChapterNum.has(num)) byChapterNum.set(num, []);
      byChapterNum.get(num)!.push(c);
    }

    const toDeleteIds: string[] = [];
    for (const [num, list] of byChapterNum.entries()) {
      if (list.length > 1) {
        list.sort((a, b) => {
          if (a.language === 'en' && b.language !== 'en') return -1;
          if (b.language === 'en' && a.language !== 'en') return 1;
          const aHasTitle = a.title && !a.title.match(/^Chapter\s+\d+$/i);
          const bHasTitle = b.title && !b.title.match(/^Chapter\s+\d+$/i);
          if (aHasTitle && !bHasTitle) return -1;
          if (bHasTitle && !aHasTitle) return 1;
          return 0;
        });

        // First one is kept, rest marked for deletion
        for (const dup of list.slice(1)) {
          toDeleteIds.push(dup.id);
        }
      }
    }

    if (toDeleteIds.length > 0) {
      console.log(`Manga ${mid}: Removing ${toDeleteIds.length} duplicate chapters...`);
      for (let i = 0; i < toDeleteIds.length; i += 200) {
        await supabase.from('chapters').delete().in('id', toDeleteIds.slice(i, i + 200));
      }
      totalDupsRemoved += toDeleteIds.length;
    }
  }

  console.log(`\n=== ALL CONSOLIDATIONS COMPLETED! Removed ${totalDupsRemoved} duplicate chapters ===\n`);
}

main().catch(console.error);
