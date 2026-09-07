"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ReaderImage } from "@/components/ReaderImage";
import { RecommendationsRow } from "@/components/RecommendationsRow";
import { StaleBanner } from "@/components/StaleBanner";
import { AdSlot } from "@/components/AdSlot";
import { isChapterFastPass, isChapterUnlocked, FASTPASS_UPDATED_EVENT } from "@/lib/fastpass";
import { FastPassUnlockModal } from "@/components/FastPassUnlockModal";
import { saveHistoryLocal } from "@/lib/history-storage";
import { fetchApi } from "@/lib/api-client";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import {
  ChevronLeft,
  ChevronRight,
  BookOpen,
  Columns,
  ScrollText,
  Maximize,
  Maximize2,
  Minimize2,
  ArrowLeftRight,
  ArrowUpDown,
  Globe,
  List,
  Trophy,
  Sparkles,
  X,
} from "lucide-react";

type PageFitMode = "fit-width" | "fit-height" | "original";

interface SliceData {
  key: string;
  width: number;
  height: number;
  blurhash?: string;
}

interface ChapterMetadata {
  id: string;
  chapter_number: number;
  title?: string;
  job_status?: string;
  language?: string;
  scanlation_group?: string;
}

interface PageGroupData {
  pageNumber: number;
  slices: SliceData[];
}

interface MangaReaderContainerProps {
  mangaId: string;
  mangaTitle: string;
  mangaCoverUrl?: string;
  chapterNumber: string;
  chapters: ChapterMetadata[];
  slices: SliceData[];
  pageGroups?: PageGroupData[];
  freshness?: "fresh" | "stale" | "archived";
  r2BaseUrl: string;
  availableLanguages?: string[];
  currentLanguage?: string;
}

const getSliceUrl = (baseUrl: string, key: string) => {
  if (key.startsWith('gdrive/')) {
    return `/api/image/${key}`;
  }
  let url = key;
  if (!key.startsWith('http://') && !key.startsWith('https://')) {
    const cleanBase = baseUrl.replace(/\/$/, '');
    const cleanKey = key.replace(/^\//, '');
    url = `${cleanBase}/${cleanKey}`;
  }
  // Replace volatile/expired MangaDex @home CDN nodes with persistent uploads server
  if (url.includes('.mangadex.network/data/')) {
    url = url.replace(/https?:\/\/[^\/]+\.mangadex\.network\/data\//, 'https://uploads.mangadex.org/data/');
  }
  return url;
};

type ReadingMode = "webtoon" | "single" | "double";

export function MangaReaderContainer({
  mangaId,
  mangaTitle,
  mangaCoverUrl,
  chapterNumber,
  chapters,
  slices,
  pageGroups,
  freshness,
  r2BaseUrl,
  availableLanguages = ["en", "es", "fr"],
  currentLanguage = "en"
}: MangaReaderContainerProps) {
  const router = useRouter();

  const displayPages = useMemo(() => {
    if (pageGroups && pageGroups.length > 0) {
      return pageGroups;
    }
    return slices.map((s, idx) => ({ pageNumber: idx + 1, slices: [s] }));
  }, [pageGroups, slices]);
  const [isHudVisible, setIsHudVisible] = useState(true);
  const [currentSliceIndex, setCurrentSliceIndex] = useState(0);
  const [isCounterVisible, setIsCounterVisible] = useState(false);
  const [readingMode, setReadingMode] = useState<ReadingMode>("webtoon");
  const [pageFit, setPageFit] = useState<PageFitMode>("fit-width");
  const [selectedLang, setSelectedLang] = useState<string>(currentLanguage);
  const [isEndModalOpen, setIsEndModalOpen] = useState(false);
  const [activePagedIndex, setActivePagedIndex] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [containerWidth, setContainerWidth] = useState(800); // Default max-width

  const counterTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Calculate scaled heights for virtual windowing
  useEffect(() => {
    const updateWidth = () => {
      setContainerWidth(Math.min(window.innerWidth, 800));
    };
    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, []);

  // We rely on React-level hidden image rendering for preloading so we can control fetchPriority
  // and prevent bandwidth competition with the active page.

  const virtualizer = useWindowVirtualizer({
    count: readingMode === 'webtoon' ? slices.length : 0,
    estimateSize: (index) => {
      const slice = slices[index];
      if (!slice || !slice.width || !slice.height) return window.innerHeight;
      
      let estimatedHeight = (containerWidth / slice.width) * slice.height;

      // In fit-height mode, the image height is constrained by max-h-[85vh] or [90vh]
      if (pageFit === "fit-height" && typeof window !== "undefined") {
        // Assume 85vh for safe estimation. If the unconstrained height is larger, it gets capped.
        const maxHeight = window.innerHeight * 0.85; 
        if (estimatedHeight > maxHeight) {
          estimatedHeight = maxHeight;
        }
      }

      return estimatedHeight;
    },
    overscan: 5,
  });

  // Sorted chapters ascending
  const sortedChapters = [...chapters].sort((a, b) => a.chapter_number - b.chapter_number);
  const currentChapterNum = parseFloat(chapterNumber);
  const currentChapterIndex = sortedChapters.findIndex(c => c.chapter_number === currentChapterNum);
  
  const prevChapter = currentChapterIndex > 0 ? sortedChapters[currentChapterIndex - 1] : null;
  const nextChapter = currentChapterIndex < sortedChapters.length - 1 ? sortedChapters[currentChapterIndex + 1] : null;

  const latestChapterNum = sortedChapters.length > 0 ? sortedChapters[sortedChapters.length - 1].chapter_number : 1;
  const [isFastPassLockActive, setIsFastPassLockActive] = useState(false);

  useEffect(() => {
    const checkLock = () => {
      const unlocked = isChapterUnlocked(mangaId, currentChapterNum, latestChapterNum, sortedChapters.length);
      setIsFastPassLockActive(!unlocked);
    };
    checkLock();
    window.addEventListener(FASTPASS_UPDATED_EVENT, checkLock);
    return () => window.removeEventListener(FASTPASS_UPDATED_EVENT, checkLock);
  }, [mangaId, currentChapterNum, latestChapterNum, sortedChapters.length]);

  // Load saved settings & progress on mount + record chapter read history
  useEffect(() => {
    const savedMode = localStorage.getItem("senpai_reader_mode") as ReadingMode;
    if (savedMode === "single" || savedMode === "double" || savedMode === "webtoon") {
      setReadingMode(savedMode);
    }

    const savedFit = localStorage.getItem("senpai_page_fit") as PageFitMode;
    if (savedFit === "fit-width" || savedFit === "fit-height" || savedFit === "original") {
      setPageFit(savedFit);
    }

    const savedProgress = localStorage.getItem(`senpai_progress_${mangaId}`);
    if (savedProgress) {
      try {
        const parsed = JSON.parse(savedProgress);
        if (parsed.chapterNumber === chapterNumber && typeof parsed.sliceIndex === "number") {
          setCurrentSliceIndex(parsed.sliceIndex);
          setActivePagedIndex(parsed.sliceIndex);
        }
      } catch {}
    }

    // Record chapter in read list
    try {
      const readStr = localStorage.getItem(`senpai_read_chapters_${mangaId}`);
      const readArr: number[] = readStr ? JSON.parse(readStr) : [];
      if (!readArr.includes(currentChapterNum)) {
        readArr.push(currentChapterNum);
        localStorage.setItem(`senpai_read_chapters_${mangaId}`, JSON.stringify(readArr));
      }
    } catch {}
  }, [mangaId, chapterNumber, currentChapterNum]);

  // Always reset scroll position to the very top on chapter change
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, left: 0, behavior: "instant" });
      if (document.documentElement) document.documentElement.scrollTop = 0;
      if (document.body) document.body.scrollTop = 0;
      if (containerRef.current) containerRef.current.scrollTop = 0;
    }
  }, [chapterNumber]);

  // Debounced progress saver reference to prevent scroll thrashing (Bug M1 Fix)
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Persist current progress to localStorage and IndexedDB
  const saveProgress = useCallback((index: number) => {
    setCurrentSliceIndex(index);
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      saveHistoryLocal({
        mangaId,
        title: mangaTitle,
        coverUrl: mangaCoverUrl,
        chapterNumber: parseFloat(chapterNumber),
        sliceIndex: index,
        timestamp: Date.now()
      });
    }, 250);
  }, [mangaId, mangaTitle, mangaCoverUrl, chapterNumber]);

  // Safe chapter routing helper (Bug H3 Fix)
  const navigateToChapter = useCallback((targetChapter: ChapterMetadata) => {
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, left: 0, behavior: "instant" });
      if (document.documentElement) document.documentElement.scrollTop = 0;
      if (document.body) document.body.scrollTop = 0;
      if (containerRef.current) containerRef.current.scrollTop = 0;
    }
    const isProcessing = targetChapter.job_status === 'QUEUED' || targetChapter.job_status === 'PROCESSING';
    if (isProcessing) {
      router.push(`/manga/${mangaId}/${targetChapter.chapter_number}/processing`, { scroll: true });
    } else {
      router.push(`/manga/${mangaId}/${targetChapter.chapter_number}`, { scroll: true });
    }
  }, [router, mangaId]);

  // Trigger auto-fading page counter badge
  const triggerCounterVisibility = useCallback(() => {
    setIsCounterVisible(true);
    if (counterTimeoutRef.current) clearTimeout(counterTimeoutRef.current);
    counterTimeoutRef.current = setTimeout(() => {
      setIsCounterVisible(false);
    }, 2200);
  }, []);

  const hasPrefetchedNext = useRef(false);

  const prefetchNextChapter = useCallback(async (nextChNum: number) => {
    try {
      const data = await fetchApi<{ pages?: any[] }>(`/api/manga/${mangaId}/chapter/${nextChNum}`);
      
      if (data?.pages && data.pages.length > 0) {
        const prefetchKeys: string[] = [];
        for (const page of data.pages) {
          if (page.r2_keys) prefetchKeys.push(...page.r2_keys);
          if (prefetchKeys.length >= 3) break;
        }
        
        prefetchKeys.slice(0, 3).forEach(key => {
          const link = document.createElement('link');
          link.rel = 'prefetch';
          link.as = 'image';
          link.href = `${r2BaseUrl}/${key}`;
          document.head.appendChild(link);
        });
      }
    } catch {
      // Fail silently, prefetching is a progressive enhancement
    }
  }, [mangaId, r2BaseUrl]);

  const virtualItems = virtualizer.getVirtualItems();

  // Track Webtoon scroll using the virtualizer's currently active items
  useEffect(() => {
    if (readingMode !== "webtoon" || virtualItems.length === 0) return;

    // Pick a representative visible item (overscan means index 0 is slightly above viewport)
    const midItem = virtualItems[Math.min(1, virtualItems.length - 1)];
    if (midItem && midItem.index !== currentSliceIndex) {
      saveProgress(midItem.index);
      triggerCounterVisibility();

      // Phase 3 Fix: Predictive Prefetching at 70% threshold
      if (!hasPrefetchedNext.current && nextChapter && midItem.index >= slices.length * 0.7) {
        hasPrefetchedNext.current = true;
        prefetchNextChapter(nextChapter.chapter_number);
      }
    }
  }, [virtualItems, readingMode, nextChapter, slices.length, currentSliceIndex, saveProgress, triggerCounterVisibility, prefetchNextChapter]);

  const step = readingMode === "double" ? 2 : 1;

  // Cross-browser Fullscreen toggle
  const toggleFullscreen = useCallback(() => {
    try {
      if (typeof document === "undefined") return;
      const doc = document as Document & {
        webkitFullscreenElement?: Element;
        msFullscreenElement?: Element;
        webkitExitFullscreen?: () => Promise<void>;
        msExitFullscreen?: () => Promise<void>;
      };
      const docEl = document.documentElement as HTMLElement & {
        webkitRequestFullscreen?: () => Promise<void>;
        msRequestFullscreen?: () => Promise<void>;
      };

      if (!doc.fullscreenElement && !doc.webkitFullscreenElement && !doc.msFullscreenElement) {
        if (docEl.requestFullscreen) {
          docEl.requestFullscreen().catch(() => {});
        } else if (docEl.webkitRequestFullscreen) {
          docEl.webkitRequestFullscreen();
        } else if (docEl.msRequestFullscreen) {
          docEl.msRequestFullscreen();
        }
        setIsFullscreen(true);
      } else {
        if (doc.exitFullscreen) {
          doc.exitFullscreen().catch(() => {});
        } else if (doc.webkitExitFullscreen) {
          doc.webkitExitFullscreen();
        } else if (doc.msExitFullscreen) {
          doc.msExitFullscreen();
        }
        setIsFullscreen(false);
      }
    } catch {
      console.warn("Fullscreen API not available on this device.");
    }
  }, []);

  const nextPagedPage = useCallback(() => {
    if (activePagedIndex < displayPages.length - step) {
      const nextIdx = activePagedIndex + step;
      setActivePagedIndex(nextIdx);
      saveProgress(nextIdx);
      triggerCounterVisibility();

      // Phase 3 Fix: Predictive Prefetching at 70% threshold for Paged modes
      if (!hasPrefetchedNext.current && nextChapter && nextIdx >= displayPages.length * 0.7) {
        hasPrefetchedNext.current = true;
        prefetchNextChapter(nextChapter.chapter_number);
      }
    } else if (nextChapter) {
      navigateToChapter(nextChapter);
    } else {
      setIsEndModalOpen(true);
    }
  }, [activePagedIndex, displayPages.length, step, nextChapter, saveProgress, triggerCounterVisibility, prefetchNextChapter, navigateToChapter]);

  const prevPagedPage = useCallback(() => {
    if (activePagedIndex > 0) {
      const prevIdx = Math.max(0, activePagedIndex - step);
      setActivePagedIndex(prevIdx);
      saveProgress(prevIdx);
      triggerCounterVisibility();
    } else if (prevChapter) {
      navigateToChapter(prevChapter);
    }
  }, [activePagedIndex, step, prevChapter, saveProgress, triggerCounterVisibility, navigateToChapter]);

  // Keyboard & Power-User navigation shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === "j" || e.key === "J" || e.key === "ArrowDown") {
        if (readingMode === "webtoon") {
          e.preventDefault();
          window.scrollBy({ top: 350, behavior: "smooth" });
        }
      } else if (e.key === "k" || e.key === "K" || e.key === "ArrowUp") {
        if (readingMode === "webtoon") {
          e.preventDefault();
          window.scrollBy({ top: -350, behavior: "smooth" });
        }
      } else if (e.key === "ArrowRight" || e.key === "PageDown") {
        if (readingMode === "single" || readingMode === "double") {
          e.preventDefault();
          nextPagedPage();
        } else if (e.key === "ArrowRight" && nextChapter) {
          router.push(`/manga/${mangaId}/${nextChapter.chapter_number}`);
        }
      } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
        if (readingMode === "single" || readingMode === "double") {
          e.preventDefault();
          prevPagedPage();
        } else if (e.key === "ArrowLeft" && prevChapter) {
          router.push(`/manga/${mangaId}/${prevChapter.chapter_number}`);
        }
      } else if (e.key === "n" || e.key === "N") {
        if (nextChapter) router.push(`/manga/${mangaId}/${nextChapter.chapter_number}`);
      } else if (e.key === "p" || e.key === "P") {
        if (prevChapter) router.push(`/manga/${mangaId}/${prevChapter.chapter_number}`);
      } else if (e.key === " " || e.key === "Spacebar") {
        e.preventDefault();
        setIsHudVisible(prev => !prev);
      } else if (e.key === "f" || e.key === "F") {
        toggleFullscreen();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [readingMode, nextChapter, prevChapter, mangaId, router, nextPagedPage, prevPagedPage, toggleFullscreen]);

  // Handle center vs side screen clicks
  const handleContainerClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const width = rect.width;

    const leftZone = width * 0.25;
    const rightZone = width * 0.75;

    if (readingMode === "single" || readingMode === "double") {
      if (x < leftZone) {
        prevPagedPage();
      } else if (x > rightZone) {
        nextPagedPage();
      } else {
        setIsHudVisible(prev => !prev);
      }
    } else {
      setIsHudVisible(prev => !prev);
    }
  };

  const setMode = (mode: ReadingMode) => {
    setReadingMode(mode);
    localStorage.setItem("senpai_reader_mode", mode);
  };

  const updateFit = (fit: PageFitMode) => {
    setPageFit(fit);
    localStorage.setItem("senpai_page_fit", fit);
  };

  return (
    <div ref={containerRef} className="min-h-screen bg-black text-white relative select-none overflow-x-hidden pb-16">
      <StaleBanner freshness={freshness} />

      {/* Floating Header HUD */}
      <header
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          isHudVisible ? "translate-y-0 opacity-100" : "-translate-y-full opacity-0 pointer-events-none"
        }`}
      >
        <div className="sd-glass border-x-0 border-t-0 rounded-none px-3 sm:px-4 py-2.5 sm:py-3">
          <div className="max-w-6xl mx-auto flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
              <Link
                href={`/manga/${mangaId}`}
                className="p-1.5 sm:p-2 rounded-xl bg-white/5 hover:bg-white/10 text-[#A1A1AA] hover:text-white transition-colors border border-white/10 shrink-0"
                title="Back to Manga Details"
              >
                <ChevronLeft className="w-5 h-5" />
              </Link>
              <div className="truncate min-w-0 flex-1">
                <h1 className="text-xs sm:text-sm font-semibold text-white truncate max-w-[140px] xs:max-w-[200px] sm:max-w-md">{mangaTitle}</h1>
                <p className="text-[11px] sm:text-xs text-[#A1A1AA] truncate">Chapter {chapterNumber}</p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              {/* 3 Reading Mode Selectors */}
              <div className="flex items-center gap-0.5 sm:gap-1 bg-white/5 p-0.5 sm:p-1 rounded-xl border border-white/10">
                <button
                  onClick={() => setMode("webtoon")}
                  className={`px-1.5 sm:px-2 py-1 rounded-lg text-xs font-medium flex items-center gap-1 transition-colors ${
                    readingMode === "webtoon" ? "bg-[#38BDF8]/20 text-[#38BDF8] border border-[#38BDF8]/30 font-semibold" : "text-[#A1A1AA] hover:text-white"
                  }`}
                  title="Continuous Webtoon Strip"
                >
                  <ScrollText className="w-3.5 h-3.5" />
                  <span className="hidden md:inline">Webtoon</span>
                </button>
                <button
                  onClick={() => setMode("single")}
                  className={`px-1.5 sm:px-2 py-1 rounded-lg text-xs font-medium flex items-center gap-1 transition-colors ${
                    readingMode === "single" ? "bg-[#22C55E]/20 text-[#22C55E] border border-[#22C55E]/30 font-semibold" : "text-[#A1A1AA] hover:text-white"
                  }`}
                  title="Single Page View"
                >
                  <BookOpen className="w-3.5 h-3.5" />
                  <span className="hidden md:inline">Single</span>
                </button>
                <button
                  onClick={() => setMode("double")}
                  className={`px-1.5 sm:px-2 py-1 rounded-lg text-xs font-medium flex items-center gap-1 transition-colors ${
                    readingMode === "double" ? "bg-[#8B5CF6]/20 text-[#8B5CF6] border border-[#8B5CF6]/30 font-semibold" : "text-[#A1A1AA] hover:text-white"
                  }`}
                  title="Double Spread View (Book Mode)"
                >
                  <Columns className="w-3.5 h-3.5" />
                  <span className="hidden md:inline">Double</span>
                </button>
              </div>

              {/* 3 Page Fit Selectors */}
              <div className="hidden sm:flex items-center gap-1 bg-white/5 p-1 rounded-xl border border-white/10">
                <button
                  onClick={() => updateFit("fit-width")}
                  className={`px-2 py-1 rounded-lg text-xs font-medium flex items-center gap-1 transition-colors ${
                    pageFit === "fit-width" ? "bg-[#38BDF8]/20 text-[#38BDF8] border border-[#38BDF8]/30 font-semibold" : "text-[#A1A1AA] hover:text-white"
                  }`}
                  title="Fit to Container Width"
                >
                  <ArrowLeftRight className="w-3.5 h-3.5" />
                  <span className="hidden lg:inline">Width</span>
                </button>
                <button
                  onClick={() => updateFit("fit-height")}
                  className={`px-2 py-1 rounded-lg text-xs font-medium flex items-center gap-1 transition-colors ${
                    pageFit === "fit-height" ? "bg-[#22C55E]/20 text-[#22C55E] border border-[#22C55E]/30 font-semibold" : "text-[#A1A1AA] hover:text-white"
                  }`}
                  title="Fit to Screen Viewport Height"
                >
                  <ArrowUpDown className="w-3.5 h-3.5" />
                  <span className="hidden lg:inline">Height</span>
                </button>
                <button
                  onClick={() => updateFit("original")}
                  className={`px-2 py-1 rounded-lg text-xs font-medium flex items-center gap-1 transition-colors ${
                    pageFit === "original" ? "bg-[#8B5CF6]/20 text-[#8B5CF6] border border-[#8B5CF6]/30 font-semibold" : "text-[#A1A1AA] hover:text-white"
                  }`}
                  title="Original Size (No Constraints)"
                >
                  <Maximize className="w-3.5 h-3.5" />
                  <span className="hidden lg:inline">Original</span>
                </button>
              </div>

              {/* Multi-Language ISO Selector Pill */}
              <div className="flex items-center gap-1 bg-white/5 p-0.5 sm:p-1 rounded-xl border border-white/10">
                <Globe className="w-3.5 h-3.5 text-[#A1A1AA] ml-1 hidden sm:block shrink-0" />
                <select
                  value={selectedLang}
                  onChange={(e) => {
                    const newLang = e.target.value;
                    setSelectedLang(newLang);
                    localStorage.setItem("senpai_preferred_lang", newLang);
                    router.push(`/manga/${mangaId}/${chapterNumber}?lang=${newLang}`);
                  }}
                  className="bg-transparent text-white text-xs rounded-lg px-1 sm:px-1.5 py-1 focus:outline-none cursor-pointer font-medium"
                  title="Change Chapter Translation Language"
                >
                  {availableLanguages.map((lang) => (
                    <option key={lang} value={lang} className="bg-[#101016] text-white">
                      {lang === 'en' ? '🇬🇧 EN' : lang === 'es' ? '🇪🇸 ES' : lang === 'fr' ? '🇫🇷 FR' : lang === 'ja' ? '🇯🇵 JA' : lang.toUpperCase()}
                    </option>
                  ))}
                </select>
              </div>

              <button
                onClick={toggleFullscreen}
                className="p-1.5 sm:p-2 rounded-lg bg-white/5 hover:bg-white/10 text-[#A1A1AA] hover:text-white transition-colors border border-white/10 shrink-0"
                title="Toggle Fullscreen"
              >
                {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Auto-Fading Floating Counter Badge */}
      <div
        className={`fixed top-16 right-4 z-40 bg-zinc-900/90 backdrop-blur-md text-zinc-200 border border-zinc-800 text-xs font-mono px-3 py-1.5 rounded-full shadow-lg transition-opacity duration-300 pointer-events-none ${
          isCounterVisible || isHudVisible ? "opacity-100" : "opacity-0"
        }`}
      >
        {readingMode === "webtoon"
          ? `Slice ${currentSliceIndex + 1} / ${slices.length}`
          : `Page ${activePagedIndex + 1} / ${displayPages.length}`}
      </div>

      {/* Main Content Area */}
      <div className="w-full min-h-screen cursor-pointer" onClick={handleContainerClick}>
        {readingMode === "webtoon" ? (
          /* Webtoon Strip Mode: Seamless Virtualized list */
          <div 
            className="w-full relative mx-auto max-w-[800px] bg-black m-0 p-0 border-0 leading-none"
            style={{ height: `${virtualizer.getTotalSize()}px` }}
          >
            {virtualizer.getVirtualItems().map((virtualItem) => {
              const slice = slices[virtualItem.index];
              const imgUrl = getSliceUrl(r2BaseUrl, slice.key);
  return (
    <div
      key={virtualItem.key} 
      data-index={virtualItem.index} 
      ref={virtualizer.measureElement}
      className="absolute top-0 left-0 w-full m-0 p-0 border-0 leading-none flex justify-center"
      style={{
        transform: `translateY(${virtualItem.start}px)`,
      }}
    >
      <ReaderImage
        src={imgUrl}
        width={slice.width}
        height={slice.height}
        priority={virtualItem.index < 3}
        blurhash={slice.blurhash}
        pageFit={pageFit}
      />
    </div>
  );
})}
          </div>
        ) : readingMode === "single" ? (
          /* Single Page View (Renders full stacked page) */
          <div className="w-full min-h-screen flex items-center justify-center pt-8 pb-20 px-2 bg-black">
            {displayPages[activePagedIndex] && (
              <div className="w-full max-w-[800px] flex flex-col items-center justify-center m-0 p-0 border-0 leading-none">
                {displayPages[activePagedIndex].slices.map((slice, sIdx) => (
                  <ReaderImage
                    key={slice.key}
                    src={getSliceUrl(r2BaseUrl, slice.key)}
                    width={slice.width}
                    height={slice.height}
                    priority={sIdx === 0}
                    blurhash={slice.blurhash}
                    pageFit={pageFit}
                  />
                ))}
              </div>
            )}
          </div>
        ) : (
          /* Double Spread View (Manga Dual Page Book Mode) */
          <div className="w-full min-h-screen flex items-center justify-center pt-8 pb-20 px-2 bg-black">
            <div className="w-full max-w-[1400px] flex flex-col md:flex-row items-center justify-center gap-0">
              {/* Left Page (Page A) */}
              {displayPages[activePagedIndex] && (
                <div className="w-full md:w-1/2 max-w-[700px] flex flex-col items-end justify-center m-0 p-0 border-0 leading-none">
                  {displayPages[activePagedIndex].slices.map((slice, sIdx) => (
                    <ReaderImage
                      key={slice.key}
                      src={getSliceUrl(r2BaseUrl, slice.key)}
                      width={slice.width}
                      height={slice.height}
                      priority={sIdx === 0}
                      blurhash={slice.blurhash}
                      containerClassName="max-w-[700px]"
                      pageFit={pageFit}
                      align="right"
                    />
                  ))}
                </div>
              )}
              {/* Right Page (Page B) */}
              {displayPages[activePagedIndex + 1] && (
                <div className="w-full md:w-1/2 max-w-[700px] flex flex-col items-start justify-center m-0 p-0 border-0 leading-none">
                  {displayPages[activePagedIndex + 1].slices.map((slice, sIdx) => (
                    <ReaderImage
                      key={slice.key}
                      src={getSliceUrl(r2BaseUrl, slice.key)}
                      width={slice.width}
                      height={slice.height}
                      priority={sIdx === 0}
                      blurhash={slice.blurhash}
                      containerClassName="max-w-[700px]"
                      pageFit={pageFit}
                      align="left"
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Chapter Completion & Next Chapter Intermission Card */}
        <div className="mx-auto max-w-2xl px-4 pt-10 pb-28">
          <div className="rounded-3xl border border-white/10 bg-[#12151D] p-6 text-center shadow-2xl backdrop-blur-xl relative overflow-hidden">
            {/* Ambient Background Glow */}
            <div className="absolute -top-12 left-1/2 -translate-x-1/2 w-48 h-48 bg-primary/15 rounded-full blur-3xl pointer-events-none" />

            <div className="relative z-10 flex flex-col items-center">
              <span className="px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[11px] font-black uppercase tracking-wider mb-3">
                ✓ Chapter {chapterNumber} Completed
              </span>
              
              <h3 className="text-lg md:text-xl font-black text-white font-rajdhani mb-1">
                {nextChapter ? `Ready for Chapter ${nextChapter.chapter_number}?` : `You're all caught up with ${mangaTitle}!`}
              </h3>
              <p className="text-xs text-muted-foreground mb-5 max-w-md">
                {nextChapter ? (nextChapter.title || "Continue your read with the next installment.") : "Check back later for new chapter releases or browse related manga below."}
              </p>

              {/* Action buttons */}
              <div className="flex flex-col sm:flex-row items-center gap-3 w-full justify-center mb-6">
                {nextChapter ? (
                  <Link
                    href={`/manga/${mangaId}/${nextChapter.chapter_number}`}
                    scroll={true}
                    onClick={() => {
                      if (typeof window !== "undefined") {
                        window.scrollTo({ top: 0, left: 0, behavior: "instant" });
                      }
                    }}
                    className="w-full sm:w-auto px-7 py-3 rounded-xl font-black text-white bg-primary shadow-[0_0_20px_rgba(255,46,46,0.4)] hover:scale-105 transition-all text-sm flex items-center justify-center gap-2 font-rajdhani"
                  >
                    <span>Next Chapter ({nextChapter.chapter_number})</span>
                    <ChevronRight className="w-4 h-4" />
                  </Link>
                ) : (
                  <button
                    onClick={() => setIsEndModalOpen(true)}
                    className="w-full sm:w-auto px-7 py-3 rounded-xl font-black text-white bg-gradient-to-r from-violet-600 to-cyan-500 hover:scale-105 transition-all text-sm flex items-center justify-center gap-2 font-rajdhani shadow-lg shadow-violet-500/25"
                  >
                    <span>View Series Recommendations</span>
                  </button>
                )}

                <Link
                  href={`/manga/${mangaId}`}
                  className="w-full sm:w-auto px-5 py-3 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-semibold text-zinc-300 transition-colors border border-white/10 text-center"
                >
                  Manga Details
                </Link>
              </div>

              {/* Intermission Ad Banner */}
              <div className="w-full">
                <AdSlot placement="reader-bottom" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Smart Preloader Queue (Background Idle Fetching) */}
      {/* Renders upcoming pages silently so the browser downloads them AFTER visible ones */}
      {readingMode !== "webtoon" && (
        <div className="absolute w-0 h-0 overflow-hidden opacity-0 pointer-events-none" aria-hidden="true">
          {slices.slice(activePagedIndex + (readingMode === "double" ? 2 : 1), activePagedIndex + (readingMode === "double" ? 6 : 4)).map((slice) => (
            <img 
              key={`preload-${slice.key}`} 
              src={getSliceUrl(r2BaseUrl, slice.key)} 
              decoding="async"
              referrerPolicy="no-referrer"
              alt="" 
            />
          ))}
        </div>
      )}

      {/* Floating Bottom Nav HUD */}
      <footer
        className={`fixed bottom-0 left-0 right-0 z-50 transition-all duration-300 ${
          isHudVisible ? "translate-y-0 opacity-100" : "translate-y-full opacity-0 pointer-events-none"
        }`}
      >
        <div className="sd-glass border-x-0 border-b-0 rounded-none px-4 py-3">
          <div className="max-w-4xl mx-auto flex items-center justify-between gap-3">
            {/* Previous Chapter Button */}
            {prevChapter ? (
              <Link
                href={`/manga/${mangaId}/${prevChapter.chapter_number}`}
                className="px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-semibold flex items-center gap-1 text-[#A1A1AA] hover:text-white transition-colors border border-white/10"
              >
                <ChevronLeft className="w-4 h-4" />
                <span className="hidden sm:inline">Ch. {prevChapter.chapter_number}</span>
              </Link>
            ) : (
              <div className="px-3 py-2 rounded-xl bg-black/50 text-xs font-semibold text-white/30 border border-white/5 flex items-center gap-1 cursor-not-allowed">
                <ChevronLeft className="w-4 h-4" />
                <span className="hidden sm:inline">First</span>
              </div>
            )}

            {/* Chapter Selector Dropdown */}
            <div className="flex items-center gap-2">
              <List className="w-4 h-4 text-[#A1A1AA] hidden sm:block shrink-0" />
              <select
                value={chapterNumber}
                onChange={(e) => router.push(`/manga/${mangaId}/${e.target.value}`)}
                className="bg-[#101016] border border-white/10 text-white text-xs rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#8B5CF6]/50 cursor-pointer font-medium max-w-[130px] sm:max-w-[220px] truncate"
              >
                {sortedChapters.map((ch) => (
                  <option key={ch.id} value={ch.chapter_number}>
                    Chapter {ch.chapter_number} {ch.title ? `- ${ch.title}` : ""}
                  </option>
                ))}
              </select>
            </div>

            {/* Next Chapter or Series Complete Button */}
            {nextChapter ? (
              <Link
                href={`/manga/${mangaId}/${nextChapter.chapter_number}`}
                scroll={true}
                onClick={() => {
                  if (typeof window !== "undefined") {
                    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
                  }
                }}
                className="px-4 py-2 rounded-xl sd-gradient hover:opacity-90 text-xs font-bold flex items-center gap-1 text-white transition-opacity shadow-[0_4px_14px_0_rgba(139,92,246,0.39)] hover:shadow-[0_6px_20px_rgba(139,92,246,0.23)]"
              >
                <span className="hidden sm:inline">Ch. {nextChapter.chapter_number}</span>
                <ChevronRight className="w-4 h-4" />
              </Link>
            ) : (
              <button
                onClick={() => setIsEndModalOpen(true)}
                className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-violet-600 to-cyan-500 hover:from-violet-500 hover:to-cyan-400 text-xs font-bold text-white flex items-center gap-1.5 transition-all shadow-lg shadow-violet-500/20 active:scale-95"
              >
                <Trophy className="w-4 h-4 text-yellow-300" />
                <span>Caught Up!</span>
              </button>
            )}
          </div>
        </div>
      </footer>

      {/* End of Series / Chapter Completion Recommendation Modal Popup */}
      {isEndModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="relative w-full max-w-3xl bg-[#0D0D12] border border-white/10 rounded-2xl p-6 shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto no-scrollbar">
            {/* Ambient Background Glow */}
            <div className="absolute -top-20 -right-20 w-60 h-60 bg-violet-600/20 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute -bottom-20 -left-20 w-60 h-60 bg-cyan-500/20 rounded-full blur-3xl pointer-events-none" />

            {/* Close Button */}
            <button
              onClick={() => setIsEndModalOpen(false)}
              className="absolute top-4 right-4 p-2 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white transition-colors border border-white/10 z-10"
              title="Close modal"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Celebration Header */}
            <div className="text-center mb-6 pt-2">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-600/30 to-cyan-500/30 border border-violet-500/30 text-yellow-400 mb-3 shadow-lg shadow-violet-500/20">
                <Trophy className="w-7 h-7 animate-bounce text-yellow-400" />
              </div>
              <h2 className="text-xl font-bold text-white mb-1 flex items-center justify-center gap-2">
                You&apos;ve caught up! <Sparkles className="w-5 h-5 text-yellow-400" />
              </h2>
              <p className="text-xs text-zinc-400 max-w-md mx-auto">
                Completed Chapter {chapterNumber} of <span className="text-white font-semibold">{mangaTitle}</span>. Here are top recommendations based on what readers binged next:
              </p>
            </div>

            {/* Recommendations Row inside Modal */}
            <div className="mb-6">
              <RecommendationsRow mangaId={mangaId} type="cobinged" title="Readers Also Binged Next" />
            </div>

            {/* Footer Action Buttons */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-4 border-t border-white/5">
              <Link
                href={`/manga/${mangaId}`}
                className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-semibold text-white text-center transition-colors border border-white/10"
              >
                Manga Details
              </Link>
              <Link
                href="/discover"
                className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-cyan-500 hover:from-violet-500 hover:to-cyan-400 text-xs font-bold text-white text-center transition-all shadow-lg shadow-violet-500/20"
              >
                Discover More Manga
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* FastPass Lock Modal */}
      <FastPassUnlockModal
        isOpen={isFastPassLockActive}
        onClose={() => {
          router.push(`/manga/${mangaId}`);
        }}
        mangaId={mangaId}
        mangaTitle={mangaTitle}
        mangaCoverUrl={mangaCoverUrl}
        chapterNumber={currentChapterNum}
        onUnlocked={() => {
          setIsFastPassLockActive(false);
        }}
      />
    </div>
  );
}
