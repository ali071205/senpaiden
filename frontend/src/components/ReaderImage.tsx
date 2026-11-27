"use client";

import { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { Loader2, RefreshCw } from "lucide-react";
import { decode } from "blurhash";

/** Native React 19-compatible Blurhash canvas renderer */
function BlurhashCanvas({ hash, width, height }: { hash: string; width: number; height: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !hash) return;
    try {
      const pixels = decode(hash, 32, 32);
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const imageData = ctx.createImageData(32, 32);
      imageData.data.set(pixels);
      ctx.putImageData(imageData, 0, 0);
    } catch {
      // Invalid hash, ignore
    }
  }, [hash]);

  return (
    <canvas
      ref={canvasRef}
      width={32}
      height={32}
      className="absolute inset-0 w-full h-full"
      style={{ imageRendering: "pixelated" }}
    />
  );
}

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
  const [stage, setStage] = useState<number>(0);
  const [currentSrc, setCurrentSrc] = useState<string>(src);
  const [retryKey, setRetryKey] = useState(0);

  const handleRetry = () => {
    setIsLoaded(false);
    setHasError(false);
    setStage(0);
    setCurrentSrc(src);
    setRetryKey((prev) => prev + 1);
  };

  const handleImageError = () => {
    // Stage 0 -> 1: Try .webp format if it's .avif on cdn.atsu.moe
    if (stage === 0 && currentSrc && currentSrc.includes("cdn.atsu.moe") && currentSrc.endsWith(".avif")) {
      const webpUrl = currentSrc.replace(".avif", ".webp");
      setCurrentSrc(webpUrl);
      setStage(1);
      return;
    }

    // Stage 0/1 -> 2: Try edge image proxy
    if (stage < 2 && src && !currentSrc.startsWith("/api/image/proxy")) {
      const proxyUrl = `/api/image/proxy?url=${encodeURIComponent(src)}`;
      setCurrentSrc(proxyUrl);
      setStage(2);
      return;
    }

    // All fallbacks exhausted
    setIsLoaded(true);
    setHasError(true);
  };

  const imageSrc = retryKey > 0 ? (currentSrc.includes("?") ? `${currentSrc}&retry=${retryKey}` : `${currentSrc}?retry=${retryKey}`) : currentSrc;

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
            <BlurhashCanvas hash={blurhash} width={width} height={height} />
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
          onError={handleImageError}
        />
      )}
    </div>
  );
}
