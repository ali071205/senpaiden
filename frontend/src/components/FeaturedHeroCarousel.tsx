"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { Play, Star, Sparkles, ChevronLeft, ChevronRight, Eye, Loader2 } from "lucide-react";
import { formatViews } from "@/lib/manga-data";
import { triggerStartLoading } from "@/components/TopProgressBar";

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
  const [openingChapter, setOpeningChapter] = useState<string | null>(null);
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
        className="relative w-full h-[240px] sm:h-[280px] md:h-[310px] lg:h-[330px] rounded-3xl overflow-hidden border border-white/10 bg-[#08090E] shadow-2xl group select-none"
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {/* Background Artwork Showcase with Smooth Transition */}
        {items.map((manga, idx) => {
          const isActive = idx === currentIndex;
          return (
            <div
              key={manga.slug}
              className={`absolute inset-0 transition-opacity duration-500 ease-in-out ${
                isActive ? "opacity-100 z-0" : "opacity-0 pointer-events-none"
              }`}
            >
              {manga.cover_url && (
                <>
                  {/* Subtle Ambient Glow */}
                  <div
                    className="absolute inset-0 bg-cover bg-center filter blur-3xl opacity-20 scale-125 pointer-events-none"
                    style={{ backgroundImage: `url(${manga.cover_url})` }}
                  />

                  {/* Sharp Right-Aligned Character Artwork */}
                  <div className="absolute right-0 top-0 bottom-0 w-full sm:w-[60%] md:w-[50%] lg:w-[48%] h-full overflow-hidden pointer-events-none">
                    <img
                      src={manga.cover_url}
                      alt={manga.title}
                      className="w-full h-full object-cover object-[center_15%] transition-transform duration-1000 group-hover:scale-105"
                    />
                    {/* Gradient blending the artwork seamlessly into the dark background */}
                    <div className="absolute inset-0 bg-gradient-to-r from-[#08090E] via-[#08090E]/80 via-25% to-transparent" />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#08090E] via-transparent to-transparent sm:hidden" />
                  </div>
                </>
              )}

              {/* Solid left-side text backing gradient to guarantee 100% readability */}
              <div className="absolute inset-y-0 left-0 w-full sm:w-2/3 bg-gradient-to-r from-[#08090E] via-[#08090E]/95 to-transparent z-[1] pointer-events-none" />
            </div>
          );
        })}

        {/* Content Overlaid on Landscape Card */}
        <div className="relative z-10 h-full flex flex-col justify-between p-5 sm:p-7 md:p-8 max-w-lg lg:max-w-xl text-left">
          {/* Top Badges */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="flex items-center gap-1 rounded-full bg-primary/90 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-white shadow-md shadow-primary/30">
              <Sparkles className="w-3 h-3" /> Top Rated
            </span>
            {activeManga.views !== undefined && (
              <span className="flex items-center gap-1 rounded-full bg-black/60 backdrop-blur-md border border-white/15 px-2.5 py-0.5 text-[10px] font-bold text-cyan-300">
                <Eye className="w-3 h-3 text-cyan-300" /> {formatViews(activeManga.views)} Views
              </span>
            )}
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
            <p className="mt-1.5 text-xs sm:text-sm text-zinc-300 line-clamp-2 max-w-md font-noto leading-relaxed opacity-90 drop-shadow-sm">
              {activeManga.description || "Discover this top-rated series with weekly releases on Senpai Den."}
            </p>
          </div>

          {/* Bottom Controls: Read Now Button & Slide Controls */}
          <div className="flex items-center justify-between gap-3 pt-2">
            <div className="flex items-center gap-2.5">
              <Link
                href={`/manga/${activeManga.slug}/${activeManga.latestChapter || 1}`}
                prefetch={false}
                onClick={() => {
                  setOpeningChapter(activeManga.slug);
                  triggerStartLoading();
                }}
                className={`inline-flex items-center gap-1.5 rounded-xl sd-gradient px-4 py-2 text-xs sm:text-sm font-black text-white shadow-lg shadow-primary/30 hover:scale-105 active:scale-95 transition-all ${
                  openingChapter === activeManga.slug ? "brightness-90 animate-pulse" : ""
                }`}
              >
                {openingChapter === activeManga.slug ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Loading Ch. {activeManga.latestChapter}...</span>
                  </>
                ) : (
                  <>
                    <Play className="h-3.5 w-3.5 fill-white" />
                    <span>Read Ch. {activeManga.latestChapter}</span>
                  </>
                )}
              </Link>

              <Link
                href={`/manga/${activeManga.slug}`}
                prefetch={false}
                className="hidden sm:inline-flex items-center gap-1 rounded-xl bg-white/10 hover:bg-white/20 border border-white/10 px-3.5 py-2 text-xs font-bold text-white transition-all"
              >
                Details
              </Link>
            </div>

            {/* Clean Slide Controls: Prev + Dots + Next (No Overlap with text!) */}
            <div className="flex items-center gap-1.5 bg-black/60 backdrop-blur-md px-2 py-1 rounded-full border border-white/10">
              <button
                onClick={handlePrev}
                className="w-6 h-6 rounded-full flex items-center justify-center text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
                aria-label="Previous Slide"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>

              <div className="flex items-center gap-1.5 px-1">
                {items.map((_, idx) => (
                  <button
                    key={idx}
                    onClick={() => setCurrentIndex(idx)}
                    className={`h-1.5 rounded-full transition-all duration-300 ${
                      idx === currentIndex ? "w-5 bg-primary shadow-sm shadow-primary/50" : "w-1.5 bg-white/30 hover:bg-white/60"
                    }`}
                    aria-label={`Slide ${idx + 1}`}
                  />
                ))}
              </div>

              <button
                onClick={handleNext}
                className="w-6 h-6 rounded-full flex items-center justify-center text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
                aria-label="Next Slide"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
