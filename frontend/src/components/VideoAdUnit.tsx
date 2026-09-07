"use client";

import { useState, useRef, useEffect } from "react";
import { Play, Pause, Volume2, VolumeX, Sparkles, ExternalLink } from "lucide-react";
import { ADS_ENABLED, canServeAdsInBrowser, ADSTERRA_SMARTLINK_URL } from "@/lib/monetization";
import { getConsent } from "@/lib/consent";

interface VideoAdUnitProps {
  title?: string;
  sponsorName?: string;
  sponsorUrl?: string;
  videoSrc?: string;
  posterSrc?: string;
  className?: string;
}

export function VideoAdUnit({
  title = "Discover Next-Gen Anime Gaming",
  sponsorName = "Epic Anime Universe",
  sponsorUrl = ADSTERRA_SMARTLINK_URL || "https://senpaiden.vercel.app",
  posterSrc = "https://images.unsplash.com/photo-1578632767115-351597cf2477?w=800&auto=format&fit=crop&q=80",
  className = "",
}: VideoAdUnitProps) {
  const [visible, setVisible] = useState(false);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(true);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const isAllowed = Boolean(
      canServeAdsInBrowser() &&
      ADS_ENABLED &&
      getConsent()?.advertising
    );
    setVisible(isAllowed);
  }, []);

  // Simulate video playback progress for interactive presentation
  useEffect(() => {
    if (!isPlaying || !visible) return;
    const interval = setInterval(() => {
      setProgress((prev) => (prev >= 100 ? 0 : prev + 2));
    }, 400);
    return () => clearInterval(interval);
  }, [isPlaying, visible]);

  if (!visible) return null;

  return (
    <div
      className={`mx-auto my-6 w-full max-w-4xl overflow-hidden rounded-3xl border border-white/10 bg-[#0F1117] shadow-2xl ${className}`}
      aria-label="Video Advertisement"
    >
      {/* Header bar */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-white/5 bg-white/[0.02]">
        <div className="flex items-center gap-2">
          <span className="flex h-6 items-center gap-1.5 rounded-lg bg-yellow-400/10 px-2 text-[10px] font-black uppercase tracking-wider text-yellow-400 border border-yellow-400/20">
            <Sparkles className="h-3 w-3" /> Video Sponsor
          </span>
          <span className="text-xs font-semibold text-zinc-400">{sponsorName}</span>
        </div>

        <span className="text-[10px] font-mono text-zinc-500">Sponsored HD</span>
      </div>

      {/* Video Content Canvas */}
      <div className="relative aspect-video w-full overflow-hidden bg-black flex items-center justify-center group">
        <img
          src={posterSrc}
          alt={title}
          className="h-full w-full object-cover opacity-85 transition duration-500 group-hover:scale-105"
        />

        {/* Ambient Gradient Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent pointer-events-none" />

        {/* Floating Play / Pause & Mute controls */}
        <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between z-10">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsPlaying(!isPlaying)}
              className="p-2 rounded-xl bg-black/60 hover:bg-black/80 text-white backdrop-blur-md transition border border-white/10"
              title={isPlaying ? "Pause Video" : "Play Video"}
            >
              {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            </button>
            <button
              onClick={() => setIsMuted(!isMuted)}
              className="p-2 rounded-xl bg-black/60 hover:bg-black/80 text-white backdrop-blur-md transition border border-white/10"
              title={isMuted ? "Unmute" : "Mute"}
            >
              {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </button>
          </div>

          <a
            href={sponsorUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary hover:bg-red-500 text-xs font-black text-white shadow-lg shadow-primary/30 transition active:scale-95"
          >
            <span>Learn More</span>
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>

        {/* Progress Bar */}
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/20">
          <div
            className="h-full bg-primary transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Footer Info */}
      <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white/[0.01]">
        <div>
          <h4 className="text-sm font-bold text-white font-rajdhani">{title}</h4>
          <p className="text-xs text-zinc-400 mt-0.5">Interactive sponsor media — tap to explore partner rewards.</p>
        </div>
        <a
          href={sponsorUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline shrink-0"
        >
          Visit Partner <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    </div>
  );
}
