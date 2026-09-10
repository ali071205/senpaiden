"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Loader2, RefreshCw } from "lucide-react";
import { Blurhash } from "react-blurhash";

export type PageFitMode = "fit-width" | "fit-height" | "original";

interface ReaderImageProps {
  src: string;
  width: number;
  height: number;
  priority?: boolean;
  blurhash?: string;
  containerClassName?: string;
  pageFit?: PageFitMode;
  align?: "left" | "center" | "right";
}

export function ReaderImage({ src, width, height, priority = false, blurhash, containerClassName, pageFit = "fit-width", align = "center" }: ReaderImageProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  const handleRetry = () => {
    setIsLoaded(false);
    setHasError(false);
    setRetryKey((prev) => prev + 1);
  };

  const imageSrc = retryKey > 0 ? `${src}?retry=${retryKey}` : src;

  const getAlignClass = () => {
    if (align === "left") return "mr-auto ml-0";
    if (align === "right") return "ml-auto mr-0";
    return "mx-auto";
  };

  const getFitImageClass = () => {
    const alignClass = getAlignClass();
    if (pageFit === "fit-height") {
      // 144px accounts for pt-16 (64px) header and pb-20 (80px) footer to perfectly fit without scrollbars
      return `max-h-[calc(100dvh-144px)] w-auto max-w-full ${alignClass} object-contain block my-0 p-0 border-0 align-bottom`;
    }
    if (pageFit === "original") {
      return `w-auto max-w-full h-auto ${alignClass} block my-0 p-0 border-0 align-bottom`;
    }
    return `w-full max-w-full h-auto ${alignClass} block my-0 p-0 border-0 align-bottom`;
  };

  const getContainerFitClass = () => {
    let justifyClass = "justify-center";
    if (align === "left") justifyClass = "justify-start";
    if (align === "right") justifyClass = "justify-end";

    if (pageFit === "fit-height") {
      return `max-w-none w-auto flex items-center ${justifyClass}`;
    }
    if (pageFit === "original") {
      return `w-full max-w-full flex ${justifyClass}`;
    }
    return containerClassName || `max-w-[800px] w-full flex ${justifyClass}`;
  };

  return (
    <div 
      className={cn("relative w-full mx-auto bg-black leading-none select-none my-0 p-0 border-0 flex justify-center items-center", getContainerFitClass())}
      style={{
        ...(!isLoaded ? { aspectRatio: `${width} / ${height}` } : {}),
        marginLeft: align === "left" ? "0" : align === "right" ? "auto" : "auto",
        marginRight: align === "left" ? "auto" : align === "right" ? "0" : "auto",
      }}
    >
      {/* Loading Skeleton / Blurhash Placeholder */}
      {!isLoaded && !hasError && (
        <div 
          className="absolute inset-0 z-0 w-full flex items-center justify-center bg-zinc-950/80 border border-zinc-900/60"
        >
          {blurhash ? (
            <Blurhash
              hash={blurhash}
              width="100%"
              height="100%"
              resolutionX={32}
              resolutionY={32}
              punch={1}
            />
          ) : (
            <Loader2 className="h-8 w-8 animate-spin text-zinc-600" />
          )}
        </div>
      )}

      {/* Error Retry Overlay */}
      {hasError && (
        <div 
          className="relative z-20 w-full flex flex-col items-center justify-center bg-zinc-950 border border-red-900/40 p-6 text-center"
          style={{ aspectRatio: `${width} / ${height}` }}
        >
          <p className="text-xs font-semibold text-red-400 mb-3">Failed to load slice</p>
          <button
            onClick={handleRetry}
            className="inline-flex items-center gap-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 px-4 py-2 text-xs font-bold text-white transition active:scale-95"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Tap to retry
          </button>
        </div>
      )}

      {/* Zero-gap block image */}
      {!hasError && (
        <img
          key={retryKey}
          src={imageSrc}
          alt="Manga Page Slice"
          loading={priority ? "eager" : "lazy"}
          referrerPolicy="no-referrer"
          className={cn(
            getFitImageClass(),
            "transition-opacity duration-300 relative z-10",
            isLoaded ? "opacity-100" : "opacity-0"
          )}
          style={{
            marginLeft: align === "left" ? "0" : align === "right" ? "auto" : "auto",
            marginRight: align === "left" ? "auto" : align === "right" ? "0" : "auto",
          }}
          onLoad={() => setIsLoaded(true)}
          onError={() => {
            setIsLoaded(true);
            setHasError(true);
          }}
        />
      )}
    </div>
  );
}
