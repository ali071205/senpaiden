"use client";

import { useState } from "react";
import Link from "next/link";
import { coverGradient, formatViews, type Manga } from "@/lib/manga-data";
import { isMatureManga } from "@/lib/age-restriction";
import { Eye } from "lucide-react";

interface Props {
  manga: Manga;
  showChapter?: boolean;
  rank?: number;
  className?: string;
}

export function MangaCard({ manga, showChapter, rank, className = "" }: Props) {
  const [imgError, setImgError] = useState(false);
  const displayRank = rank ?? manga.rank;

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
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" 
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

        {/* Rank Badge */}
        {displayRank !== undefined && displayRank > 0 && (
          <div
            className={`absolute left-2 top-2 z-10 flex items-center justify-center rounded-lg px-2 py-0.5 text-[10px] font-black uppercase tracking-wider shadow-lg ${
              displayRank === 1
                ? "bg-gradient-to-r from-yellow-400 to-amber-500 text-black shadow-amber-500/40"
                : displayRank === 2
                ? "bg-gradient-to-r from-slate-200 to-zinc-400 text-black shadow-slate-400/40"
                : displayRank === 3
                ? "bg-gradient-to-r from-amber-700 to-amber-600 text-white shadow-amber-700/40"
                : "bg-black/75 backdrop-blur-md text-zinc-200 border border-white/15"
            }`}
          >
            #{displayRank}
          </div>
        )}

        {/* Custom Tag if no Rank */}
        {(!displayRank || displayRank <= 0) && manga.tag && (
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
          <div className="mt-1 flex items-center justify-between text-[10px]">
            {showChapter && (
              <span className="font-semibold text-[#22D3EE] truncate max-w-[55%]">Ch. {manga.latestChapter}</span>
            )}
            {manga.views !== undefined && manga.views > 0 ? (
              <span className="inline-flex items-center gap-1 font-bold text-zinc-300 ml-auto shrink-0" title={`${manga.views.toLocaleString()} views`}>
                <Eye size={11} className="text-zinc-400" />
                {formatViews(manga.views)}
              </span>
            ) : (
              <span className="text-[#71717A] ml-auto shrink-0">{manga.status}</span>
            )}
          </div>
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
