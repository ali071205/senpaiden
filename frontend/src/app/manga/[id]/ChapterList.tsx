"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search as SearchIcon, Loader2 } from "lucide-react";
import { StatusBadge } from "@/components/StatusBadge";
import { triggerStartLoading } from "@/components/TopProgressBar";

export function ChapterList({ mangaId, initialChapters }: { mangaId: string, initialChapters: any[] }) {
  const [sort, setSort] = useState<"newest" | "oldest">("oldest");
  const [q, setQ] = useState("");
  const [loadingChapter, setLoadingChapter] = useState<number | null>(null);

  const chapters = useMemo(() => {
    const list = initialChapters.filter((c) =>
      !q ? true : `${c.chapter_number} ${c.title || ''}`.toLowerCase().includes(q.toLowerCase()),
    );
    return sort === "newest" 
      ? list.slice().sort((a, b) => b.chapter_number - a.chapter_number) 
      : list.slice().sort((a, b) => a.chapter_number - b.chapter_number);
  }, [initialChapters, sort, q]);

  return (
    <section className="mt-10">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold">Chapters <span className="text-[#71717A]">({initialChapters.length})</span></h2>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs">
            <SearchIcon className="h-3.5 w-3.5 text-[#71717A]" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Find chapter"
              className="w-32 bg-transparent outline-none placeholder:text-[#71717A]"
            />
          </div>
          <button
            onClick={() => setSort((s) => (s === "newest" ? "oldest" : "newest"))}
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-[#A1A1AA]"
          >
            {sort === "newest" ? "Newest" : "Oldest"}
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-white/5 bg-[#101016]">
        {chapters.map((c) => {
          const isProcessing = c.job_status === "QUEUED" || c.job_status === "PROCESSING";
          const isFailed = c.job_status === "FAILED";
          const isReady = c.job_status === "READY" || c.job_status === "COMPLETED";

          const targetHref = isProcessing 
            ? `/manga/${mangaId}/${c.chapter_number}/processing` 
            : `/manga/${mangaId}/${c.chapter_number}`;

          let badgeStatus: any = "ready";
          if (isProcessing) badgeStatus = "processing";
          if (isFailed) badgeStatus = "failed";

          const isLoading = loadingChapter === c.chapter_number;

          return (
            <Link
              key={c.chapter_number}
              href={targetHref}
              onClick={() => {
                setLoadingChapter(c.chapter_number);
                triggerStartLoading();
              }}
              className={`group flex items-center gap-3 border-b border-white/5 p-3 text-sm transition last:border-b-0 hover:bg-white/5 ${
                isLoading ? "bg-red-500/10 border-red-500/50 animate-pulse" : ""
              }`}
            >
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-white/5 text-sm font-bold tabular-nums">
                {isLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin text-primary" />
                ) : (
                  c.chapter_number
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <div className="truncate font-semibold">{c.title || `Chapter ${c.chapter_number}`}</div>
                  {!isReady && <StatusBadge status={badgeStatus} />}
                </div>
                <div className="mt-0.5 text-[11px] text-[#71717A]">
                  {isLoading ? (
                    <span className="text-primary font-medium">Opening Chapter...</span>
                  ) : (
                    new Date(c.created_at).toLocaleDateString()
                  )}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
