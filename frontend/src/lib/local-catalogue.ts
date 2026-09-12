import "server-only";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

export type CatalogueManga = { id: string; title: string; alt_title: string; description: string; genres: string[]; latest_chapter_number: number; status: string; cover_url?: string; updated_at?: string; author?: string; view_count?: number; title_i18n?: Record<string, any> };

let cache: CatalogueManga[] | null = null;

const STATIC_FALLBACK: CatalogueManga[] = [
  { id: "one-piece", title: "One Piece", alt_title: "Wan Pīsu", description: "Monkey D. Luffy sets sail with his crew to find the legendary treasure One Piece.", genres: ["Action", "Adventure", "Fantasy", "Shounen"], latest_chapter_number: 1110, status: "ongoing", cover_url: "https://uploads.mangadex.org/covers/a1c7c817-4e59-43b7-9365-09675a149a6f/b2a7587c-17ab-4318-971c-43f7cb49c394.jpg" },
  { id: "jujutsu-kaisen", title: "Jujutsu Kaisen", alt_title: "Sorcery Fight", description: "Yuji Itadori swallows a cursed talisman and enters the world of sorcery.", genres: ["Action", "Supernatural", "Shounen"], latest_chapter_number: 271, status: "completed", cover_url: "https://uploads.mangadex.org/covers/c52b2ce3-7f95-469c-96b1-6d32a1311551/8bb0d5db-b27b-4029-87a3-ef0c6e8e5efd.jpg" },
  { id: "solo-leveling", title: "Solo Leveling", alt_title: "Na Honjaman Rebeleob", description: "The weakest hunter Sung Jin-woo awakens as a player who can level up indefinitely.", genres: ["Action", "Fantasy", "Manhwa"], latest_chapter_number: 200, status: "completed", cover_url: "https://uploads.mangadex.org/covers/32d76d19-8a05-4db0-9fc2-e0b0648fe9d0/61b7c1fa-da13-4c9f-b984-754687d8df98.jpg" }
];

export async function getLocalCatalogue(): Promise<CatalogueManga[]> {
  if (cache && cache.length > 0) return cache;
  try {
    const directory = path.resolve(process.cwd(), "..", "data", "mangas");
    const files = (await readdir(directory)).filter((file) => file.endsWith(".json"));
    if (files.length > 0) {
      const records = await Promise.all(files.map(async (file) => {
        const item = JSON.parse(await readFile(path.join(directory, file), "utf8"));
        const chapterNumbers = Array.isArray(item.chapters) ? item.chapters.map((chapter: { chapterNumber?: number }) => Number(chapter.chapterNumber) || 0) : [];
        return { id: item.mangaId || item.slug, title: item.title || item.slug, alt_title: "", description: item.description || "", genres: Array.isArray(item.genres) && item.genres.length ? item.genres : ["Manga"], latest_chapter_number: chapterNumbers.length ? Math.max(...chapterNumbers) : Number(item.totalChapters) || 0, status: item.status || "ongoing", cover_url: item.coverUrl, updated_at: item.scrapedAt, author: item.author } satisfies CatalogueManga;
      }));
      cache = records.sort((a, b) => a.title.localeCompare(b.title));
      return cache;
    }
  } catch {
    // Return static catalogue in environments where local filesystem is unavailable
  }
  return STATIC_FALLBACK;
}
