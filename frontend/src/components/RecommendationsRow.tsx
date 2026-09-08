"use client";

import { fetchApi } from "@/lib/api-client";
import { useState, useEffect } from "react";
import { MangaCard } from "@/components/MangaCard";
import { Sparkles, Compass } from "lucide-react";
import type { Manga } from "@/lib/manga-data";

interface RecommendationsRowProps {
  mangaId: string;
  type: "semantic" | "cobinged";
  title?: string;
}

export function RecommendationsRow({ mangaId, type, title }: RecommendationsRowProps) {
  const [recommendations, setRecommendations] = useState<Manga[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadRecommendations() {
      setIsLoading(true);
      try {
        const endpoint = type === "semantic"
          ? `/api/manga/${mangaId}/recommendations`
          : `/api/manga/${mangaId}/co-binged`;

        const json = await fetchApi<{ data?: any[] }>(endpoint);
        
        if (json?.data) {
          const data = json.data;
          const seen = new Set<string>();
          const mapped: Manga[] = data
            .filter((m: any) => {
              if (!m.id || seen.has(m.id)) return false;
              seen.add(m.id);
              return true;
            })
            .map((m: any) => ({
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

          setRecommendations(mapped);
        }
      } catch {
        setRecommendations([]);
      } finally {
        setIsLoading(false);
      }
    }

    if (mangaId) {
      loadRecommendations();
    }
  }, [mangaId, type]);

  if (!isLoading && recommendations.length === 0) return null;

  const defaultTitle = type === "semantic" ? "More Like This" : "Readers Also Binged";

  return (
    <section className="mt-10">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-lg font-bold md:text-xl text-white">
          {type === "semantic" ? (
            <Sparkles className="h-5 w-5 text-[#8B5CF6]" />
          ) : (
            <Compass className="h-5 w-5 text-[#22D3EE]" />
          )}
          {title || defaultTitle}
        </h3>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="aspect-[2/3] w-full rounded-xl sd-shimmer" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {recommendations.map((manga) => (
            <MangaCard key={manga.slug} manga={manga} showChapter />
          ))}
        </div>
      )}
    </section>
  );
}
