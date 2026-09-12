"use client";

import { useEffect, useState, useRef, useCallback, Suspense } from "react";
import { usePathname, useSearchParams } from "next/navigation";

export const START_LOADING_EVENT = "senpaiden:start-loading";
export const STOP_LOADING_EVENT = "senpaiden:stop-loading";

export function triggerStartLoading() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(START_LOADING_EVENT));
  }
}

export function triggerStopLoading() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(STOP_LOADING_EVENT));
  }
}

function ProgressBarInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [visible, setVisible] = useState(false);
  const [progress, setProgress] = useState(0);

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const finishTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isNavigatingRef = useRef(false);

  const clearAllTimers = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (finishTimeoutRef.current) clearTimeout(finishTimeoutRef.current);
  };

  const startProgress = useCallback(() => {
    clearAllTimers();
    isNavigatingRef.current = true;
    setVisible(true);
    setProgress(15);

    // Progressive trickle to reassure user while waiting for CDN or server
    timerRef.current = setInterval(() => {
      setProgress((prev) => {
        if (prev < 40) return prev + 12;
        if (prev < 70) return prev + 6;
        if (prev < 88) return prev + 2;
        if (prev < 95) return prev + 0.5;
        return prev;
      });
    }, 180);
  }, []);

  const finishProgress = useCallback(() => {
    clearAllTimers();
    if (!isNavigatingRef.current && progress === 0) return;

    setProgress(100);
    finishTimeoutRef.current = setTimeout(() => {
      setVisible(false);
      finishTimeoutRef.current = setTimeout(() => {
        setProgress(0);
        isNavigatingRef.current = false;
      }, 300);
    }, 250);
  }, [progress]);

  // Complete progress whenever route path or query changes
  useEffect(() => {
    if (isNavigatingRef.current) {
      finishProgress();
    }
  }, [pathname, searchParams, finishProgress]);

  // Listen to programmatic events and intercept user link clicks immediately
  useEffect(() => {
    const handleStart = () => startProgress();
    const handleStop = () => finishProgress();

    window.addEventListener(START_LOADING_EVENT, handleStart);
    window.addEventListener(STOP_LOADING_EVENT, handleStop);

    const handleDocumentClick = (e: MouseEvent) => {
      const target = (e.target as HTMLElement)?.closest("a");
      if (!target) return;

      const href = target.getAttribute("href");
      if (!href) return;

      // Ignore external links, anchor hashes, new tab targets, and modifier clicks
      if (
        href.startsWith("http://") ||
        href.startsWith("https://") ||
        href.startsWith("mailto:") ||
        href.startsWith("tel:") ||
        href.startsWith("#") ||
        target.target === "_blank" ||
        e.ctrlKey ||
        e.metaKey ||
        e.shiftKey ||
        e.altKey
      ) {
        return;
      }

      // Check if clicking same path + query
      const currentUrl = window.location.pathname + window.location.search;
      if (href === currentUrl) return;

      startProgress();
    };

    document.addEventListener("click", handleDocumentClick, { capture: true });

    return () => {
      window.removeEventListener(START_LOADING_EVENT, handleStart);
      window.removeEventListener(STOP_LOADING_EVENT, handleStop);
      document.removeEventListener("click", handleDocumentClick, { capture: true });
      clearAllTimers();
    };
  }, [startProgress, finishProgress]);

  if (!visible && progress === 0) return null;

  return (
    <div
      className="fixed top-0 left-0 right-0 z-[99999] pointer-events-none transition-opacity duration-300"
      style={{ opacity: visible ? 1 : 0 }}
      aria-hidden="true"
    >
      {/* Primary Loading Bar */}
      <div
        className="h-[3px] bg-gradient-to-r from-red-600 via-rose-500 to-amber-400 relative shadow-[0_0_12px_rgba(255,46,46,0.8)]"
        style={{
          width: `${progress}%`,
          transition: progress === 100 ? "width 200ms ease-out" : "width 250ms cubic-bezier(0.1, 0.9, 0.2, 1)",
        }}
      >
        {/* Leading Glow Head Dot */}
        <div className="absolute top-1/2 right-0 -translate-y-1/2 w-4 h-4 rounded-full bg-amber-300 blur-[2px] shadow-[0_0_12px_#FFD700,0_0_20px_#FF2E2E]" />

        {/* Shimmer Light Pulse */}
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent animate-pulse" />
      </div>
    </div>
  );
}

export function TopProgressBar() {
  return (
    <Suspense fallback={null}>
      <ProgressBarInner />
    </Suspense>
  );
}
