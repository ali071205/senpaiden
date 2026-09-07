"use client";

import { useEffect, useState } from "react";
import { X, Sparkles } from "lucide-react";
import { AdSlot } from "@/components/AdSlot";
import { ADS_ENABLED, canServeAdsInBrowser } from "@/lib/monetization";
import { getConsent } from "@/lib/consent";

interface InterstitialAdModalProps {
  storageKey?: string;
  title?: string;
  durationSeconds?: number;
}

export function InterstitialAdModal({
  storageKey = "senpai_interstitial_seen",
  title = "Sponsored Partner",
  durationSeconds = 5,
}: InterstitialAdModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [countdown, setCountdown] = useState(durationSeconds);
  const [canClose, setCanClose] = useState(false);

  useEffect(() => {
    // Check if ads allowed and not seen in this session
    if (!canServeAdsInBrowser() || !ADS_ENABLED) return;
    const consent = getConsent();
    if (!consent?.advertising) return;

    try {
      const alreadySeen = sessionStorage.getItem(storageKey);
      if (alreadySeen) return;

      // Mark as seen in this session
      sessionStorage.setItem(storageKey, "true");
      setIsOpen(true);
    } catch {}
  }, [storageKey]);

  useEffect(() => {
    if (!isOpen) return;

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          setCanClose(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      window.dispatchEvent(new CustomEvent("senpai_interstitial_state", { detail: { isOpen: true } }));
    }
    return () => {
      window.dispatchEvent(new CustomEvent("senpai_interstitial_state", { detail: { isOpen: false } }));
    };
  }, [isOpen]);

  const handleClose = () => {
    setIsOpen(false);
    window.dispatchEvent(new CustomEvent("senpai_interstitial_state", { detail: { isOpen: false } }));
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Advertisement"
      className="fixed inset-0 z-[150] flex flex-col items-center justify-center p-4 bg-black/90 backdrop-blur-xl animate-in fade-in duration-300"
    >
      <div className="relative w-full max-w-2xl rounded-3xl border border-white/10 bg-[#0F1117] p-6 shadow-2xl overflow-hidden flex flex-col items-center text-center">
        {/* Ambient background glow */}
        <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-64 h-64 bg-primary/20 rounded-full blur-3xl pointer-events-none" />

        {/* Top Controls Bar */}
        <div className="w-full flex items-center justify-between mb-4 pb-3 border-b border-white/5 relative z-10">
          <span className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-zinc-400">
            <Sparkles className="w-3.5 h-3.5 text-yellow-400" />
            {title}
          </span>

          <div className="flex items-center gap-3">
            {countdown > 0 ? (
              <span className="text-xs font-mono font-bold text-zinc-400 bg-white/5 px-2.5 py-1 rounded-full border border-white/10">
                Ad closes in {countdown}s
              </span>
            ) : (
              <span className="text-xs font-bold text-emerald-400">
                Ready to skip
              </span>
            )}

            <button
              onClick={handleClose}
              className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-all active:scale-95 border border-white/10"
              title="Close Ad"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Big Ad Unit Container */}
        <div className="w-full my-4 flex items-center justify-center min-h-[200px] relative z-10">
          <AdSlot placement="home-feed" className="!my-0 !max-w-xl" />
        </div>

        {/* Bottom CTA / Continue Button */}
        <div className="mt-4 pt-4 border-t border-white/5 w-full flex items-center justify-center relative z-10">
          <button
            onClick={handleClose}
            className={`px-8 py-2.5 rounded-xl text-xs font-black transition-all shadow-lg ${
              canClose
                ? "bg-primary text-white hover:scale-105 shadow-primary/30"
                : "bg-white/10 text-zinc-400 hover:bg-white/15"
            }`}
          >
            {canClose ? "Continue to SenpaiDen →" : `Continue in ${countdown}s...`}
          </button>
        </div>
      </div>
    </div>
  );
}
