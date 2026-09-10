import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MangaDetailClient } from "./MangaDetailClient";
import { AdSlot } from "@/components/AdSlot";
import { getLocalCatalogue, type CatalogueManga } from "@/lib/local-catalogue";
import { getCachedMangaDetail, getCachedRecommendations } from "@/lib/cache";
import { cleanDescription, mangaCanonical, SITE_NAME, absoluteUrl } from "@/lib/seo";

export const revalidate = 60;

interface ChapterItem {
  id: string;
  chapter_number: number;
  title?: string;
  language?: string;
  release_date?: string;
  views?: number;
  likes?: number;
}

const getManga = cache(async (id: string): Promise<(CatalogueManga & { chapters?: ChapterItem[] }) | null> => {
  const data = await getCachedMangaDetail(id);
  if (data) return data as any;
  const local = (await getLocalCatalogue()).find((item) => item.id === id);
  return local ? { ...local, chapters: [] } : null;
});

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const manga = await getManga(id);
  if (!manga) return { title: "Manga Not Found", robots: { index: false, follow: false } };

  const canonical = mangaCanonical(manga.id);
  const description = cleanDescription(manga.description, `Discover ${manga.title}, chapters, details and similar manga on ${SITE_NAME}.`);
  const title = `Read ${manga.title} Manga Online | ${SITE_NAME}`;
  const image = manga.cover_url || absoluteUrl("/icon.png");

  return {
    title: { absolute: title },
    description,
    alternates: { canonical },
    keywords: [manga.title, manga.alt_title, ...(manga.genres || []), "manga", "manhwa", "webtoon"].filter(Boolean),
    openGraph: {
      type: "article",
      url: canonical,
      siteName: SITE_NAME,
      title,
      description,
      images: [{ url: image, alt: `${manga.title} manga cover` }],
    },
    twitter: { card: "summary_large_image", title, description, images: [image] },
    robots: {
      index: true,
      follow: true,
      googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 },
    },
  };
}

export default async function MangaDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const mangaWithChapters = await getManga(id);
  if (!mangaWithChapters) notFound();

  const { chapters, ...manga } = mangaWithChapters;
  let related: CatalogueManga[] = [];

  try {
    const recs = await getCachedRecommendations(id);
    if (recs && recs.length > 0) {
      related = recs as any;
    }
  } catch {}

  if (!related.length) {
    const local = await getLocalCatalogue();
    related = local.filter((item) => item.id !== manga.id).slice(0, 4);
  }

  const canonical = mangaCanonical(manga.id);
  const description = cleanDescription(manga.description, `Discover ${manga.title}, chapters and related manga on ${SITE_NAME}.`, 500);
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "CreativeWorkSeries",
        "@id": `${canonical}#series`,
        name: manga.title,
        alternateName: manga.alt_title || undefined,
        description,
        image: manga.cover_url || undefined,
        url: canonical,
        author: manga.author ? { "@type": "Person", name: manga.author } : undefined,
        genre: manga.genres || [],
        inLanguage: "en",
        isAccessibleForFree: true,
      },
      {
        "@type": "BreadcrumbList",
        "@id": `${canonical}#breadcrumb`,
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: absoluteUrl("/") },
          { "@type": "ListItem", position: 2, name: "Discover", item: absoluteUrl("/discover") },
          { "@type": "ListItem", position: 3, name: manga.title, item: canonical },
        ],
      },
    ],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <MangaDetailClient manga={manga} chapters={chapters || []} related={related} />
      <div className="mx-auto max-w-6xl px-4 pb-10 md:px-8"><AdSlot placement="manga-detail" /></div>
    </>
  );
}

