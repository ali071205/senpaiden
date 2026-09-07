import Link from "next/link";
import { MangaCard } from "@/components/MangaCard";
import { AddToLibraryButton } from "@/components/AddToLibraryButton";
import { HomeLibraryRow } from "@/components/HomeLibraryRow";
import { PersonalizedFeedRow } from "@/components/PersonalizedFeedRow";
import { ContinueReadingBubble } from "@/components/ContinueReadingBubble";
import { AdSlot } from "@/components/AdSlot";
import { VideoAdUnit } from "@/components/VideoAdUnit";
import { FeaturedHeroCarousel } from "@/components/FeaturedHeroCarousel";
import { Frown, ChevronRight } from "lucide-react";
import { getLocalCatalogue, type CatalogueManga } from "@/lib/local-catalogue";

// Server Component fetching live data from Cloudflare Worker / Next API
export const revalidate = 60; // Edge Cache for 60 seconds

import { getCachedMangaList } from "@/lib/cache";

export default async function Home({ searchParams }: { searchParams?: Promise<{ q?: string }> }) {
  const resolvedSearchParams = await searchParams;
  const searchQuery = resolvedSearchParams?.q?.trim() || "";
  
  let mangas: CatalogueManga[] = [];
  try {
    const result = await getCachedMangaList({
      q: searchQuery || undefined,
      page: 1,
      limit: 24,
    });
    if (result.data && result.data.length > 0) {
      mangas = result.data as CatalogueManga[];
    }
  } catch {
    // Fallback to local catalogue
  }
  if (!mangas.length) {
    const local = await getLocalCatalogue();
    mangas = (searchQuery ? local.filter((manga) => manga.title.toLowerCase().includes(searchQuery.toLowerCase())) : local).slice(0, 24);
  }

  // Map API data to the UI format temporarily if it's missing fields
  const seenIds = new Set<string>();
  const uniqueMangas = mangas.filter((m) => {
    if (!m.id || seenIds.has(m.id)) return false;
    seenIds.add(m.id);
    return true;
  });

  const uiMangas = uniqueMangas.map((m) => ({
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
  }));

  const featuredItems = uiMangas.slice(0, 6);
  const trending = uiMangas.slice(0, 8);
  const updated = uiMangas.slice(8, 16);
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

      {/* Trending */}
      <section className="mx-auto max-w-7xl px-4 md:px-8">
        <SectionTitle title="Trending Now" accent="violet" href="/discover" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8">
          {trending.map((m) => (
            <MangaCard key={m.slug} manga={m} showChapter />
          ))}
        </div>
      </section>

      {/* High-CPM Video Ad Unit */}
      <section className="mx-auto mt-8 max-w-7xl px-4 md:px-8">
        <VideoAdUnit />
      </section>

      {/* Recently Updated */}
      <section className="mx-auto mt-10 max-w-7xl px-4 md:px-8">
        <SectionTitle title="Recently Updated" accent="cyan" />
        <div className="no-scrollbar -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 md:mx-0 md:px-0">
          {updated.map((m) => (
            <div key={m.slug} className="w-32 shrink-0 snap-start sm:w-36">
              <MangaCard manga={m} showChapter />
            </div>
          ))}
        </div>
      </section>

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
