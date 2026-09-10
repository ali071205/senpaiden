"use client";

import { useState } from "react";
import Link from "next/link";
import { coverGradient, type Manga } from "@/lib/manga-data";
import { isMatureManga } from "@/lib/age-restriction";

interface Props {
  manga: Manga;
  showChapter?: boolean;
  className?: string;
}

export function MangaCard({ manga, showChapter, className = "" }: Props) {
  const [imgError, setImgError] = useState(false);

  return (
    <Link
      href={`/manga/${manga.slug}`}
      prefetch={false}
      className={`group relative block overflow-hidden rounded-xl border border-white/5 bg-[#101016] transition-all duration-300 hover:border-[#8B5CF6]/40 hover:-translate-y-0.5 hover:shadow-[0_10px_30px_-10px_rgba(139,92,246,0.5)] ${className}`}
    >
      <div
        className="relative aspect-[2/3] w-full overflow-hidden"
        style={{ background: coverGradient(manga) }}
      >
        {/* Procedural cover fallback or Real Image */}
        {manga.cover_url && !imgError ? (
          <img 
            src={manga.cover_url} 
            alt={manga.title} 
            className="absolute inset-0 h-full w-full object-cover" 
            loading="lazy" 
            referrerPolicy="no-referrer"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="absolute inset-0 opacity-60 mix-blend-screen"
            style={{
              backgroundImage:
                `radial-gradient(80% 60% at 30% 20%, oklch(0.65 0.22 ${manga.coverHue}) 0%, transparent 60%),` +
                `radial-gradient(60% 60% at 80% 90%, oklch(0.55 0.2 ${manga.coverHue2}) 0%, transparent 60%)`,
            }}
          />
        )}
        <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/95 via-black/60 to-transparent" />

        {manga.tag && (
          <div className="absolute left-2 top-2 rounded-md sd-gradient px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white shadow-lg">
            {manga.tag}
          </div>
        )}

        {isMatureManga(manga.genres) && (
          <div className="absolute right-2 top-2 rounded-md bg-red-600/90 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-white shadow-lg border border-red-400/30">
            18+
          </div>
        )}

        <div className="absolute inset-x-0 bottom-0 p-2.5">
          <div className="line-clamp-2 text-[13px] font-semibold leading-tight text-white drop-shadow">
            {manga.title}
          </div>
          {showChapter && (
            <div className="mt-1 flex items-center justify-between text-[10px] text-[#22D3EE]">
              <span>Ch. {manga.latestChapter}</span>
              <span className="text-[#71717A]">{manga.status}</span>
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}

export function MangaCardSkeleton() {
  return (
    <div className="aspect-[2/3] w-full rounded-xl sd-shimmer" />
  );
}
