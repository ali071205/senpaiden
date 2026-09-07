"use client";

import { useState, useEffect } from "react";
import { Zap, X, Play, CheckCircle2, Lock, Sparkles, ExternalLink } from "lucide-react";
import { unlockChapter } from "@/lib/fastpass";
import { VideoAdUnit } from "@/components/VideoAdUnit";
import { ADSTERRA_SMARTLINK_URL } from "@/lib/monetization";

interface FastPassUnlockModalProps {
  isOpen: boolean;
  onClose: () => void;
  mangaId: string;
  mangaTitle: string;
  mangaCoverUrl?: string;
  chapterNumber: number;
  onUnlocked: () => void;
}

export function FastPassUnlockModal({
  isOpen,
  onClose,
  mangaId,
  mangaTitle,
  mangaCoverUrl,
  chapterNumber,
  onUnlocked,
}: FastPassUnlockModalProps) {
  const [isPlayingAd, setIsPlayingAd] = useState(false);
  const [countdown, setCountdown] = useState(5);
  const [isCompleted, setIsCompleted] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setIsPlayingAd(false);
      setCountdown(5);
      setIsCompleted(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isPlayingAd || countdown <= 0) return;

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          setIsCompleted(true);
          // Unlock chapter
          unlockChapter(mangaId, chapterNumber);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isPlayingAd, countdown, mangaId, chapterNumber]);

  const handleStartAd = () => {
    if (typeof window !== "undefined" && ADSTERRA_SMARTLINK_URL) {
      window.open(ADSTERRA_SMARTLINK_URL, "_blank", "noopener,noreferrer");
    }
    setIsPlayingAd(true);
  };

  const handleContinueReading = () => {
    onUnlocked();
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="FastPass Early Access"
      className="fixed inset-0 z-[160] flex items-center justify-center p-4 bg-black/85 backdrop-blur-xl animate-in fade-in duration-200"
    >
      <div className="relative w-full max-w-lg rounded-3xl border border-yellow-500/20 bg-[#0F1117] p-6 shadow-2xl overflow-hidden flex flex-col text-left">
        {/* Glow */}
        <div className="absolute -top-24 -right-24 w-60 h-60 bg-yellow-500/15 rounded-full blur-3xl pointer-events-none" />

        {/* Close */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-white/5 transition"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-2 mb-4">
          <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-yellow-400/10 border border-yellow-400/20 text-yellow-400 text-xs font-black uppercase tracking-wider">
            <Zap className="w-3.5 h-3.5 fill-yellow-400 text-yellow-400" /> FastPass Early Access
          </span>
        </div>

        {!isPlayingAd && !isCompleted ? (
          <div>
            <h2 className="text-xl md:text-2xl font-black text-white font-rajdhani mb-2">
              Unlock Chapter {chapterNumber} Ahead of Time
            </h2>
            <p className="text-xs text-zinc-400 leading-relaxed mb-6">
              This chapter is in Early Access! You can unlock it instantly for free by watching a quick 5-second sponsor message.
            </p>

            {/* Manga Info Card Preview */}
            <div className="flex items-center gap-4 p-3.5 rounded-2xl bg-white/[0.03] border border-white/5 mb-6">
              {mangaCoverUrl ? (
                <img
                  src={mangaCoverUrl}
                  alt={mangaTitle}
                  className="w-12 h-16 object-cover rounded-xl bg-zinc-800 shrink-0"
                />
              ) : (
                <div className="w-12 h-16 rounded-xl bg-zinc-800 flex items-center justify-center shrink-0">
                  <Lock className="w-5 h-5 text-yellow-400" />
                </div>
              )}
              <div className="min-w-0">
                <h4 className="text-sm font-bold text-white truncate font-rajdhani">{mangaTitle}</h4>
                <p className="text-xs font-semibold text-primary">Chapter {chapterNumber}</p>
                <p className="text-[10px] text-zinc-500 mt-0.5">Instant unlock for this session</p>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col gap-2.5">
              <button
                onClick={handleStartAd}
                className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-yellow-500 to-amber-600 hover:from-yellow-400 hover:to-amber-500 text-black font-black text-sm flex items-center justify-center gap-2 shadow-lg shadow-yellow-500/20 transition active:scale-[0.98]"
              >
                <Play className="w-4 h-4 fill-black" />
                <span>Watch 5s Sponsor to Unlock Free</span>
              </button>

              <button
                onClick={onClose}
                className="w-full py-2.5 rounded-xl text-xs font-semibold text-zinc-500 hover:text-zinc-300 transition"
              >
                Maybe later
              </button>
            </div>
          </div>
        ) : isPlayingAd && !isCompleted ? (
          <div className="flex flex-col items-center text-center py-2">
            <div className="w-full flex items-center justify-between mb-3 text-xs text-zinc-400">
              <span className="flex items-center gap-1.5 font-bold">
                <Sparkles className="w-3.5 h-3.5 text-yellow-400" /> Sponsoring Chapter {chapterNumber}
              </span>
              <span className="font-mono font-bold bg-white/5 px-2.5 py-1 rounded-full border border-white/10 text-yellow-400">
                Unlocking in {countdown}s...
              </span>
            </div>

            {/* Sponsor Video Unit */}
            <div className="w-full my-2">
              <VideoAdUnit title="Partner Sponsor: Exclusive Anime RPG Universe" className="!my-0" />
            </div>

            <p className="text-[11px] text-zinc-500 mt-3">
              Your chapter will automatically unlock once the sponsor countdown finishes.
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center text-center py-4">
            <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mb-4">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-black text-white font-rajdhani mb-1">
              Chapter {chapterNumber} Unlocked!
            </h3>
            <p className="text-xs text-zinc-400 mb-6">
              Thank you for supporting the platform! You can now start reading immediately.
            </p>

            <button
              onClick={handleContinueReading}
              className="w-full py-3.5 rounded-2xl bg-primary hover:bg-red-500 text-white font-black text-sm flex items-center justify-center gap-2 shadow-lg shadow-primary/30 transition active:scale-[0.98]"
            >
              <span>Read Chapter {chapterNumber} Now →</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
