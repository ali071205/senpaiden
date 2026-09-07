"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Star, Bookmark, Play, ChevronRight, BookOpen, Eye,
  User, Palette, TrendingUp, ThumbsUp, Share2, ChevronDown, ArrowUpDown,
  Zap, Lock, Unlock, Check, MessageSquarePlus, Send
} from "lucide-react";
import { AdSlot } from "@/components/AdSlot";
import { VideoAdUnit } from "@/components/VideoAdUnit";
import { isChapterFastPass, isChapterUnlocked, getUnlockedChapters, FASTPASS_UPDATED_EVENT } from "@/lib/fastpass";
import { FastPassUnlockModal } from "@/components/FastPassUnlockModal";

const CHUNK_SIZE = 50;

interface DetailManga {
  id: string;
  title: string;
  alt_title?: string;
  description?: string;
  genres?: string[];
  status?: string;
  cover_url?: string;
  author?: string;
  artist?: string;
  view_count?: number;
  total_chapters?: number;
  rating?: number;
  views?: string | number;
}

interface DetailChapter {
  id: string;
  chapter_number: number;
  title?: string;
  language?: string;
  release_date?: string;
  views?: number;
  likes?: number;
  pages?: number;
}

interface CommunityReview {
  id: string;
  user: string;
  avatar: string;
  rating: number;
  text: string;
  likes: number;
  time: string;
}

export function MangaDetailClient({ 
  manga, 
  chapters, 
  related 
}: { 
  manga: DetailManga; 
  chapters: DetailChapter[]; 
  related: DetailManga[] 
}) {
  const router = useRouter();
  const [saved, setSaved] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<"chapters" | "info" | "reviews">("chapters");
  const [liked, setLiked] = useState<Set<string>>(new Set());
  const [sortOrder, setSortOrder] = useState<"desc" | "asc">("asc");
  const [selectedRangeIndex, setSelectedRangeIndex] = useState(0);
  const [unlockedChapters, setUnlockedChapters] = useState<number[]>([]);
  const [fastPassModalChapter, setFastPassModalChapter] = useState<number | null>(null);
  const [isFastPassModalOpen, setIsFastPassModalOpen] = useState(false);

  // Dynamic reviews state
  const [reviewsList, setReviewsList] = useState<CommunityReview[]>([]);
  const [newReviewText, setNewReviewText] = useState("");
  const [newReviewRating, setNewReviewRating] = useState(10);
  const [newReviewName, setNewReviewName] = useState("");
  const [showReviewForm, setShowReviewForm] = useState(false);

  const genres = manga.genres && manga.genres.length > 0 ? manga.genres : ["Action", "Fantasy"];
  const startChapter = chapters.length > 0 ? Math.min(...chapters.map(c => c.chapter_number)) : 1;
  const latestChapter = chapters.length > 0 ? Math.max(...chapters.map(c => c.chapter_number)) : 1;

  useEffect(() => {
    const syncUnlocked = () => {
      setUnlockedChapters(getUnlockedChapters(manga.id));
    };
    syncUnlocked();
    window.addEventListener(FASTPASS_UPDATED_EVENT, syncUnlocked);
    return () => window.removeEventListener(FASTPASS_UPDATED_EVENT, syncUnlocked);
  }, [manga.id]);

  // Load reviews specific to this manga
  useEffect(() => {
    try {
      const stored = localStorage.getItem(`senpai_reviews_${manga.id}`);
      if (stored) {
        setReviewsList(JSON.parse(stored));
      } else {
        const seedReviews: CommunityReview[] = [
          {
            id: `seed-1-${manga.id}`,
            user: "kage_reader",
            avatar: "https://images.unsplash.com/photo-1599566150163-29194dcaad36?w=80&h=80&fit=crop&auto=format",
            rating: 10,
            text: `The pacing and character progression in ${manga.title} is top tier. Definitely one of the best ${genres[0] || 'manga'} series right now!`,
            likes: 428,
            time: "2 days ago",
          },
          {
            id: `seed-2-${manga.id}`,
            user: "luna_void",
            avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=80&h=80&fit=crop&auto=format",
            rating: 9,
            text: `Incredible art style and tension. The story keeps you hooked from chapter 1 onwards. Highly recommended!`,
            likes: 312,
            time: "5 days ago",
          }
        ];
        setReviewsList(seedReviews);
      }
    } catch {}
  }, [manga.id, manga.title, genres]);

  const handlePostReview = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newReviewText.trim()) return;
    const authorName = newReviewName.trim() || "Manga Fan";
    const userRev: CommunityReview = {
      id: `user-rev-${Date.now()}`,
      user: authorName,
      avatar: `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(authorName)}`,
      rating: newReviewRating,
      text: newReviewText.trim(),
      likes: 1,
      time: "Just now",
    };
    const updated = [userRev, ...reviewsList];
    setReviewsList(updated);
    setNewReviewText("");
    setNewReviewName("");
    setShowReviewForm(false);
    try {
      localStorage.setItem(`senpai_reviews_${manga.id}`, JSON.stringify(updated));
    } catch {}
  };

  const handleShare = async () => {
    if (typeof window === "undefined") return;
    const shareData = {
      title: `${manga.title} on Senpai Den`,
      text: `Read ${manga.title} for free with all chapters on Senpai Den!`,
      url: window.location.href,
    };
    if (navigator.share) {
      try {
        await navigator.share(shareData);
        return;
      } catch {}
    }
    try {
      await navigator.clipboard.writeText(window.location.href);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2500);
    } catch {}
  };

  // Sorted chapter list based on sort order
  const sortedChapters = useMemo(() => {
    const list = [...chapters];
    list.sort((a, b) => {
      const aNum = Number(a.chapter_number) || 0;
      const bNum = Number(b.chapter_number) || 0;
      return sortOrder === "asc" ? aNum - bNum : bNum - aNum;
    });
    return list;
  }, [chapters, sortOrder]);

  // Calculate 50-chapter ranges
  const ranges = useMemo(() => {
    if (sortedChapters.length === 0) return [];
    const chunks: { label: string; startIndex: number; endIndex: number }[] = [];
    for (let i = 0; i < sortedChapters.length; i += CHUNK_SIZE) {
      const end = Math.min(i + CHUNK_SIZE, sortedChapters.length);
      const firstCh = sortedChapters[i].chapter_number;
      const lastCh = sortedChapters[end - 1].chapter_number;
      const label = `Ch. ${firstCh} – ${lastCh}`;
      chunks.push({ label, startIndex: i, endIndex: end });
    }
    return chunks;
  }, [sortedChapters]);

  // Slice visible chapters for active range
  const visibleChapters = useMemo(() => {
    const range = ranges[selectedRangeIndex];
    if (!range) return sortedChapters.slice(0, CHUNK_SIZE);
    return sortedChapters.slice(range.startIndex, range.endIndex);
  }, [sortedChapters, ranges, selectedRangeIndex]);

  const toggleSort = () => {
    setSortOrder((prev) => (prev === "desc" ? "asc" : "desc"));
    setSelectedRangeIndex(0);
  };

  useEffect(() => {
    try {
      const libraryStr = localStorage.getItem("senpai_library");
      if (libraryStr) {
        const library = JSON.parse(libraryStr) as Array<string | { slug?: string; id?: string }>;
        setSaved(library.some((m) => typeof m === "string" ? m === manga.id : m.slug === manga.id || m.id === manga.id));
      }
    } catch {}
  }, [manga.id]);

  const toggleSave = () => {
    try {
      const libraryStr = localStorage.getItem("senpai_library");
      let library = (libraryStr ? JSON.parse(libraryStr) : []) as Array<string | { slug?: string; id?: string; title?: string }>;

      if (saved) {
        library = library.filter((m) => typeof m === "string" ? m !== manga.id : (m.slug !== manga.id && m.id !== manga.id));
        setSaved(false);
      } else {
        const mangaObj = {
          slug: manga.id,
          title: manga.title,
          altTitle: "",
          description: manga.description || "",
          genres: manga.genres || ["Action"],
          status: manga.status || "Ongoing",
          cover_url: manga.cover_url,
          latestChapter: chapters.length > 0 ? Math.max(...chapters.map(c => c.chapter_number)) : 1,
        };
        library.push(mangaObj);
        setSaved(true);
      }
      localStorage.setItem("senpai_library", JSON.stringify(library));
      window.dispatchEvent(new CustomEvent("senpai_library_updated"));
    } catch {}
  };

  const REVIEWS = [
    { user: "akira_dx", avatar: "https://images.unsplash.com/photo-1599566150163-29194dcaad36?w=40&h=40&fit=crop&auto=format", rating: 10, text: "Absolutely mind-blowing. Every chapter leaves you speechless. The art is insane and the story hits different. 10/10 no contest.", likes: 428, time: "3 days ago" },
    { user: "luna_void", avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=40&h=40&fit=crop&auto=format", rating: 9, text: "One of the best stories I've read in years. The character development is incredible and the world-building is unmatched.", likes: 312, time: "1 week ago" },
  ];

  return (
    <div className="text-foreground font-exo pb-16 md:pb-8">
      {/* Banner */}
      <div className="relative h-52 overflow-hidden">
        <img src={manga.cover_url} alt={manga.title} referrerPolicy="no-referrer" className="w-full h-full object-cover opacity-30" />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#0F1117]/80 to-[#0F1117]" />
        
        {/* Breadcrumb */}
        <div className="absolute top-4 left-4 md:left-8 flex items-center gap-2 text-xs text-muted-foreground font-noto">
          <Link href="/" className="hover:text-white transition-colors">Home</Link>
          <ChevronRight size={12} />
          <Link href="/discover" className="hover:text-white transition-colors">Explore</Link>
          <ChevronRight size={12} />
          <span className="text-white truncate max-w-[150px] sm:max-w-xs">{manga.title}</span>
        </div>
      </div>

      {/* Main info */}
      <div className="px-4 md:px-8 -mt-16 md:-mt-12 relative z-10 max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row gap-6">
          {/* Cover */}
          <div className="flex-shrink-0 mx-auto md:mx-0 rounded-2xl overflow-hidden shadow-2xl w-40 md:w-[180px] h-56 md:h-[250px] border-2 border-primary/40">
            <img src={manga.cover_url} alt={manga.title} referrerPolicy="no-referrer" className="w-full h-full object-cover" />
          </div>

          {/* Info */}
          <div className="flex-1 pt-4 md:pt-16 text-center md:text-left">
            <div className="flex items-center justify-center md:justify-start gap-2 mb-3 flex-wrap">
              <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-red-500/20 text-primary border border-red-500/40">
                Manga
              </span>
              {genres.map((g: string) => (
                <Link key={g} href={`/discover?genre=${g}`}
                  className="px-2 py-0.5 rounded text-[10px] font-semibold bg-white/5 text-muted-foreground border border-white/10 hover:text-white transition-colors">
                  {g}
                </Link>
              ))}
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${manga.status === "Ongoing" ? "bg-emerald-500/15 text-emerald-500" : "bg-white/5 text-muted-foreground"}`}>
                {manga.status || "Ongoing"}
              </span>
            </div>

            <h1 className="text-2xl md:text-3xl font-black text-white mb-1 font-rajdhani">{manga.title}</h1>
            {manga.alt_title && <p className="text-sm text-muted-foreground mb-4 font-noto">{manga.alt_title}</p>}

            <div className="flex items-center justify-center md:justify-start gap-4 md:gap-6 mb-5 flex-wrap">
              <div className="flex items-center gap-1.5">
                <Star size={16} className="fill-yellow-400 text-yellow-400" />
                <span className="text-lg md:text-xl font-black text-yellow-400 font-rajdhani">{manga.rating || 4.8}</span>
                <span className="text-xs text-muted-foreground">/ 10</span>
              </div>
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <BookOpen size={14} /> <span>{chapters.length} Chapters</span>
              </div>
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Eye size={14} /> <span>{manga.views || '12.4K'} Views</span>
              </div>
            </div>

            <div className="flex items-center justify-center md:justify-start gap-3 flex-wrap">
              <button onClick={() => router.push(`/manga/${manga.id}/${startChapter}`)}
                className="flex items-center gap-2 px-6 py-3 rounded-xl font-black text-white transition-all hover:scale-105 bg-primary shadow-[0_0_24px_rgba(255,46,46,0.4)] font-rajdhani text-[15px]">
                <Play size={17} className="fill-white" /> Start Reading
              </button>
              <button onClick={() => router.push(`/manga/${manga.id}/${latestChapter}`)}
                className="hidden sm:flex items-center gap-2 px-5 py-3 rounded-xl font-semibold text-sm transition-all hover:bg-white/10 bg-white/5 border border-white/10">
                Latest Chapter
              </button>
              <button onClick={toggleSave}
                className={`w-10 md:w-12 h-10 md:h-12 rounded-xl flex items-center justify-center transition-all border ${saved ? 'bg-primary/15 border-primary/40' : 'bg-white/5 border-white/10 hover:bg-white/10'}`}>
                <Bookmark size={17} className={saved ? "fill-red-500 text-red-500" : ""} />
              </button>
              <button 
                onClick={handleShare}
                title="Share this manga"
                className={`w-10 md:w-12 h-10 md:h-12 rounded-xl flex items-center justify-center transition-all border ${
                  shareCopied ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400' : 'bg-white/5 border-white/10 hover:bg-white/10 text-white'
                }`}
              >
                {shareCopied ? <Check size={17} /> : <Share2 size={17} />}
              </button>
            </div>
            {shareCopied && (
              <div className="mt-2 text-xs font-bold text-emerald-400 flex items-center justify-center md:justify-start gap-1 animate-in fade-in">
                <Check size={13} /> Link copied to clipboard!
              </div>
            )}
          </div>

          {/* Related manga */}
          <div className="hidden lg:block flex-shrink-0 w-52 pt-16">
            <h3 className="text-sm font-black mb-3 text-white font-rajdhani">Related Manga</h3>
            <div className="flex flex-col gap-2">
              {related.map((r: any) => (
                <Link href={`/manga/${r.id}`} key={r.id} className="flex items-center gap-2 p-2 rounded-xl group transition-all hover:bg-white/5">
                  <div className="w-8 h-10 rounded-lg overflow-hidden flex-shrink-0 bg-gray-800">
                    <img src={r.cover_url} alt={r.title} className="w-full h-full object-cover" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[11px] font-bold text-white group-hover:text-primary transition-colors truncate">{r.title}</div>
                    <div className="text-[9px] text-muted-foreground truncate">{r.genres?.[0] || "Action"}</div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mt-8 mb-6 p-1 rounded-xl w-full sm:w-fit bg-black/30 overflow-x-auto no-scrollbar">
          {(["chapters", "info", "reviews"] as const).map((tab) => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`flex-1 sm:flex-none px-5 py-2.5 rounded-lg text-sm font-bold capitalize transition-all ${activeTab === tab ? 'bg-primary text-white shadow-[0_0_12px_rgba(255,46,46,0.4)]' : 'bg-transparent text-muted-foreground hover:text-white'}`}>
              {tab}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="pb-10">
          {/* Chapters */}
          {activeTab === "chapters" && (
            <div className="max-w-2xl">
              {/* Header Controls: Total Count, Range Dropdown, Sort Toggle */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 p-3 rounded-2xl bg-white/[0.02] border border-white/5">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-white font-rajdhani">
                    {chapters.length} Chapters
                  </span>
                  <span className="text-xs text-muted-foreground font-noto">
                    (Showing {visibleChapters.length})
                  </span>
                </div>

                <div className="flex items-center gap-2.5 flex-wrap">
                  {/* Range Dropdown (Only show if multiple ranges exist) */}
                  {ranges.length > 1 && (
                    <div className="relative flex items-center">
                      <select
                        value={selectedRangeIndex}
                        onChange={(e) => setSelectedRangeIndex(Number(e.target.value))}
                        aria-label="Select chapter range"
                        className="appearance-none cursor-pointer pl-3 pr-8 py-1.5 rounded-xl text-xs font-bold bg-[#161B22] text-white border border-white/10 hover:border-primary/40 focus:border-primary focus:outline-none transition-all"
                      >
                        {ranges.map((range, idx) => (
                          <option key={range.label} value={idx} className="bg-[#161B22] text-white">
                            {range.label}
                          </option>
                        ))}
                      </select>
                      <ChevronDown size={14} className="absolute right-2.5 pointer-events-none text-muted-foreground" />
                    </div>
                  )}

                  {/* Sort Order Toggle */}
                  <button 
                    onClick={toggleSort}
                    className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-xl bg-red-500/10 text-primary border border-red-500/25 hover:bg-red-500/20 transition-all active:scale-95"
                    title={sortOrder === "asc" ? "Sorted Oldest First" : "Sorted Newest First"}
                  >
                    <ArrowUpDown size={13} />
                    <span>{sortOrder === "asc" ? "Oldest (1 → N)" : "Newest (N → 1)"}</span>
                  </button>
                </div>
              </div>

              {/* Top Banner Ad */}
              <div className="mb-4">
                <AdSlot placement="manga-detail" />
              </div>

              {/* Chapter Rows */}
              <div className="flex flex-col gap-2">
                {visibleChapters.map((ch: DetailChapter) => {
                  const isFastPass = isChapterFastPass(ch.chapter_number, latestChapter, chapters.length);
                  const isUnlocked = unlockedChapters.includes(ch.chapter_number);
                  const isLockedFastPass = isFastPass && !isUnlocked;

                  return (
                    <Link 
                      key={ch.chapter_number}
                      href={`/manga/${manga.id}/${ch.chapter_number}`}
                      onClick={(e) => {
                        if (isLockedFastPass) {
                          e.preventDefault();
                          setFastPassModalChapter(ch.chapter_number);
                          setIsFastPassModalOpen(true);
                        }
                      }}
                      className={`flex items-center gap-3 md:gap-4 p-3 md:p-4 rounded-xl group transition-all hover:scale-[1.01] border ${
                        isLockedFastPass 
                          ? 'bg-[#181512]/90 border-yellow-500/20 hover:border-yellow-500/40'
                          : 'bg-[#161B22]/80 border-white/5 hover:border-primary/25'
                      }`}
                    >
                      <div className="w-12 md:w-14 text-center md:text-right">
                        <span className={`text-xs md:text-sm font-black font-jetbrains ${isLockedFastPass ? 'text-yellow-400' : 'text-primary'}`}>
                          Ch.{ch.chapter_number}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-white group-hover:text-primary transition-colors truncate">
                          {ch.title || `Chapter ${ch.chapter_number}`}
                        </div>
                        <div className="text-[10px] text-muted-foreground mt-0.5 truncate">
                          {ch.pages || 20} pages
                        </div>
                      </div>

                      {/* FastPass / New Status Badges */}
                      {isLockedFastPass ? (
                        <span className="flex items-center gap-1 text-[9px] font-black px-2 py-0.5 rounded-lg bg-yellow-400/10 text-yellow-400 border border-yellow-400/30 shadow-[0_0_10px_rgba(250,204,21,0.15)]">
                          <Zap size={11} className="fill-yellow-400" />
                          <span>FastPass</span>
                        </span>
                      ) : isFastPass && isUnlocked ? (
                        <span className="flex items-center gap-1 text-[9px] font-black px-2 py-0.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                          <Unlock size={11} />
                          <span>Unlocked</span>
                        </span>
                      ) : ch.chapter_number > latestChapter - 2 ? (
                        <span className="hidden sm:inline-block text-[9px] font-black px-1.5 py-0.5 rounded bg-primary text-white">
                          NEW
                        </span>
                      ) : null}

                      <ChevronRight size={15} className={`transition-colors flex-shrink-0 ${isLockedFastPass ? 'text-yellow-500/70 group-hover:text-yellow-400' : 'text-muted-foreground group-hover:text-primary'}`} />
                    </Link>
                  );
                })}
              </div>
            </div>
          )}

          {/* Info */}
          {activeTab === "info" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-3xl">
              <div>
                <h3 className="text-sm font-black text-white mb-3 flex items-center gap-2 font-rajdhani">
                  <BookOpen size={15} className="text-primary" /> Synopsis
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed font-noto">{manga.description || "No synopsis available."}</p>
              </div>
              <div>
                <h3 className="text-sm font-black text-white mb-3 flex items-center gap-2 font-rajdhani">
                  <User size={15} className="text-primary" /> Details
                </h3>
                <div className="space-y-3">
                  {[
                    { label: "Author", value: manga.author || "Official Author / Studio", icon: User },
                    { label: "Artist", value: manga.artist || "Official Artist", icon: Palette },
                    { label: "Status", value: manga.status || "Ongoing", icon: TrendingUp },
                    { label: "Genres", value: genres.join(", "), icon: Star },
                  ].map(({ label, value, icon: Icon }) => (
                    <div key={label} className="flex items-start gap-3">
                      <Icon size={14} className="mt-0.5 flex-shrink-0 text-muted-foreground" />
                      <div>
                        <div className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</div>
                        <div className="text-sm text-white font-medium">{value}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Video Ad Unit inside Info Tab */}
              <div className="col-span-full mt-4">
                <VideoAdUnit title={`Sponsor Spotlight: Trending Anime & Manga Universe`} />
              </div>
            </div>
          )}

          {/* Reviews */}
          {activeTab === "reviews" && (
            <div className="max-w-2xl space-y-4">
              {/* Community Review Header & Form Trigger */}
              <div className="p-4 md:p-5 rounded-2xl bg-[#161B22]/90 border border-white/5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Star size={16} className="text-yellow-400 fill-yellow-400" />
                    <span className="text-sm font-bold text-white font-rajdhani">Community Ratings & Reviews</span>
                  </div>
                  <button
                    onClick={() => setShowReviewForm(!showReviewForm)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl sd-gradient text-white text-xs font-bold shadow-md shadow-primary/20 transition-all hover:scale-105"
                  >
                    <MessageSquarePlus size={13} />
                    <span>{showReviewForm ? "Close Form" : "Write Review"}</span>
                  </button>
                </div>

                {showReviewForm && (
                  <form onSubmit={handlePostReview} className="mt-4 pt-4 border-t border-white/5 space-y-3">
                    <div className="flex flex-col sm:flex-row gap-3">
                      <input
                        type="text"
                        placeholder="Your Name (e.g. AnimeSenpai)"
                        value={newReviewName}
                        onChange={(e) => setNewReviewName(e.target.value)}
                        className="flex-1 px-3 py-2 rounded-xl bg-black/40 border border-white/10 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-primary/50"
                      />
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-zinc-400">Score:</span>
                        <select
                          value={newReviewRating}
                          onChange={(e) => setNewReviewRating(Number(e.target.value))}
                          className="px-3 py-2 rounded-xl bg-black/40 border border-white/10 text-xs font-bold text-yellow-400 focus:outline-none focus:border-primary/50"
                        >
                          {[10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map((n) => (
                            <option key={n} value={n} className="bg-[#161B22] text-white">
                              {n} / 10 ⭐
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <textarea
                      placeholder={`What did you think of ${manga.title}? Write your thoughts...`}
                      rows={3}
                      value={newReviewText}
                      onChange={(e) => setNewReviewText(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl bg-black/40 border border-white/10 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-primary/50 font-noto leading-relaxed"
                    />

                    <div className="flex justify-end">
                      <button
                        type="submit"
                        className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary hover:bg-red-500 text-white text-xs font-black shadow-lg shadow-primary/30 transition-all active:scale-95"
                      >
                        <Send size={12} />
                        <span>Publish Review</span>
                      </button>
                    </div>
                  </form>
                )}
              </div>

              {/* Reviews List */}
              {reviewsList.map((r) => {
                const isLiked = liked.has(r.id);
                return (
                  <div key={r.id} className="p-4 md:p-5 rounded-2xl bg-[#161B22]/80 border border-white/5">
                    <div className="flex items-start gap-3 mb-3">
                      <div className="w-9 h-9 rounded-full overflow-hidden bg-gray-800 flex-shrink-0">
                        <img src={r.avatar} alt={r.user} className="w-full h-full object-cover" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-bold text-white truncate">{r.user}</span>
                          <span className="text-[10px] text-muted-foreground">{r.time}</span>
                        </div>
                        <div className="flex items-center gap-1 mt-0.5">
                          {Array.from({ length: 5 }).map((_, j) => (
                            <Star key={j} size={10} className={j < (r.rating / 2) ? "fill-yellow-400 text-yellow-400" : "text-gray-700"} />
                          ))}
                          <span className="text-[10px] text-yellow-400 font-bold ml-1">{r.rating}/10</span>
                        </div>
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground leading-relaxed mb-3 font-noto">{r.text}</p>
                    <button 
                      onClick={() => setLiked((p) => {
                        const n = new Set(p);
                        if (n.has(r.id)) n.delete(r.id);
                        else n.add(r.id);
                        return n;
                      })}
                      className={`flex items-center gap-1.5 text-[11px] transition-all ${isLiked ? "text-primary font-bold" : "text-muted-foreground hover:text-white"}`}
                    >
                      <ThumbsUp size={12} className={isLiked ? "fill-red-500" : ""} />
                      {r.likes + (isLiked ? 1 : 0)} helpful
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* FastPass Rewarded Unlock Modal */}
      {fastPassModalChapter !== null && (
        <FastPassUnlockModal
          isOpen={isFastPassModalOpen}
          onClose={() => setIsFastPassModalOpen(false)}
          mangaId={manga.id}
          mangaTitle={manga.title}
          mangaCoverUrl={manga.cover_url}
          chapterNumber={fastPassModalChapter}
          onUnlocked={() => {
            setIsFastPassModalOpen(false);
            router.push(`/manga/${manga.id}/${fastPassModalChapter}`);
          }}
        />
      )}
    </div>
  );
}
