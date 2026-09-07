"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { Play, Bookmark, Star, Sparkles, TrendingUp, ChevronLeft, ChevronRight } from "lucide-react";

export interface HeroMangaItem {
  slug: string;
  title: string;
  altTitle?: string;
  description?: string;
  genres: string[];
  latestChapter: number;
  status: string;
  cover_url?: string;
  views?: string | number;
  rating?: number;
}

interface FeaturedHeroCarouselProps {
  items: HeroMangaItem[];
}

export function FeaturedHeroCarousel({ items }: FeaturedHeroCarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const touchStartX = useRef<number | null>(null);

  const activeManga = items[currentIndex] || items[0];

  // Auto slide every 5.5s
  useEffect(() => {
    if (isPaused || items.length <= 1) return;
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % items.length);
    }, 5500);
    return () => clearInterval(interval);
  }, [isPaused, items.length]);

  const handlePrev = () => {
    setCurrentIndex((prev) => (prev === 0 ? items.length - 1 : prev - 1));
  };

  const handleNext = () => {
    setCurrentIndex((prev) => (prev + 1) % items.length);
  };

  // Mobile Touch Swipe Handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const diff = touchStartX.current - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 35) {
      if (diff > 0) handleNext();
      else handlePrev();
    }
    touchStartX.current = null;
  };

  if (!items.length || !activeManga) return null;

  return (
    <div className="mx-auto max-w-7xl px-4 pt-3 pb-2 md:px-8 md:pt-6 md:pb-4">
      {/* Sleek Landscape Card */}
      <div
        className="relative w-full h-[220px] sm:h-[260px] md:h-[310px] lg:h-[330px] rounded-3xl overflow-hidden border border-white/10 shadow-2xl group select-none"
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {/* Background Landscape Poster with Smooth Transition */}
        {items.map((manga, idx) => (
          <div
            key={manga.slug}
            className={`absolute inset-0 transition-opacity duration-700 ease-in-out ${
              idx === currentIndex ? "opacity-100 z-0" : "opacity-0 pointer-events-none"
            }`}
          >
            {manga.cover_url && (
              <img
                src={manga.cover_url}
                alt={manga.title}
                className="w-full h-full object-cover object-center scale-105 transition-transform duration-1000 group-hover:scale-110"
              />
            )}
            {/* Cinematic Gradient Overlays: Dark from left on desktop, bottom-left on mobile */}
            <div className="absolute inset-0 bg-gradient-to-r from-[#08080C] via-[#08080C]/85 to-transparent sm:w-3/4" />
            <div className="absolute inset-0 bg-gradient-to-t from-[#08080C] via-[#08080C]/60 to-transparent sm:hidden" />
          </div>
        ))}

        {/* Content Overlaid on Landscape Card */}
        <div className="relative z-10 h-full flex flex-col justify-between p-5 sm:p-7 md:p-8 max-w-xl text-left">
          {/* Top Badges */}
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1 rounded-full bg-primary/90 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-white shadow-md shadow-primary/30">
              <Sparkles className="w-3 h-3" /> Featured
            </span>
            <span className="flex items-center gap-1 rounded-full bg-black/60 backdrop-blur-md border border-white/15 px-2.5 py-0.5 text-[10px] font-bold text-amber-400">
              <Star className="w-3 h-3 fill-amber-400" /> 4.9
            </span>
            <span className="text-[10px] font-semibold text-zinc-300 hidden sm:inline-block">
              {activeManga.genres.slice(0, 2).join(" • ")}
            </span>
          </div>

          {/* Title & Description */}
          <div className="my-auto py-1">
            <h2 className="text-xl sm:text-2xl md:text-3xl lg:text-4xl font-black text-white font-rajdhani line-clamp-1 drop-shadow-lg tracking-wide">
              {activeManga.title}
            </h2>
            <p className="mt-1 text-xs text-zinc-300 line-clamp-1 sm:line-clamp-2 max-w-md font-noto opacity-90">
              {activeManga.description || "Discover this top-rated series with weekly releases on Senpai Den."}
            </p>
          </div>

          {/* Bottom Controls: Read Now Button & Slide Dots */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <Link
                href={`/manga/${activeManga.slug}`}
                className="inline-flex items-center gap-1.5 rounded-xl sd-gradient px-4 py-2 text-xs sm:text-sm font-black text-white shadow-lg shadow-primary/30 hover:scale-105 active:scale-95 transition-all"
              >
                <Play className="h-3.5 w-3.5 fill-white" />
                <span>Read Ch. {activeManga.latestChapter}</span>
              </Link>

              <Link
                href={`/manga/${activeManga.slug}`}
                className="hidden sm:inline-flex items-center gap-1 rounded-xl bg-white/10 hover:bg-white/20 border border-white/10 px-3.5 py-2 text-xs font-bold text-white transition-all"
              >
                Details
              </Link>
            </div>

            {/* Minimal Dot Indicators */}
            <div className="flex items-center gap-1.5 bg-black/40 backdrop-blur-md px-2.5 py-1.5 rounded-full border border-white/10">
              {items.map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => setCurrentIndex(idx)}
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    idx === currentIndex ? "w-5 bg-primary" : "w-1.5 bg-white/30 hover:bg-white/60"
                  }`}
                  aria-label={`Slide ${idx + 1}`}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Desktop-Only Subtle Edge Arrows (Hidden on Mobile) */}
        <button
          onClick={handlePrev}
          className="hidden md:flex absolute left-3 top-1/2 -translate-y-1/2 z-20 w-9 h-9 items-center justify-center rounded-full bg-black/40 hover:bg-black/80 text-white backdrop-blur-md border border-white/10 opacity-0 group-hover:opacity-100 transition-all duration-200"
          aria-label="Previous Manga"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <button
          onClick={handleNext}
          className="hidden md:flex absolute right-3 top-1/2 -translate-y-1/2 z-20 w-9 h-9 items-center justify-center rounded-full bg-black/40 hover:bg-black/80 text-white backdrop-blur-md border border-white/10 opacity-0 group-hover:opacity-100 transition-all duration-200"
          aria-label="Next Manga"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}
