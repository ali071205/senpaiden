import { ChevronLeft, BookOpen, Sparkles, Loader2 } from "lucide-react";

export default function ChapterLoading() {
  return (
    <div className="relative min-h-screen w-full bg-[#090A0F] text-white flex flex-col overflow-hidden select-none">
      {/* Ambient Top Glow */}
      <div className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 w-[600px] h-[400px] rounded-full bg-red-600/10 blur-[120px]" />

      {/* Top Reader HUD Skeleton */}
      <header className="sticky top-0 left-0 right-0 z-40 h-14 sm:h-16 bg-[#0F1117]/90 backdrop-blur-xl border-b border-white/5 px-3 sm:px-6 flex items-center justify-between">
        <div className="flex items-center gap-2.5 sm:gap-3 flex-1 min-w-0">
          <div className="p-2 rounded-xl bg-white/5 border border-white/10 text-zinc-500">
            <ChevronLeft className="w-5 h-5 opacity-40" />
          </div>
          <div className="flex flex-col gap-1.5 flex-1 min-w-0">
            <div className="h-3.5 w-32 sm:w-48 bg-white/15 rounded-md animate-pulse" />
            <div className="h-2.5 w-20 bg-white/10 rounded-md animate-pulse" />
          </div>
        </div>

        {/* Reader Mode Skeletons */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="hidden sm:flex items-center gap-1 bg-white/5 p-1 rounded-xl border border-white/10">
            <div className="h-6 w-16 bg-white/10 rounded-lg animate-pulse" />
            <div className="h-6 w-14 bg-white/5 rounded-lg animate-pulse" />
          </div>
          <div className="h-8 w-8 rounded-lg bg-white/5 border border-white/10 animate-pulse" />
        </div>
      </header>

      {/* Main Chapter Loading Stage */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-12 relative z-10">
        <div className="w-full max-w-md flex flex-col items-center text-center">
          {/* Animated Glowing Manga Book Badge */}
          <div className="relative mb-6">
            <div className="absolute inset-0 rounded-3xl bg-red-600/30 blur-2xl animate-pulse" />
            <div className="relative w-20 h-20 rounded-3xl bg-gradient-to-b from-[#1c1d27] to-[#12131b] border border-red-500/30 flex items-center justify-center shadow-[0_0_40px_rgba(255,46,46,0.35)]">
              <BookOpen className="w-9 h-9 text-red-500 animate-bounce" style={{ animationDuration: "1.8s" }} />
              <Sparkles className="w-4 h-4 text-amber-400 absolute top-2 right-2 animate-spin" style={{ animationDuration: "3s" }} />
            </div>
          </div>

          {/* Animated Loading Text */}
          <div className="flex items-center gap-2 mb-2">
            <span className="inline-block w-2 h-2 rounded-full bg-red-500 animate-ping" />
            <h2 className="text-xl sm:text-2xl font-black font-rajdhani tracking-wide text-white">
              Loading Chapter...
            </h2>
          </div>

          <p className="text-xs sm:text-sm text-zinc-400 max-w-sm leading-relaxed mb-6">
            Connecting to CDN & streaming high-resolution pages for smooth reading.
          </p>

          {/* Animated Gradient Progress Bar */}
          <div className="w-64 sm:w-80 h-2 bg-white/10 rounded-full overflow-hidden relative mb-4 shadow-inner">
            <div className="absolute inset-0 bg-gradient-to-r from-red-600 via-rose-500 to-amber-400 rounded-full animate-pulse shadow-[0_0_12px_rgba(255,46,46,0.8)]" />
          </div>

          {/* Status Badges */}
          <div className="flex items-center gap-2 flex-wrap justify-center text-[11px] text-zinc-500 font-medium">
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/5 border border-white/10">
              <Loader2 className="w-3 h-3 animate-spin text-red-400" />
              <span>Streaming CDN Slices</span>
            </span>
            <span className="px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-zinc-400">
              Auto-Retry Active
            </span>
          </div>


        </div>
      </main>
    </div>
  );
}
