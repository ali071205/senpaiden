"use client";

import { useEffect, useId, useRef, useState } from "react";
import { CONSENT_UPDATED_EVENT, getConsent } from "@/lib/consent";
import {
  AD_PLACEMENT_ENABLED,
  ADS_ENABLED,
  ADS_PREVIEW,
  ADSTERRA_DESKTOP_KEY,
  ADSTERRA_MOBILE_KEY,
  ADSTERRA_NATIVE_CONTAINER,
  ADSTERRA_NATIVE_SRC,
  canServeAdsInBrowser,
  type AdPlacement,
} from "@/lib/monetization";
import { hasActivePremium } from "@/lib/reader-progression";

export function AdSlot({
  placement,
  className = "",
  variant = "auto",
}: {
  placement: AdPlacement;
  className?: string;
  variant?: "auto" | "native" | "banner";
}) {
  const [visible, setVisible] = useState(false);
  const [isMobile, setIsMobile] = useState<boolean | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rawId = useId();
  const safeId = rawId.replace(/[^a-zA-Z0-9_-]/g, "");
  const isEnabled = AD_PLACEMENT_ENABLED[placement];

  useEffect(() => {
    const sync = () => {
      const consent = getConsent();
      const isAllowed = Boolean(
        canServeAdsInBrowser() &&
          (ADS_ENABLED || ADS_PREVIEW) &&
          isEnabled &&
          !hasActivePremium() &&
          (consent?.advertising || ADS_PREVIEW)
      );
      setVisible(isAllowed);
    };

    sync();
    window.addEventListener(CONSENT_UPDATED_EVENT, sync);
    window.addEventListener("senpai-premium-updated", sync);
    window.addEventListener("storage", sync);

    return () => {
      window.removeEventListener(CONSENT_UPDATED_EVENT, sync);
      window.removeEventListener("senpai-premium-updated", sync);
      window.removeEventListener("storage", sync);
    };
  }, [isEnabled]);

  // Dynamic debounced window resize handler for viewport-based banner switching
  useEffect(() => {
    if (typeof window === "undefined") return;

    setIsMobile(window.innerWidth < 768);

    let resizeTimer: ReturnType<typeof setTimeout> | null = null;
    const handleResize = () => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        const mobileNow = window.innerWidth < 768;
        setIsMobile((prev) => (prev !== mobileNow ? mobileNow : prev));
      }, 150);
    };

    window.addEventListener("resize", handleResize);
    return () => {
      if (resizeTimer) clearTimeout(resizeTimer);
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  // Ad rendering and DOM lifecycle management
  useEffect(() => {
    if (!visible || !containerRef.current || isMobile === null) return;

    const container = containerRef.current;
    container.innerHTML = ""; // Clear previous content

    if (variant === "native") {
      const nativeContainerId = `${ADSTERRA_NATIVE_CONTAINER}-${safeId}`;
      const nativeDiv = document.createElement("div");
      nativeDiv.id = nativeContainerId;

      const script = document.createElement("script");
      script.async = true;
      script.setAttribute("data-cfasync", "false");
      script.src = ADSTERRA_NATIVE_SRC;

      container.appendChild(script);
      container.appendChild(nativeDiv);
    } else {
      // Responsive Iframe Banner (728x90 on desktop, 320x50 on mobile)
      const adKey = isMobile ? ADSTERRA_MOBILE_KEY : ADSTERRA_DESKTOP_KEY;
      const width = isMobile ? 320 : 728;
      const height = isMobile ? 50 : 90;

      const iframe = document.createElement("iframe");
      iframe.width = width.toString();
      iframe.height = height.toString();
      iframe.setAttribute("frameborder", "0");
      iframe.setAttribute("scrolling", "no");
      iframe.title = `Advertisement ${placement}`;
      iframe.style.border = "none";
      iframe.style.overflow = "hidden";
      iframe.style.display = "block";
      iframe.style.margin = "0 auto";
      iframe.style.maxWidth = "100%";

      container.appendChild(iframe);

      try {
        const doc = iframe.contentWindow?.document || iframe.contentDocument;
        if (doc) {
          doc.open();
          doc.write(`
            <!DOCTYPE html>
            <html>
              <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <style>
                  body {
                    margin: 0;
                    padding: 0;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    background: transparent;
                    overflow: hidden;
                  }
                </style>
              </head>
              <body>
                <script type="text/javascript">
                  atOptions = {
                    'key' : '${adKey}',
                    'format' : 'iframe',
                    'height' : ${height},
                    'width' : ${width},
                    'params' : {}
                  };
                </script>
                <script type="text/javascript" src="//www.highperformanceformat.com/${adKey}/invoke.js"></script>
              </body>
            </html>
          `);
          doc.close();
        }
      } catch (err) {
        console.warn("AdSlot iframe injection error:", err);
      }
    }

    return () => {
      if (containerRef.current) {
        containerRef.current.innerHTML = "";
      }
    };
  }, [visible, variant, isMobile, placement, safeId]);

  if (!visible) return null;

  return (
    <aside
      className={`mx-auto my-4 w-full max-w-4xl overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0E1422]/60 p-2.5 text-center shadow-lg transition-all min-h-[74px] md:min-h-[114px] flex flex-col justify-center items-center ${className}`}
      aria-label="Advertisement"
    >
      <p className="mb-1.5 text-center text-[9px] font-bold uppercase tracking-[0.2em] text-zinc-400 select-none">
        Advertisement
      </p>
      <div
        ref={containerRef}
        className="flex min-h-[50px] md:min-h-[90px] w-full items-center justify-center overflow-hidden"
      />
    </aside>
  );
}


