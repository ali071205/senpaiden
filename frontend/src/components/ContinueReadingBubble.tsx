"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Play, X } from "lucide-react";
import { getLatestHistoryLocal, type HistoryRecord } from "@/lib/history-storage";

export function ContinueReadingBubble() {
  const [latest, setLatest] = useState<HistoryRecord | null>(null);
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    async function loadLatestProgress() {
      const record = await getLatestHistoryLocal();
      if (record && record.mangaId && record.chapterNumber) {
        setLatest(record);
      }
    }
    loadLatestProgress();
  }, []);

  if (!latest || isDismissed) return null;

  return (
    <div className="fixed bottom-36 right-4 z-40 md:bottom-6 md:right-6 animate-bounce-subtle">
      <div className="sd-glass flex items-center gap-3 rounded-2xl p-1.5 pr-3 shadow-[0_10px_30px_-5px_rgba(139,92,246,0.6)] border border-[#8B5CF6]/40 backdrop-blur-xl">
        <Link
          href={`/manga/${latest.mangaId}/${latest.chapterNumber}`}
          className="flex items-center gap-2.5 hover:opacity-90 transition"
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-xl sd-gradient text-white shadow-md">
            <Play className="h-4 w-4 fill-white" />
          </div>
          <div className="flex flex-col text-left">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#22D3EE]">
              Resume Reading
            </span>
            <span className="max-w-[150px] truncate text-xs font-bold text-white sm:max-w-[200px]">
              {latest.title || `Manga`} · Ch. {latest.chapterNumber}
            </span>
          </div>
        </Link>

        <button
          onClick={() => setIsDismissed(true)}
          className="ml-1 rounded-lg p-1 text-[#A1A1AA] hover:bg-white/10 hover:text-white transition"
          aria-label="Dismiss resume bubble"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
