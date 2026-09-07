"use client";

import { fetchApi } from "@/lib/api-client";
import { useState, useEffect, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { MangaCard } from "@/components/MangaCard";
import { Search as SearchIcon, X, Loader2, Frown } from "lucide-react";
import type { Manga } from "@/lib/manga-data";
import { AdSlot } from "@/components/AdSlot";

function SearchContent() {
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get("q") || "";
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<Manga[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const performSearch = async (searchTerm: string) => {
    if (!searchTerm.trim()) {
      setResults([]);
      setIsLoading(false);
      setHasSearched(false);
      return;
    }

    setIsLoading(true);
    setHasSearched(true);

    try {
      const json = await fetchApi<{ data?: any[] }>(`/api/manga?q=${encodeURIComponent(searchTerm.trim())}`);
      
      if (json?.data) {
        const data = json.data;
        const mapped: Manga[] = data.map((m: any) => ({
          slug: m.id,
          title: m.title,
          altTitle: m.alt_title || "",
          description: m.description || "",
          genres: m.genres || ["Action"],
          status: m.status || "Ongoing",
          cover_url: m.cover_url,
          coverHue: 250,
          coverHue2: 300,
          latestChapter: m.latest_chapter_number || 1,
        }));

        setResults(mapped);
      } else {
        setResults([]);
      }
    } catch {
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (initialQuery) {
      void performSearch(initialQuery);
    }
  }, [initialQuery]);

  const handleQueryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      performSearch(val);
    }, 300);
  };

  const clearSearch = () => {
    setQuery("");
    setResults([]);
    setHasSearched(false);
  };

  return (
    <div className="pb-28 md:pb-8">

      <div className="mx-auto max-w-7xl px-4 pt-4 md:px-8 md:pt-8">
        
        {/* Search Input Box */}
        <div className="relative mt-4">
          <SearchIcon className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#A1A1AA]" />
          <input
            type="text"
            value={query}
            onChange={handleQueryChange}
            placeholder="Search manga by title..."
            autoFocus
            className="w-full rounded-2xl border border-white/10 bg-white/5 py-4 pl-12 pr-12 text-white placeholder:text-[#A1A1AA] focus:border-[#8B5CF6]/50 focus:outline-none focus:ring-1 focus:ring-[#8B5CF6]/50 transition"
          />
          {isLoading ? (
            <Loader2 className="absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 animate-spin text-[#8B5CF6]" />
          ) : query ? (
            <button
              onClick={clearSearch}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-[#A1A1AA] hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>
          ) : null}
        </div>

        {/* State Views */}
        {isLoading ? (
          <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="aspect-[2/3] w-full rounded-xl sd-shimmer" />
            ))}
          </div>
        ) : hasSearched && results.length === 0 ? (
          <div className="mt-20 flex flex-col items-center justify-center text-center">
            <div className="grid h-20 w-20 place-items-center rounded-full bg-white/5 text-[#A1A1AA]">
              <Frown className="h-8 w-8" />
            </div>
            <h2 className="mt-4 text-lg font-bold text-white">No results found</h2>
            <p className="mt-2 max-w-sm text-sm text-[#A1A1AA]">
              No manga found matching &quot;{query}&quot;. Try searching for another keyword.
            </p>
          </div>
        ) : results.length > 0 ? (
          <div className="mt-6">
            <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-[#A1A1AA]">
              Found {results.length} results for &quot;{query}&quot;
            </p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8">
              {results.map((manga) => (
                <MangaCard key={manga.slug} manga={manga} showChapter />
              ))}
            </div>
            <div className="mt-8 border-t border-white/5 pt-8">
              <AdSlot placement="discover-bottom" />
            </div>
          </div>
        ) : (
          <div className="mt-20 flex flex-col items-center justify-center text-center">
            <div className="grid h-20 w-20 place-items-center rounded-full bg-white/5 text-[#A1A1AA]">
              <SearchIcon className="h-8 w-8" />
            </div>
            <h2 className="mt-4 text-lg font-bold text-white">Find your next obsession</h2>
            <p className="mt-2 max-w-sm text-sm text-[#A1A1AA]">
              Search by title to discover new manga inside Senpai Den.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={null}>
      <SearchContent />
    </Suspense>
  );
}

