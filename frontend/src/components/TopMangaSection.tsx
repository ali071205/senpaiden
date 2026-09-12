"use client";

import { useState, useMemo } from "react";
import { MangaCard } from "@/components/MangaCard";
import type { Manga } from "@/lib/manga-data";
import { Flame, Trophy, ChevronDown, ChevronUp, Sparkles, Filter } from "lucide-react";

interface Props {
  items: Manga[];
}

const TABS = [
  { id: "all", label: "All Top 100" },
  { id: "action", label: "Action & Shounen" },
  { id: "fantasy", label: "Fantasy & Isekai" },
  { id: "manhwa", label: "Manhwa & Webtoons" },
  { id: "romance", label: "Romance & Drama" },
] as const;

export function TopMangaSection({ items }: Props) {
  const [activeTab, setActiveTab] = useState<string>("all");
  const [visibleCount, setVisibleCount] = useState(24);

  const filteredItems = useMemo(() => {
    if (activeTab === "all") return items;
    return items.filter((m) => {
      const g = (m.genres || []).map((x) => x.toLowerCase());
      if (activeTab === "action") return g.some((x) => x.includes("action") || x.includes("shounen") || x.includes("martial"));
      if (activeTab === "fantasy") return g.some((x) => x.includes("fantasy") || x.includes("isekai") || x.includes("magic"));
      if (activeTab === "manhwa") return g.some((x) => x.includes("manhwa") || x.includes("webtoon"));
      if (activeTab === "romance") return g.some((x) => x.includes("romance") || x.includes("drama") || x.includes("shoujo"));
      return true;
    });
  }, [items, activeTab]);

  const displayedItems = useMemo(() => {
    return filteredItems.slice(0, visibleCount);
  }, [filteredItems, visibleCount]);

  const handleShowMore = () => {
    setVisibleCount((prev) => Math.min(prev + 24, filteredItems.length));
  };

  const handleShowAll = () => {
    setVisibleCount(filteredItems.length);
  };

  const handleCollapse = () => {
    setVisibleCount(24);
  };

  if (!items || items.length === 0) return null;

  return (
    <section className="mx-auto mt-12 max-w-7xl px-4 md:px-8">
      {/* Header Section */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between border-b border-white/10 pb-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-[#FF2E2E]">
            <Trophy className="h-4 w-4 text-[#FFD700]" />
            <span>All-Time Rankings</span>
          </div>
          <h2 className="mt-1 flex items-center gap-2 text-2xl font-black md:text-3xl text-white font-rajdhani tracking-wide">
            Top 100 Most Viewed Manga
            <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-xs font-bold text-zinc-300 font-sans">
              {items.length}+
            </span>
          </h2>
          <p className="mt-1 text-xs text-zinc-400">
            Highest internet views and all-time reader popularity ranking.
          </p>
        </div>

        {/* Tab Filters */}
        <div className="no-scrollbar flex items-center gap-1.5 overflow-x-auto py-1">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id);
                  setVisibleCount(24);
                }}
                className={`shrink-0 rounded-xl px-3 py-1.5 text-xs font-bold transition-all duration-200 ${
                  isActive
                    ? "bg-primary text-white shadow-md shadow-primary/30"
                    : "bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-white"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Grid of Top 100 Mangas */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8">
        {displayedItems.map((manga, index) => {
          // Rank is 1-indexed based on position in all-time view order
          const rank = manga.rank || index + 1;
          return (
            <div key={manga.slug} className="relative group">
              <MangaCard manga={manga} rank={rank} showChapter />
            </div>
          );
        })}
      </div>

      {/* Footer Controls: Show More / Show All / Collapse */}
      <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
        {visibleCount < filteredItems.length ? (
          <>
            <button
              onClick={handleShowMore}
              className="inline-flex items-center gap-2 rounded-2xl bg-white/10 hover:bg-white/15 border border-white/10 px-6 py-3 text-xs font-bold text-white transition-all hover:scale-105 active:scale-95 shadow-lg"
            >
              <span>Load More Top Manga (+24)</span>
              <ChevronDown className="h-4 w-4 text-zinc-400" />
            </button>
            <button
              onClick={handleShowAll}
              className="inline-flex items-center gap-2 rounded-2xl sd-gradient px-6 py-3 text-xs font-bold text-white shadow-lg shadow-primary/20 hover:scale-105 active:scale-95 transition-all"
            >
              <Sparkles className="h-4 w-4" />
              <span>Show All ({filteredItems.length})</span>
            </button>
          </>
        ) : filteredItems.length > 24 ? (
          <button
            onClick={handleCollapse}
            className="inline-flex items-center gap-2 rounded-2xl bg-white/10 hover:bg-white/15 border border-white/10 px-6 py-3 text-xs font-bold text-zinc-300 hover:text-white transition-all shadow-lg"
          >
            <span>Show Less (Collapse to 24)</span>
            <ChevronUp className="h-4 w-4 text-zinc-400" />
          </button>
        ) : null}
      </div>

      <div className="mt-3 text-center text-[11px] font-semibold text-zinc-500">
        Showing {displayedItems.length} of {filteredItems.length} ranked titles
      </div>
    </section>
  );
}
