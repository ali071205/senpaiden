import type { MetadataRoute } from "next";
import { getLocalCatalogue, type CatalogueManga } from "@/lib/local-catalogue";
import { resolveSiteUrl } from "@/lib/seo-server";
import { fetchApi } from "@/lib/api-client";
import { ADS_ENABLED } from "@/lib/monetization";

export const dynamic = "force-dynamic";

const staticRoutes: Array<{ path: string; changeFrequency: "daily" | "weekly" | "monthly"; priority: number }> = [
  { path: "", changeFrequency: "daily", priority: 1 },
  { path: "/discover", changeFrequency: "daily", priority: 0.9 },
  { path: "/about", changeFrequency: "monthly", priority: 0.5 },
  { path: "/contact", changeFrequency: "monthly", priority: 0.4 },
  { path: "/privacy", changeFrequency: "monthly", priority: 0.3 },
  { path: "/cookies", changeFrequency: "monthly", priority: 0.3 },
  { path: "/terms", changeFrequency: "monthly", priority: 0.3 },
  { path: "/copyright", changeFrequency: "monthly", priority: 0.4 },
  ...(ADS_ENABLED ? [
    { path: "/partners" as const, changeFrequency: "monthly" as const, priority: 0.4 },
    { path: "/affiliate-disclosure" as const, changeFrequency: "monthly" as const, priority: 0.3 },
  ] : []),
];

async function getSitemapManga(): Promise<CatalogueManga[]> {
  const local = await getLocalCatalogue();
  if (local.length) return local;

  const results: CatalogueManga[] = [];
  for (let page = 1; page <= 100; page += 1) {
    const payload = await fetchApi<{ data?: CatalogueManga[] }>(`/api/manga?page=${page}`);
    const items = payload?.data || [];
    results.push(...items);
    if (items.length < 24) break;
  }
  return results;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = await resolveSiteUrl();
  let manga: CatalogueManga[] = [];
  try {
    manga = await getSitemapManga();
  } catch {
    manga = [];
  }

  const staticEntries: MetadataRoute.Sitemap = staticRoutes.map((route) => ({
    url: `${siteUrl}${route.path}`,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));

  const mangaEntries: MetadataRoute.Sitemap = manga.map((item) => ({
    url: `${siteUrl}/manga/${encodeURIComponent(item.id)}`,
    lastModified: item.updated_at ? new Date(item.updated_at) : undefined,
    changeFrequency: "daily",
    priority: 0.8,
    images: item.cover_url ? [item.cover_url] : undefined,
  }));

  return [...staticEntries, ...mangaEntries];
}
