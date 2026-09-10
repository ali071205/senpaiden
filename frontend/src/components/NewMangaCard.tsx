"use client";
import { useState } from "react";
import Link from "next/link";
import { Bookmark, Star } from "lucide-react";

export function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-1">
      <Star size={11} className="fill-yellow-400 text-yellow-400" />
      <span className="text-yellow-400 text-[11px] font-bold font-jetbrains">{rating.toFixed(1)}</span>
    </div>
  );
}

export function NewMangaCard({ manga, idx }: { manga: any; idx?: number }) {
  const [saved, setSaved] = useState(false);
  
  // Generate random color for genre badge if not provided
  const colors = ["#FF2E2E", "#7C3AED", "#06B6D4", "#F59E0B", "#10B981"];
  const color = colors[(idx || 0) % colors.length];

  return (
    <Link href={`/manga/${manga.slug || manga.id}`}
      prefetch={false}
      className="flex-shrink-0 rounded-2xl overflow-hidden group cursor-pointer transition-all duration-300 hover:-translate-y-1.5 hover:shadow-2xl flex flex-col h-full bg-[#161B22] border border-white/5"
    >
      <div className="relative overflow-hidden bg-[#0a0d12] aspect-[3/4]">
        <img src={manga.cover_url || manga.cover} alt={manga.title}
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110 opacity-90" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#161B22] via-[#161B22]/30 to-transparent" />
        
        {manga.isNew && (
          <div className="absolute top-2 left-2 px-2 py-0.5 rounded-md text-[9px] font-black uppercase bg-[#FF2E2E] text-white shadow-[0_0_10px_rgba(255,46,46,0.6)]">
            NEW
          </div>
        )}
        
        <button onClick={(e) => { e.preventDefault(); setSaved((s) => !s); }}
          className="absolute top-2 right-2 w-7 h-7 rounded-lg flex items-center justify-center transition-all bg-[#0F1117]/75 backdrop-blur-md">
          <Bookmark size={13} className={saved ? "fill-red-500 text-red-500" : "text-white"} />
        </button>
        
        <div className="absolute bottom-2 left-2 flex gap-1 flex-wrap max-w-[70%]">
          {manga.genres && manga.genres[0] && (
            <span className="px-2 py-0.5 rounded text-[9px] font-bold uppercase"
              style={{ background: `${color}22`, color: color, border: `1px solid ${color}44` }}>
              {manga.genres[0]}
            </span>
          )}
        </div>
        <div className="absolute bottom-2 right-2">
          <StarRating rating={manga.rating || 4.8} />
        </div>
      </div>
      <div className="p-3 flex flex-col flex-grow">
        <div className="font-bold text-[13px] text-white mb-0.5 line-clamp-1 font-rajdhani" title={manga.title}>
          {manga.title}
        </div>
        <div className="text-[10px] text-muted-foreground mb-3 font-jetbrains line-clamp-1">
          Ch. {manga.latest_chapter_number || manga.latestChapter || '?'} · {manga.type || 'Manga'}
        </div>
        <div className="mt-auto w-full py-2 rounded-xl text-[10px] font-bold tracking-wider uppercase text-center transition-all bg-red-500/10 border border-red-500/25 text-[#FF2E2E] group-hover:bg-[#FF2E2E] group-hover:text-white">
          Read Now
        </div>
      </div>
    </Link>
  );
}
