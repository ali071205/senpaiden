"use client";

import { useState, useEffect } from "react";
import { ChevronDown, ChevronUp, Sparkles, X } from "lucide-react";
import { AdSlot } from "@/components/AdSlot";
import { ADS_ENABLED, canServeAdsInBrowser } from "@/lib/monetization";
import { getConsent } from "@/lib/consent";
import { usePathname } from "next/navigation";

export function StickyAnchorAd() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [closed, setClosed] = useState(false);
  const [visible, setVisible] = useState(false);
  const [interstitialOpen, setInterstitialOpen] = useState(false);

  // Check if we are in reader mode
  const isReader = pathname?.startsWith("/read/") || (pathname?.startsWith("/manga/") && pathname?.split("/").length > 3);

  useEffect(() => {
    const handleInterstitialState = (e: Event) => {
      const customEvent = e as CustomEvent<{ isOpen: boolean }>;
      setInterstitialOpen(Boolean(customEvent.detail?.isOpen));
    };

    window.addEventListener("senpai_interstitial_state", handleInterstitialState);
    return () => window.removeEventListener("senpai_interstitial_state", handleInterstitialState);
  }, []);

  useEffect(() => {
    if (isReader) {
      setVisible(false);
      return;
    }

    const isAllowed = Boolean(
      canServeAdsInBrowser() &&
      ADS_ENABLED &&
      getConsent()?.advertising
    );
    setVisible(isAllowed);
  }, [pathname, isReader]);

  if (!visible || closed || isReader || interstitialOpen) return null;

  return (
    <div
      className={`fixed z-40 transition-all duration-300 left-0 right-0 md:left-[260px] md:right-0 w-full md:w-auto md:max-w-3xl md:mx-auto px-3 ${
        collapsed ? "bottom-16 md:bottom-2" : "bottom-16 md:bottom-2"
      }`}
    >
      <div className="mx-auto rounded-2xl border border-white/10 bg-[#0F1117]/95 shadow-[0_-8px_30px_rgba(0,0,0,0.7)] backdrop-blur-xl p-2 relative overflow-hidden">
        {/* Top Header Bar */}
        <div className="flex items-center justify-between px-2 pb-1 text-[9px] font-black uppercase tracking-[0.2em] text-zinc-500">
          <span className="flex items-center gap-1">
            <Sparkles className="h-2.5 w-2.5 text-yellow-400" />
            Sponsored
          </span>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setCollapsed(!collapsed)}
              className="flex items-center gap-1 text-[9px] font-bold text-zinc-400 hover:text-white px-2 py-0.5 rounded-lg bg-white/5 border border-white/5 transition"
            >
              {collapsed ? (
                <>
                  <span>Show Ad</span>
                  <ChevronUp className="h-3 w-3" />
                </>
              ) : (
                <>
                  <span>Minimize</span>
                  <ChevronDown className="h-3 w-3" />
                </>
              )}
            </button>
            <button
              onClick={() => setClosed(true)}
              className="text-zinc-500 hover:text-white transition p-0.5"
              title="Close anchor ad"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Ad Container */}
        {!collapsed && (
          <div className="pt-1 flex items-center justify-center min-h-[50px] md:min-h-[90px]">
            <AdSlot placement="home-feed" className="!my-0 !border-0 !bg-transparent !p-0 !shadow-none" />
          </div>
        )}
      </div>
    </div>
  );
}
