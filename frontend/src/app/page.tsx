import Link from "next/link";
import { MangaCard } from "@/components/MangaCard";
import { TopMangaSection } from "@/components/TopMangaSection";
import { HomeLibraryRow } from "@/components/HomeLibraryRow";
import { PersonalizedFeedRow } from "@/components/PersonalizedFeedRow";
import { ContinueReadingBubble } from "@/components/ContinueReadingBubble";
import { AdSlot } from "@/components/AdSlot";
import { VideoAdUnit } from "@/components/VideoAdUnit";
import { FeaturedHeroCarousel } from "@/components/FeaturedHeroCarousel";
import { Frown, ChevronRight } from "lucide-react";
import { getLocalCatalogue, type CatalogueManga } from "@/lib/local-catalogue";

// force-dynamic: Every request re-renders with fresh cookies (required for 18+ toggle to work correctly)
export const dynamic = 'force-dynamic';

import { cookies } from "next/headers";
import { getCachedMangaList } from "@/lib/cache";
import { AGE_RESTRICTION_COOKIE, isMatureManga } from "@/lib/age-restriction";

export default async function Home({ searchParams }: { searchParams?: Promise<{ q?: string }> }) {
  const resolvedSearchParams = await searchParams;
  const searchQuery = resolvedSearchParams?.q?.trim() || "";

  const cookieStore = await cookies();
  const allow18Plus = cookieStore.get(AGE_RESTRICTION_COOKIE)?.value === "true";
  
  const mapToUi = (items: CatalogueManga[], startRank = 0) => {
    const seenIds = new Set<string>();
    return items
      .filter((m) => {
        if (!m.id || seenIds.has(m.id)) return false;
        if (!allow18Plus && isMatureManga(m.genres)) return false;
        seenIds.add(m.id);
        return true;
      })
      .map((m, idx) => ({
        slug: m.id,
        title: m.title,
        altTitle: m.alt_title || "",
        description: m.description || "",
        genres: m.genres || ["Action", "Fantasy"],
        latestChapter: m.latest_chapter_number || 1,
        status: m.status || "Ongoing",
        cover_url: m.cover_url,
        coverHue: 250,
        coverHue2: 300,
        views: (m.title_i18n?.views_display as string) || m.view_count || 0,
        rank: startRank > 0 ? startRank + idx : undefined,
      }));
  };

  let featuredItems: ReturnType<typeof mapToUi> = [];
  let top100: ReturnType<typeof mapToUi> = [];
  let updated: ReturnType<typeof mapToUi> = [];
  let uiMangas: ReturnType<typeof mapToUi> = [];

  if (searchQuery) {
    let searchResults: CatalogueManga[] = [];
    try {
      const result = await getCachedMangaList({
        q: searchQuery,
        page: 1,
        limit: 24,
        allow18Plus,
      });
      if (result.data && result.data.length > 0) {
        searchResults = result.data as CatalogueManga[];
      }
    } catch {
      // Fallback
    }
    if (!searchResults.length) {
      const local = await getLocalCatalogue();
      const filteredLocal = allow18Plus ? local : local.filter((m) => !isMatureManga(m.genres));
      searchResults = filteredLocal
        .filter((manga) => manga.title.toLowerCase().includes(searchQuery.toLowerCase()))
        .slice(0, 24);
    }
    uiMangas = mapToUi(searchResults);
  } else {
    try {
      // Build parallel requests
      const requests: Promise<any>[] = [
        getCachedMangaList({ page: 1, limit: 108, sort: 'views', allow18Plus }),
        getCachedMangaList({ page: 1, limit: 24, sort: 'updated', allow18Plus }),
      ];

      // When 18+ is ON, also fetch top 18+ specific titles for the hero carousel
      if (allow18Plus) {
        requests.push(
          getCachedMangaList({
            page: 1, limit: 12, sort: 'views', allow18Plus: true,
            matureOnly: true,
          })
        );
      }

      const [topRes, updatedRes, matureRes] = await Promise.all(requests);

      const topMangas = (topRes.data || []) as CatalogueManga[];
      const updatedMangas = (updatedRes.data || []) as CatalogueManga[];

      const topUi = mapToUi(topMangas, 1);
      const updatedUi = mapToUi(updatedMangas);

      // When 18+ is ON, mix top 3 mature picks into hero carousel
      if (allow18Plus && matureRes?.data?.length) {
        const matureUi = mapToUi(matureRes.data as CatalogueManga[]);
        const top3Mature = matureUi.slice(0, 3);
        const top3NonMature = topUi.slice(0, 3);
        // Interleave: 3 mainstream + 3 mature = 6 hero slots
        featuredItems = [...top3NonMature, ...top3Mature].slice(0, 6);
      } else {
        featuredItems = topUi.slice(0, 6);
      }

      top100 = topUi;
      updated = updatedUi.slice(0, 24);
    } catch {
      // Fallback to local catalogue
      const local = await getLocalCatalogue();
      const filteredLocal = allow18Plus ? local : local.filter((m) => !isMatureManga(m.genres));
      const localUi = mapToUi(filteredLocal, 1);
      featuredItems = localUi.slice(0, 6);
      top100 = localUi;
      updated = localUi.slice(8, 24);
    }
  }
  if (searchQuery) {
    return (
      <div className="pb-28 md:pb-8">
        <section className="mx-auto max-w-7xl px-4 pt-6 md:px-8 md:pt-10">
          <div className="mb-6 flex flex-col gap-2">
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#8B5CF6]">Search</p>
            <h1 className="text-3xl font-black leading-tight md:text-4xl">Results for &quot;{searchQuery}&quot;</h1>
            <p className="text-sm text-[#A1A1AA]">
              Search is running on the home page, so there is no separate page jump.
            </p>
          </div>

          {uiMangas.length > 0 ? (
            <>
              <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-[#A1A1AA]">
                Found {uiMangas.length} manga
              </p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8">
                {uiMangas.map((manga) => (
                  <MangaCard key={manga.slug} manga={manga} showChapter />
                ))}
              </div>
            </>
          ) : (
            <div className="mt-20 flex flex-col items-center justify-center text-center">
              <div className="grid h-20 w-20 place-items-center rounded-full bg-white/5 text-[#A1A1AA]">
                <Frown className="h-8 w-8" />
              </div>
              <h2 className="mt-4 text-lg font-bold text-white">No results found</h2>
              <p className="mt-2 max-w-sm text-sm text-[#A1A1AA]">
                No manga found matching &quot;{searchQuery}&quot;. Try another keyword from the search bar above.
              </p>
            </div>
          )}
        </section>

        <ContinueReadingBubble />
      </div>
    );
  }

  return (
    <div className="pb-28 md:pb-8">

      {/* Modern Swipeable Hero Carousel */}
      <FeaturedHeroCarousel items={featuredItems} />

      {/* Quick Genres */}
      <section className="mx-auto mt-6 max-w-7xl px-4 md:px-8">
        <div className="no-scrollbar flex gap-2 overflow-x-auto pb-2">
          {["Action", "Romance", "Fantasy", "Drama", "Comedy", "Sci-Fi"].map((g) => (
            <Link
              key={g}
              href={`/discover?genre=${encodeURIComponent(g)}`}
              className="shrink-0 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-[#A1A1AA] transition hover:bg-white/10 hover:text-white"
            >
              {g}
            </Link>
          ))}
          <Link
            href="/discover"
            className="shrink-0 rounded-full border border-[#8B5CF6]/40 bg-[#8B5CF6]/10 px-4 py-2 text-xs font-semibold text-[#8B5CF6] transition hover:bg-[#8B5CF6]/20"
          >
            Explore All ✦
          </Link>
        </div>
      </section>

      {/* Continue Reading (Client Side Library) */}
      <HomeLibraryRow />

      {/* Tier 3 Personalization: Recommended For You */}
      <PersonalizedFeedRow />

      <div className="mx-auto mt-8 max-w-7xl px-4 md:px-8"><AdSlot placement="home-feed" /></div>

      {/* Latest Releases & New Chapters */}
      <section className="mx-auto max-w-7xl px-4 md:px-8">
        <SectionTitle title="Latest Releases & New Chapters" accent="cyan" href="/discover?sort=updated" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8">
          {updated.slice(0, 16).map((m) => (
            <MangaCard key={m.slug} manga={m} showChapter />
          ))}
        </div>
      </section>

      {/* High-CPM Video Ad Unit */}
      <section className="mx-auto mt-8 max-w-7xl px-4 md:px-8">
        <VideoAdUnit />
      </section>

      {/* Top 100 Most Viewed Manga (Ranked by All-Time Views) */}
      <TopMangaSection items={top100} />

      {/* Floating Retention Bubble */}
      <ContinueReadingBubble />
    </div>
  );
}

function SectionTitle({ title, accent, href }: { title: string; accent: "violet" | "cyan"; href?: string }) {
  return (
    <div className="mb-4 mt-8 flex items-center justify-between">
      <h2 className="flex items-center gap-2 text-lg font-bold md:text-xl">
        <span
          className="h-4 w-1 rounded-full"
          style={{ background: accent === "violet" ? "#8B5CF6" : "#22D3EE" }}
        />
        {title}
      </h2>
      {href && (
        <Link href={href} className="inline-flex items-center gap-1 text-xs font-semibold text-[#A1A1AA] hover:text-white">
          See all <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      )}
    </div>
  );
}
