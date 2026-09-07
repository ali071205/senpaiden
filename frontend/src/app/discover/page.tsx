import Link from "next/link";
import { MangaCard } from "@/components/MangaCard";
import { AdvancedFilterPanel } from "@/components/AdvancedFilterPanel";
import { CategorySearchBar } from "@/components/CategorySearchBar";
import { AdSlot } from "@/components/AdSlot";
import { ChevronLeft, ChevronRight, Frown } from "lucide-react";
import { getCachedMangaList } from "@/lib/cache";
import { getLocalCatalogue, type CatalogueManga } from "@/lib/local-catalogue";

export const revalidate = 60; // Edge Cache

export const metadata = {
  title: "Discover Manga, Manhwa & Webtoons",
  description: "Discover trending manga, manhwa, and webtoons curated for your next binge on Senpai Den.",
  alternates: { canonical: "/discover" },
};

export default async function Discover({ searchParams }: { searchParams: Promise<{ q?: string; genre?: string; page?: string; included?: string; excluded?: string; sort?: string }> }) {
  const resolvedParams = await searchParams;
  const searchQuery = resolvedParams.q?.trim() || "";
  const currentGenre = resolvedParams.genre || "All";
  const pageNum = parseInt(resolvedParams.page || "1", 10);
  const included = resolvedParams.included;
  const sort = resolvedParams.sort;
  const limit = 24;
  
  let mangas: CatalogueManga[] = [];
  let totalCount = 0;

  try {
    const result = await getCachedMangaList({
      q: searchQuery || undefined,
      genre: currentGenre !== "All" && !included ? currentGenre : undefined,
      page: pageNum,
      limit,
    });
    if (result.data && result.data.length > 0) {
      mangas = result.data as CatalogueManga[];
      totalCount = result.total || mangas.length;
    }
  } catch {
    // Keep navigation responsive when the catalogue API is unavailable.
  }
  if (!mangas.length) {
    const local = await getLocalCatalogue();
    let filtered = local;
    if (searchQuery) {
      filtered = filtered.filter((m) => m.title.toLowerCase().includes(searchQuery.toLowerCase()));
    }
    if (currentGenre !== "All") {
      filtered = filtered.filter((manga) => manga.genres.some((genre) => genre.toLowerCase() === currentGenre.toLowerCase()));
    }
    totalCount = filtered.length;
    mangas = filtered.slice((pageNum - 1) * limit, pageNum * limit);
  }

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

  const POPULAR_GENRES = ["Action", "Romance", "Fantasy", "Drama", "Comedy", "Sci-Fi", "Slice of Life", "Mystery", "Horror"];

  const buildUrl = (targetPage: number, genre: string) => {
    const params = new URLSearchParams();
    if (searchQuery) params.set("q", searchQuery);
    if (genre !== "All") params.set("genre", genre);
    if (targetPage > 1) params.set("page", targetPage.toString());
    if (sort) params.set("sort", sort);
    const str = params.toString();
    return `/discover${str ? `?${str}` : ""}`;
  };

  const totalPages = Math.ceil(totalCount / limit) || 1;

  const isLatest = sort === "updated";

  return (
    <div className="pb-28 md:pb-8">
      <div className="mx-auto max-w-7xl px-4 pt-4 md:px-8 md:pt-8">
        <h1 className="text-2xl font-black md:text-3xl">
          {searchQuery ? `Search results for "${searchQuery}"` : isLatest ? "Latest Releases" : (currentGenre !== "All" ? `${currentGenre} Manga` : "Discover Manga")}
        </h1>
        <p className="mt-1 text-sm text-[#A1A1AA]">
          {searchQuery ? `Explore matching series and genres.` : isLatest ? "Manga with recently updated chapters." : "Handpicked worlds waiting inside the Den."}
        </p>

        {/* Search Bar */}
        <CategorySearchBar />

        {/* Genre Filters */}
        <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto pb-1 items-center">
          <AdvancedFilterPanel />
          <div className="h-6 w-px bg-white/10 mx-1 shrink-0" />
          
          {["All", ...POPULAR_GENRES].map((g) => {
            const isActive = g === currentGenre;
            return (
              <Link
                key={g}
                href={buildUrl(1, g)}
                className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                  isActive
                    ? "sd-gradient border-transparent text-white"
                    : "border-white/10 bg-white/5 text-[#A1A1AA] hover:text-white"
                }`}
              >
                {g}
              </Link>
            );
          })}
        </div>

        {/* Manga Cards Grid */}
        {uiMangas.length > 0 ? (
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8">
            {uiMangas.map((m) => (
              <MangaCard key={m.slug} manga={m} showChapter />
            ))}
          </div>
        ) : (
          <div className="mt-16 flex flex-col items-center justify-center text-center">
            <div className="grid h-16 w-16 place-items-center rounded-full bg-white/5 text-[#A1A1AA]">
              <Frown className="h-8 w-8" />
            </div>
            <h3 className="mt-4 text-base font-bold text-white">No manga found</h3>
            <p className="mt-1 max-w-sm text-xs text-[#A1A1AA]">
              No series match your search filters. Try clearing or searching another title.
            </p>
          </div>
        )}

        {/* Pagination Controls */}
        <div className="mt-10 flex items-center justify-between border-t border-white/10 pt-6">
          <p className="text-xs text-[#A1A1AA]">
            Page <span className="font-bold text-white">{pageNum}</span> of <span className="font-bold text-white">{totalPages}</span>
          </p>

          <div className="flex gap-2">
            {pageNum > 1 ? (
              <Link
                href={buildUrl(pageNum - 1, currentGenre)}
                className="inline-flex items-center gap-1 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-white hover:bg-white/10 transition"
              >
                <ChevronLeft className="h-4 w-4" /> Previous
              </Link>
            ) : (
              <button
                disabled
                className="inline-flex items-center gap-1 rounded-xl border border-white/5 bg-white/5 px-4 py-2 text-xs font-semibold text-[#71717A] opacity-50 cursor-not-allowed"
              >
                <ChevronLeft className="h-4 w-4" /> Previous
              </button>
            )}

            {uiMangas.length === limit ? (
              <Link
                href={buildUrl(pageNum + 1, currentGenre)}
                className="inline-flex items-center gap-1 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-white hover:bg-white/10 transition"
              >
                Next <ChevronRight className="h-4 w-4" />
              </Link>
            ) : (
              <button
                disabled
                className="inline-flex items-center gap-1 rounded-xl border border-white/5 bg-white/5 px-4 py-2 text-xs font-semibold text-[#71717A] opacity-50 cursor-not-allowed"
              >
                Next <ChevronRight className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
        <div className="mt-8 border-t border-white/5 pt-8"><AdSlot placement="discover-bottom" /></div>
      </div>
    </div>
  );
}
