"use client";

import { useState, useEffect } from "react";

interface SmartImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src?: string;
  fallbackSrc?: string;
  onAllErrors?: () => void;
}

function resolveImageSrc(url?: string): string | undefined {
  if (!url) return undefined;
  if (url.startsWith("/api/image/proxy")) return url;
  if (
    url.includes("mangapill.com") ||
    url.includes("readdetectiveconan.com")
  ) {
    return `/api/image/proxy?url=${encodeURIComponent(url)}`;
  }
  return url;
}

export function SmartImage({
  src,
  fallbackSrc,
  alt = "",
  className = "",
  onError,
  onAllErrors,
  ...props
}: SmartImageProps) {
  const [currentSrc, setCurrentSrc] = useState<string | undefined>(() => resolveImageSrc(src));
  const [stage, setStage] = useState<number>(0);

  useEffect(() => {
    setCurrentSrc(resolveImageSrc(src));
    setStage(0);
  }, [src]);

  const handleError = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
    if (!src) {
      onError?.(e);
      onAllErrors?.();
      return;
    }

    // Stage 0: If currentSrc wasn't proxied yet, try routing through proxy
    if (stage === 0 && !currentSrc?.startsWith("/api/image/proxy")) {
      const proxyUrl = `/api/image/proxy?url=${encodeURIComponent(src)}`;
      setCurrentSrc(proxyUrl);
      setStage(1);
      return;
    }

    // Stage 1: If an .avif file failed, try .webp equivalent
    if (stage <= 1 && currentSrc && currentSrc.includes(".avif")) {
      const webpUrl = currentSrc.replace(/\.avif(\?|$)/, ".webp$1");
      if (webpUrl !== currentSrc) {
        setCurrentSrc(webpUrl);
        setStage(2);
        return;
      }
    }

    // Stage 2: Try explicit fallbackSrc if provided
    if (stage <= 2 && fallbackSrc && currentSrc !== fallbackSrc) {
      setCurrentSrc(fallbackSrc);
      setStage(3);
      return;
    }

    // Final stage: All fallbacks exhausted
    setStage(4);
    onError?.(e);
    onAllErrors?.();
  };

  if (!currentSrc || stage >= 4) {
    return null;
  }

  return (
    <img
      src={currentSrc}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={handleError}
      className={className}
      {...props}
    />
  );
}
