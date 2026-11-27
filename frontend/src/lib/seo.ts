const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://senpaiden-seven.vercel.app";

export const SITE_URL = configuredSiteUrl.replace(/\/$/, "");
export const SITE_NAME = "Senpai Den";
export const DEFAULT_DESCRIPTION =
  "Discover manga, manhwa and webtoons, follow new chapters, and continue your reading journey on Senpai Den.";

export function absoluteUrl(path = "/") {
  return new URL(path, `${SITE_URL}/`).toString();
}

export function cleanDescription(value: unknown, fallback = DEFAULT_DESCRIPTION, maxLength = 160) {
  const normalized = typeof value === "string"
    ? value.replace(/---[\s\S]*$/, "").replace(/\s+/g, " ").trim()
    : "";
  if (!normalized) return fallback;
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

export function mangaCanonical(id: string) {
  return absoluteUrl(`/manga/${encodeURIComponent(id)}`);
}

export function chapterCanonical(mangaId: string, chapterNumber: string | number) {
  return absoluteUrl(`/manga/${encodeURIComponent(mangaId)}/${encodeURIComponent(chapterNumber.toString())}`);
}
