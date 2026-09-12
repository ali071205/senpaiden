export type ChapterStatus = "ready" | "processing" | "failed" | "retrying";

export interface MangaChapter {
  id: string;
  chapter_number: number;
  title?: string;
  language?: string;
  status?: ChapterStatus;
}

export interface Manga {
  slug: string;
  title: string;
  altTitle: string;
  description: string;
  coverHue: number;
  coverHue2: number;
  genres: string[];
  status: string;
  cover_url?: string;
  author?: string;
  artist?: string;
  tag?: string;
  latestChapter?: number;
  progress?: { chapter: number; page: number; percent: number };
  chapters?: MangaChapter[];
  views?: number | string;
  rank?: number;
}

export function formatViews(views?: number | string): string {
  if (!views) return "0";
  if (typeof views === "string" && (views.endsWith("B") || views.endsWith("M") || views.endsWith("K"))) {
    return views;
  }
  const num = typeof views === "string" ? parseFloat(views.replace(/[^0-9.]/g, "")) : views;
  if (!num || isNaN(num) || num <= 0) return typeof views === "string" ? views : "0";
  if (num >= 1_000_000_000) return `${(num / 1_000_000_000).toFixed(1)}B`;
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return num.toLocaleString();
}

export function coverGradient(m: Manga) {
  return `linear-gradient(135deg, oklch(0.4 0.15 ${m.coverHue}) 0%, oklch(0.2 0.1 ${m.coverHue2}) 100%)`;
}
