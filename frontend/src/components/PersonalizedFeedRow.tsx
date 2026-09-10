"use client";

import { fetchApi } from "@/lib/api-client";
import { useState, useEffect } from "react";
import { MangaCard } from "@/components/MangaCard";
import { type Manga } from "@/lib/manga-data";
import { Zap } from "lucide-react";
import {
  getIs18Plus,
  isMatureManga,
  AGE_RESTRICTION_UPDATED_EVENT,
} from "@/lib/age-restriction";

interface CatalogItem {
  slug: string;
  title: string;
  cover_url?: string;
  status: string;
  genres: string[];
  latest_chapter_number?: number;
  client_vector: number[];
}

export function PersonalizedFeedRow() {
  const [recommendations, setRecommendations] = useState<Manga[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    async function computePersonalizedFeed() {
      try {
        const json = await fetchApi<{ catalog?: CatalogItem[]; data?: CatalogItem[] }>("/api/catalog-vectors");
        const rawCatalog: CatalogItem[] = json?.catalog || json?.data || [];
        const is18Plus = getIs18Plus();
        const catalog = rawCatalog.filter((item) => is18Plus || !isMatureManga(item.genres));
        if (catalog.length === 0) {
          setIsLoaded(true);
          return;
        }

        // 1. Get user interaction history from localStorage
        const libraryStr = localStorage.getItem("senpai_library");
        const library: Manga[] = libraryStr ? JSON.parse(libraryStr) : [];
        const userSlugs = new Set(library.map((m) => m.slug));

        // Add history slugs
        const keys = Object.keys(localStorage);
        for (const k of keys) {
          if (k.startsWith("senpai_progress_")) {
            userSlugs.add(k.replace("senpai_progress_", ""));
          }
        }

        // If user has zero local history, default to top catalog items
        if (userSlugs.size === 0) {
          const seen = new Set<string>();
          const fallback = catalog
            .filter((item) => {
              if (!item.slug || seen.has(item.slug)) return false;
              seen.add(item.slug);
              return true;
            })
            .slice(0, 6)
            .map((item) => ({
              slug: item.slug,
              title: item.title,
              altTitle: "",
              description: "",
              genres: item.genres || ["Action"],
              status: item.status || "Ongoing",
              cover_url: item.cover_url,
              coverHue: 250,
              coverHue2: 300,
              latestChapter: item.latest_chapter_number || 1,
            }));
          setRecommendations(fallback);
          setIsLoaded(true);
          return;
        }

        // 2. Build User Affinity Vector (16-dim float array)
        const userVector = new Float32Array(16);
        let matchCount = 0;

        for (const item of catalog) {
          if (userSlugs.has(item.slug) && item.client_vector) {
            matchCount++;
            for (let i = 0; i < 16; i++) {
              userVector[i] += item.client_vector[i] || 0;
            }
          }
        }

        // Normalize User Vector
        if (matchCount > 0) {
          for (let i = 0; i < 16; i++) {
            userVector[i] /= matchCount;
          }
        }

        // 3. Compute Cosine Similarity for unread items (< 1ms execution)
        const scored: { item: CatalogItem; score: number }[] = [];

        for (const item of catalog) {
          if (userSlugs.has(item.slug)) continue; // Skip already read items

          const itemVec = new Float32Array(item.client_vector || new Array(16).fill(1));
          
          // Dot product
          let dot = 0;
          let normA = 0;
          let normB = 0;

          for (let i = 0; i < 16; i++) {
            dot += userVector[i] * itemVec[i];
            normA += userVector[i] * userVector[i];
            normB += itemVec[i] * itemVec[i];
          }

          const score = (normA > 0 && normB > 0) ? dot / (Math.sqrt(normA) * Math.sqrt(normB)) : 0;
          scored.push({ item, score });
        }

        // Sort descending by score
        scored.sort((a, b) => b.score - a.score);

        const seenRecs = new Set<string>();
        const mapped: Manga[] = scored
          .filter(({ item }) => {
            if (!item.slug || seenRecs.has(item.slug)) return false;
            seenRecs.add(item.slug);
            return true;
          })
          .slice(0, 6)
          .map(({ item }) => ({
            slug: item.slug,
            title: item.title,
            altTitle: "",
            description: "",
            genres: item.genres || ["Action"],
            status: item.status || "Ongoing",
            cover_url: item.cover_url,
            coverHue: 250,
            coverHue2: 300,
            latestChapter: item.latest_chapter_number || 1,
          }));

        setRecommendations(mapped);
      } catch {
        setRecommendations([]);
      } finally {
        setIsLoaded(true);
      }
    }

    computePersonalizedFeed();
    window.addEventListener(AGE_RESTRICTION_UPDATED_EVENT, computePersonalizedFeed);
    return () => {
      window.removeEventListener(AGE_RESTRICTION_UPDATED_EVENT, computePersonalizedFeed);
    };
  }, []);

  if (isLoaded && recommendations.length === 0) return null;

  return (
    <section className="mx-auto mt-10 max-w-7xl px-4 md:px-8">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-lg font-bold md:text-xl text-white">
          <Zap className="h-5 w-5 text-amber-400 fill-amber-400" />
          Recommended For You
        </h2>
      </div>

      {!isLoaded ? (
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
