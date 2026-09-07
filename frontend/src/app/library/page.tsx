"use client";

import { useState, useEffect } from "react";

import { MangaCard } from "@/components/MangaCard";
import { Bookmark, Trash2 } from "lucide-react";
import type { Manga } from "@/lib/manga-data";
import { AdSlot } from "@/components/AdSlot";

export default function LibraryPage() {
  const [library, setLibrary] = useState<Manga[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  const loadLibrary = () => {
    try {
      const saved = localStorage.getItem("senpai_library");
      if (saved) {
        setLibrary(JSON.parse(saved));
      } else {
        setLibrary([]);
      }
    } catch {
      setLibrary([]);
    }
    setIsLoaded(true);
  };

  useEffect(() => {
    loadLibrary();

    const handleUpdate = () => loadLibrary();
    window.addEventListener("senpai_library_updated", handleUpdate);
    window.addEventListener("storage", handleUpdate);

    return () => {
      window.removeEventListener("senpai_library_updated", handleUpdate);
      window.removeEventListener("storage", handleUpdate);
    };
  }, []);

  const clearLibrary = () => {
    if (confirm("Are you sure you want to clear your library?")) {
      localStorage.removeItem("senpai_library");
      setLibrary([]);
      window.dispatchEvent(new CustomEvent("senpai_library_updated"));
    }
  };

  return (
    <div className="pb-28 md:pb-8">
      <div className="mx-auto max-w-7xl px-4 pt-4 md:px-8 md:pt-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black md:text-3xl">Library</h1>
            <p className="mt-1 text-sm text-[#A1A1AA]">
              Your saved manga collection ({library.length} {library.length === 1 ? "series" : "series"}).
            </p>
          </div>
          {library.length > 0 && (
            <button
              onClick={clearLibrary}
              className="inline-flex items-center gap-1.5 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-400 hover:bg-red-500/20 transition"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Clear Library
            </button>
          )}
        </div>

        {!isLoaded ? (
          <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="aspect-[2/3] w-full rounded-xl sd-shimmer" />
            ))}
          </div>
        ) : library.length === 0 ? (
          <div className="mt-20 flex flex-col items-center justify-center text-center">
            <div className="grid h-20 w-20 place-items-center rounded-full bg-white/5 text-[#A1A1AA]">
              <Bookmark className="h-8 w-8" />
            </div>
            <h2 className="mt-4 text-lg font-bold text-white">Your library is empty</h2>
            <p className="mt-2 max-w-sm text-sm text-[#A1A1AA]">
              Bookmark series you want to read later, and they will appear here.
            </p>
          </div>
        ) : (
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8">
            {library.map((manga, index) => (
              <div key={manga.slug} className="contents">
                <MangaCard manga={manga} showChapter />
                {(index + 1) % 6 === 0 && index < library.length - 1 && (
                  <div className="col-span-full my-3">
                    <AdSlot placement="library-bottom" />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        {isLoaded && library.length > 0 && (
          <div className="mt-10 border-t border-white/5 pt-8">
            <AdSlot placement="library-bottom" />
          </div>
        )}
      </div>
    </div>
  );
}
