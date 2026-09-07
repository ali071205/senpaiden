import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { MangaReaderContainer } from "@/components/MangaReaderContainer";
import { fetchApi } from "@/lib/api-client";
import { getApiUrl } from "@/lib/api";
import { getLocalCatalogue } from "@/lib/local-catalogue";
import { chapterCanonical, mangaCanonical, SITE_NAME, absoluteUrl } from "@/lib/seo";

// Cache immutable chapters forever. Stale chapters are cached for 60s at the edge.
export const revalidate = 31536000;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string; chapter: string }>;
}): Promise<Metadata> {
  const { id, chapter } = await params;
  const apiUrl = getApiUrl();

  let title = "Manga";
  let coverUrl = absoluteUrl("/icon.png");

  try {
    const res = await fetch(`${apiUrl}/api/manga/${id}`, {
      signal: AbortSignal.timeout(8000),
      next: { revalidate: 3600 },
    });
    if (res.ok) {
      const data = await res.json();
      title = data.title || title;
      if (data.cover_url) coverUrl = data.cover_url;
    }
  } catch {
    const local = (await getLocalCatalogue()).find((item) => item.id === id);
    if (local) {
      title = local.title;
      if (local.cover_url) coverUrl = local.cover_url;
    }
  }

  const pageTitle = `Read ${title} Chapter ${chapter} Online Free | ${SITE_NAME}`;
  const description = `Read ${title} Chapter ${chapter} online with high quality images on ${SITE_NAME}. Free fast manga reader.`;
  const canonical = chapterCanonical(id, chapter);

  return {
    title: { absolute: pageTitle },
    description,
    alternates: { canonical },
    keywords: [title, `chapter ${chapter}`, `${title} ch ${chapter}`, "read manga online", "free manga chapters"],
    openGraph: {
      type: "article",
      url: canonical,
      siteName: SITE_NAME,
      title: pageTitle,
      description,
      images: [{ url: coverUrl, alt: `${title} Chapter ${chapter}` }],
    },
    twitter: {
      card: "summary_large_image",
      title: pageTitle,
      description,
      images: [coverUrl],
    },
    robots: {
      index: true,
      follow: true,
      googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 },
    },
  };
}

export default async function ReaderPage({ params }: { params: Promise<{ id: string; chapter: string }> }) {
  const resolvedParams = await params;
  const apiUrl = getApiUrl();

  try {
    const compoundRes = await fetch(`${apiUrl}/api/manga/${resolvedParams.id}/chapter/${resolvedParams.chapter}`);

    if (!compoundRes.ok) {
      if (compoundRes.status === 400) {
        redirect(`/manga/${resolvedParams.id}/${resolvedParams.chapter}/processing`);
      }
      notFound();
    }

    const { manga, chapter, chapters, pages, available_languages } = await compoundRes.json();
    const freshness = compoundRes.headers.get("x-content-freshness") as "fresh" | "stale" | "archived" | null;

    fetchApi(`/api/chapter/${chapter.id}/read`, { method: "POST" }).catch(() => {});

    const allSlices: { key: string; width: number; height: number; blurhash?: string }[] = [];
    const pageGroups: { pageNumber: number; slices: { key: string; width: number; height: number; blurhash?: string }[] }[] = [];

    interface RawPage {
      page_number?: number;
      r2_keys: string[];
      slice_dimensions?: unknown;
      blurhash?: unknown;
    }

    pages?.forEach((page: RawPage, pageIdx: number) => {
      const r2Keys = page.r2_keys || [];
      let dims: { width?: number; height?: number }[] = [];
      try {
        dims = typeof page.slice_dimensions === "string"
          ? JSON.parse(page.slice_dimensions)
          : (Array.isArray(page.slice_dimensions) ? page.slice_dimensions : []);
      } catch {}

      let bHashes: unknown = page.blurhash;
      try {
        if (typeof page.blurhash === "string" && page.blurhash.startsWith("[")) {
          bHashes = JSON.parse(page.blurhash);
        }
      } catch {}

      const pSlices: { key: string; width: number; height: number; blurhash?: string }[] = [];
      r2Keys.forEach((key, idx) => {
        let cleanKey = key;
        if (cleanKey.includes(".mangadex.network/data/")) {
          cleanKey = cleanKey.replace(/https?:\/\/[^\/]+\.mangadex\.network\/data\//, "https://uploads.mangadex.org/data/");
        }
        const dim = (Array.isArray(dims) && dims[idx]) ? dims[idx] : { width: 800, height: 1200 };
        const bHash = Array.isArray(bHashes) ? bHashes[idx] : (typeof bHashes === "string" ? bHashes : undefined);
        const item = {
          key: cleanKey,
          width: dim.width || 800,
          height: dim.height || 1200,
          blurhash: bHash,
        };
        allSlices.push(item);
        pSlices.push(item);
      });

      pageGroups.push({
        pageNumber: page.page_number || (pageIdx + 1),
        slices: pSlices,
      });
    });

    const r2BaseUrl =
      process.env.NEXT_PUBLIC_R2_URL ||
      "/api/image";

    const canonical = chapterCanonical(resolvedParams.id, resolvedParams.chapter);
    const mangaUrl = mangaCanonical(resolvedParams.id);
    const mangaTitle = manga.title || "Manga";

    const jsonLd = {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "BreadcrumbList",
          "@id": `${canonical}#breadcrumb`,
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Home", item: absoluteUrl("/") },
            { "@type": "ListItem", position: 2, name: mangaTitle, item: mangaUrl },
            { "@type": "ListItem", position: 3, name: `Chapter ${resolvedParams.chapter}`, item: canonical },
          ],
        },
      ],
    };

    return (
      <>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
        />
        <MangaReaderContainer
          mangaId={resolvedParams.id}
          mangaTitle={mangaTitle}
          mangaCoverUrl={manga.cover_url}
          chapterNumber={resolvedParams.chapter}
          chapters={chapters || []}
          slices={allSlices}
          pageGroups={pageGroups}
          freshness={freshness ?? undefined}
          r2BaseUrl={r2BaseUrl}
          availableLanguages={available_languages || ["en", "es", "fr"]}
          currentLanguage={chapter?.language || "en"}
        />
      </>
    );
  } catch (e) {
    if ((e as { digest?: string })?.digest?.startsWith("NEXT_REDIRECT")) {
      throw e;
    }
    notFound();
  }
}
