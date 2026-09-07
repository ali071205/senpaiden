"use client";

import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import senpaiDenLogo from "@/assets/img/logo.png";
import newChapterLogo from "@/assets/img/new-chapter-logo.png";
import { getUnreadNotificationCount, NOTIFICATIONS_UPDATED_EVENT } from "@/lib/notifications";
import { getLevel, getReaderProgression, PROGRESSION_UPDATED_EVENT } from "@/lib/reader-progression";
import { AUTH_UPDATED_EVENT, getStoredAccount, isSignedIn } from "@/lib/auth-storage";
import { OPEN_CONSENT_EVENT } from "@/lib/consent";
import { StickyAnchorAd } from "@/components/StickyAnchorAd";
import {
  Home, LayoutGrid, RefreshCw, Bookmark, History,
  Search, Bell,
  ChevronRight, Crown, Shield, UserRound,
  Moon, Sun, Laptop
} from "lucide-react";

const SIDEBAR_ITEMS = [
  { icon: Home, label: "Home", path: "/" },
  { icon: LayoutGrid, label: "Categories", path: "/discover?genre=Action" },
  { icon: RefreshCw, label: "Latest Releases", path: "/discover?sort=updated" },
  { icon: Bookmark, label: "Library", path: "/library" },
  { icon: History, label: "History", path: "/history" },
];



function ActiveLinkHandler({
  setHasGenre,
  setHasSort,
  setSearch,
}: {
  setHasGenre: (v: boolean) => void;
  setHasSort: (v: boolean) => void;
  setSearch: (v: string) => void;
}) {
  const searchParams = useSearchParams();
  useEffect(() => {
    setHasGenre(searchParams.has("genre"));
    setHasSort(searchParams.get("sort") === "updated");
    setSearch(searchParams.get("q") || "");
  }, [searchParams, setHasGenre, setHasSort, setSearch]);
  return null;
}

export function SiteLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [hasGenre, setHasGenre] = useState(false);
  const [hasSort, setHasSort] = useState(false);
  const [search, setSearch] = useState("");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [accountName, setAccountName] = useState("Senpai");
  const [signedIn, setSignedIn] = useState(false);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [readerLevel, setReaderLevel] = useState(1);

  const isReader = pathname.match(/^\/manga\/[^/]+\/[^/]+(\/.*)?$/);

  useEffect(() => {
    const syncProgression = () => setReaderLevel(getLevel(getReaderProgression().totalExp));
    syncProgression();
    window.addEventListener(PROGRESSION_UPDATED_EVENT, syncProgression);
    window.addEventListener("storage", syncProgression);
    return () => {
      window.removeEventListener(PROGRESSION_UPDATED_EVENT, syncProgression);
      window.removeEventListener("storage", syncProgression);
    };
  }, []);

  useEffect(() => {
    const syncNotifications = () => setUnreadNotifications(getUnreadNotificationCount());
    syncNotifications();
    window.addEventListener(NOTIFICATIONS_UPDATED_EVENT, syncNotifications);
    window.addEventListener("storage", syncNotifications);
    return () => {
      window.removeEventListener(NOTIFICATIONS_UPDATED_EVENT, syncNotifications);
      window.removeEventListener("storage", syncNotifications);
    };
  }, []);

  useEffect(() => {
    const syncAccountName = () => {
      const active = isSignedIn();
      const account = active ? getStoredAccount() : null;
      setSignedIn(active);
      setAccountName(account?.displayName?.trim() || "Senpai");
    };

    syncAccountName();
    window.addEventListener("senpai-account-updated", syncAccountName);
    window.addEventListener(AUTH_UPDATED_EVENT, syncAccountName);
    window.addEventListener("storage", syncAccountName);
    return () => { window.removeEventListener("senpai-account-updated", syncAccountName); window.removeEventListener(AUTH_UPDATED_EVENT, syncAccountName); window.removeEventListener("storage", syncAccountName); };
  }, []);

  useEffect(() => {
    if (isReader) return;

    const nextQuery = search.trim();
    const timer = setTimeout(() => {
      if (!nextQuery && pathname !== "/") return;

      const targetUrl = nextQuery ? `/?q=${encodeURIComponent(nextQuery)}` : "/";
      const currentUrl = `${pathname}${typeof window !== "undefined" ? window.location.search : ""}`;

      if (currentUrl !== targetUrl) {
        router.replace(targetUrl, { scroll: false });
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [isReader, pathname, router, search]);

  const isActive = (path: string) => {
    if (path === "/" && pathname === "/") return true;
    
    if (pathname === "/discover") {
      const isCategoriesLink = path.includes("genre=");
      const isLatestLink = path.includes("sort=updated");
      const isSearchLink = path === "/discover";

      if (isCategoriesLink && hasGenre) return true;
      if (isLatestLink && hasSort) return true;
      if (isSearchLink && !hasGenre && !hasSort) return true;
      
      return false;
    }

    const basePath = path.split('?')[0];
    if (basePath !== "/" && pathname.startsWith(basePath)) return true;
    
    return false;
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (search.trim()) {
      router.replace(`/?q=${encodeURIComponent(search.trim())}`, { scroll: false });
    }
  };

  return (
    <div className="min-h-screen w-full flex font-exo bg-background text-foreground relative">
      <Suspense fallback={null}>
        <ActiveLinkHandler setHasGenre={setHasGenre} setHasSort={setHasSort} setSearch={setSearch} />
      </Suspense>
      {/* Ambient glows */}
      <div className="fixed inset-0 pointer-events-none z-0 hidden md:block">
        <div className="absolute top-0 left-1/3 w-[700px] h-[500px] rounded-full opacity-[0.06]"
          style={{ background: "radial-gradient(circle, #FF2E2E 0%, transparent 70%)" }} />
        <div className="absolute bottom-1/2 right-1/4 w-[400px] h-[400px] rounded-full opacity-[0.04]"
          style={{ background: "radial-gradient(circle, #7C3AED 0%, transparent 70%)" }} />
      </div>



      {/* MOBILE TOP NAV (Visible only on small screens) */}
      {!isReader && (
      <nav className="md:hidden fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 h-14 gap-2 bg-[#0F1117]/95 backdrop-blur-xl border-b border-red-500/10">
        
        <Link href="/" className="flex items-center gap-2 -ml-1">
          <img src={senpaiDenLogo.src} alt="SenpaiDen Logo" className="h-8 w-auto object-contain" />
        </Link>

        <div className="flex items-center gap-4">
          <Link href={signedIn ? "/account" : "/login"} aria-label={signedIn ? "Account" : "Log in"} className="flex items-center gap-2 shrink-0 transition-opacity hover:opacity-80 -mr-1">
            {signedIn ? <>
            <div className="flex items-center justify-center bg-white/5 border border-white/10 rounded-full px-2 py-0.5 text-[10px] font-bold text-zinc-300">
              Lv. {readerLevel}
            </div>
            <div className="w-7 h-7 rounded-full overflow-hidden bg-zinc-800 border border-white/10">
              <img src="https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=40&h=40&fit=crop&auto=format" alt="Account" className="w-full h-full object-cover" />
            </div>
            </> : <span className="rounded-xl bg-primary px-3 py-2 text-xs font-black text-white">Log in</span>}
          </Link>
        </div>
      </nav>
      )}

      {/* DESKTOP SIDEBAR */}
      {!isReader && (
      <aside className="hidden md:flex fixed left-0 top-0 bottom-0 w-[260px] flex-col z-50 bg-[#0F1117]/95 backdrop-blur-xl border-r border-white/5 overflow-y-auto no-scrollbar pb-6">
        {/* LOGO */}
        <Link href="/" className="flex items-center justify-center gap-3 px-4 py-4 shrink-0 border-b border-white/5">
          <img src={senpaiDenLogo.src} alt="SenpaiDen Logo" className="w-full max-w-[200px] h-auto object-contain drop-shadow-[0_0_8px_rgba(255,46,46,0.3)]" />
        </Link>

        {/* MENU ITEMS */}
        <div className="flex-1 flex flex-col gap-1 px-4">
          {SIDEBAR_ITEMS.map((item, i) => {
            const Icon = item.icon;
            const reallyActive = isActive(item.path);

            return (
              <Link key={i} href={item.path}
                className="flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200"
                style={{
                  background: reallyActive ? "#FF2E2E" : "transparent",
                  color: reallyActive ? "white" : "#A1A1AA"
                }}>
                <Icon size={18} className={reallyActive ? "text-white" : "text-zinc-400"} />
                <span className="text-[13px] font-bold font-noto tracking-wide">{item.label}</span>
              </Link>
            );
          })}
          {/* Removed Upload Manga Button */}
        </div>

        {/* NEW CHAPTER LOGO */}
        <div className="mt-8 px-4 relative mb-2 flex-shrink-0 flex justify-center">
          <img src={newChapterLogo.src} alt="New Chapter" className="w-full scale-110 h-auto object-contain drop-shadow-[0_0_15px_rgba(255,46,46,0.15)]" />
        </div>

        {/* FOOTER */}
        <div className="mt-auto px-6 pt-4 flex flex-col gap-5 flex-shrink-0">
           <div>
              <p className="text-[9px] text-zinc-600 font-medium leading-tight mb-3">
                © 2026 SenpaiDen<br />All rights reserved.
              </p>
              <div className="flex items-center gap-1 bg-white/5 rounded-full p-1 w-fit">
                 <button className="p-1.5 rounded-full bg-white/10 text-white shadow-sm"><Moon size={12} /></button>
                 <button className="p-1.5 rounded-full text-zinc-500 hover:text-white"><Sun size={12} /></button>
                 <button className="p-1.5 rounded-full text-zinc-500 hover:text-white"><Laptop size={12} /></button>
                 <div className="w-px h-3 bg-white/10 mx-1" />
                 <Link href="/admin" className="p-1.5 rounded-full text-zinc-500 hover:text-primary transition-colors">
                   <Shield size={12} />
                 </Link>
              </div>
           </div>
        </div>
      </aside>
      )}

      {/* MOBILE BOTTOM NAV */}
      {!isReader && (
      <nav className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-[#0F1117]/95 backdrop-blur-xl border-t border-primary/10 z-50 flex items-center justify-around px-2 pb-safe">
        {SIDEBAR_ITEMS.slice(0, 5).map((item, i) => {
           const Icon = item.icon;
           const reallyActive = isActive(item.path);
           const shortLabel = item.label === "Latest Releases" ? "Latest" : item.label;
           return (
              <Link key={i} href={item.path} className="flex flex-col items-center justify-center min-w-[48px] h-12 gap-1 relative">
                <Icon size={20} style={{ color: reallyActive ? "#FF2E2E" : "#8892a4" }} />
                {reallyActive && (
                  <span className="absolute -top-1 w-1 h-1 rounded-full bg-primary shadow-[0_0_8px_#FF2E2E]" />
                )}
                <span className="text-[9px] font-semibold text-center whitespace-nowrap" style={{ color: reallyActive ? "#FF2E2E" : "#8892a4" }}>{shortLabel}</span>
              </Link>
           )
        })}
      </nav>
      )}

      {/* MOBILE SIDE MENU OVERLAY */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" onClick={() => setMobileMenuOpen(false)}>
          <div className="absolute top-14 left-0 bottom-0 w-64 bg-[#0F1117] border-r border-primary/10 flex flex-col py-4 overflow-y-auto" onClick={(e) => e.stopPropagation()}>
             {SIDEBAR_ITEMS.map((item, i) => (
                <Link key={i} href={item.path} onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-4 px-6 py-3 hover:bg-white/5 transition-colors">
                   <item.icon size={20} className={isActive(item.path) ? "text-primary" : "text-muted-foreground"} />
                   <span className={`font-semibold ${isActive(item.path) ? "text-primary" : "text-foreground"}`}>{item.label}</span>
                </Link>
             ))}
             <div className="mx-4 my-2 h-px bg-white/5" />
             {[
               { icon: Bell, label: "Notifications", path: "/notifications" },
               { icon: UserRound, label: "Account", path: "/account" },
             ].map((item) => (
               <Link key={item.path} href={item.path} onClick={() => setMobileMenuOpen(false)} className="flex min-h-12 items-center gap-4 px-6 py-3 text-zinc-300 transition-colors hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/60">
                 <item.icon size={20} className={isActive(item.path) ? "text-primary" : "text-muted-foreground"} />
                 <span className={`font-semibold ${isActive(item.path) ? "text-primary" : "text-foreground"}`}>{item.label}</span>
                 {item.path === "/notifications" && unreadNotifications > 0 && <span className="ml-auto grid min-w-5 place-items-center rounded-full bg-primary px-1.5 text-[10px] font-black text-white">{unreadNotifications > 9 ? "9+" : unreadNotifications}</span>}
               </Link>
             ))}
          </div>
        </div>
      )}

      {/* MAIN CONTENT AREA */}
      <div className={`flex-1 flex flex-col min-h-screen ${!isReader ? "md:pl-[260px]" : "md:pl-0"} relative z-10 min-w-0 overflow-hidden`}>
        {/* DESKTOP TOP NAV */}
        {!isReader && (
        <header className="hidden md:flex h-[72px] items-center px-8 shrink-0 relative z-20">
          <form onSubmit={handleSearch} className="relative w-full max-w-[320px]">
            <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search manga..."
              className="w-full pl-10 pr-4 py-2.5 rounded-2xl text-[13px] text-foreground placeholder:text-zinc-500 outline-none transition-all font-noto bg-white/5 border border-white/5 hover:border-white/10 focus:border-primary/50 focus:bg-white/10"
            />
          </form>

          <div className="flex items-center gap-4 ml-auto">
            <Link href="/notifications" aria-label={`Open notifications${unreadNotifications ? `, ${unreadNotifications} unread` : ""}`} className="relative w-10 h-10 rounded-full flex items-center justify-center hover:bg-white/5 text-zinc-400 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60">
              <Bell size={18} />
              {unreadNotifications > 0 && <span className="absolute right-0.5 top-0.5 grid min-h-4 min-w-4 place-items-center rounded-full border-2 border-[#0F1117] bg-primary px-0.5 text-[8px] font-black leading-none text-white">{unreadNotifications > 9 ? "9+" : unreadNotifications}</span>}
            </Link>
            <Link href={signedIn ? "/account" : "/login"} aria-label={signedIn ? "Open account" : "Log in"} className="flex items-center gap-2 pl-2 cursor-pointer group rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60">
              {signedIn ? <>
              <div className="flex flex-col items-end">
                <span className="max-w-24 truncate text-[12px] font-bold text-white group-hover:text-primary transition-colors">{accountName}</span>
              </div>
              <div className="w-10 h-10 rounded-full overflow-hidden bg-zinc-800 border-2 border-white/10 group-hover:border-primary transition-colors">
                <img src="https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=40&h=40&fit=crop&auto=format" alt="User" className="w-full h-full object-cover" />
              </div>
              <ChevronRight size={14} className="text-zinc-500 ml-1 transition-transform group-hover:translate-x-0.5" />
              </> : <span className="inline-flex min-h-10 items-center rounded-xl bg-primary px-4 text-xs font-black text-white transition hover:bg-red-500">Log in</span>}
            </Link>
          </div>
        </header>
        )}
        
        {/* PAGE CONTENT */}
        <main className={`flex-1 overflow-x-hidden ${!isReader ? "pt-14 md:pt-0 pb-36 md:pb-16" : ""} w-full`}>
          {children}
          {!isReader && <footer className="mx-4 mt-10 border-t border-white/5 px-2 py-8 md:mx-8 md:flex md:items-center md:justify-between"><p className="text-xs text-zinc-600">© 2026 SenpaiDen. Reader-first manga discovery.</p><nav aria-label="Legal and company links" className="mt-4 flex flex-wrap gap-x-5 gap-y-3 md:mt-0">{[{ label: "About", href: "/about" }, { label: "Partners", href: "/partners" }, { label: "Contact", href: "/contact" }, { label: "Privacy", href: "/privacy" }, { label: "Cookies", href: "/cookies" }, { label: "Affiliate disclosure", href: "/affiliate-disclosure" }, { label: "Terms", href: "/terms" }, { label: "Copyright", href: "/copyright" }].map((item) => <Link key={item.href} href={item.href} className="min-h-11 py-3 text-xs font-bold text-zinc-500 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60">{item.label}</Link>)}<button onClick={() => window.dispatchEvent(new Event(OPEN_CONSENT_EVENT))} className="min-h-11 py-3 text-xs font-bold text-zinc-500 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60">Privacy choices</button></nav></footer>}
        </main>
      </div>

      {/* Floating Status Bar / Bottom Anchor Ad Banner */}
      {!isReader && <StickyAnchorAd />}
    </div>
  );
}
