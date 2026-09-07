# Ad Infrastructure & Script Specialist Audit Report (Explorer 1)

## 1. Observation

### 1.1 Core Ad Components & Script Infrastructure Inventory

A total of 8 core ad/monetization infrastructure files exist in the `frontend/` codebase:

1. **`frontend/src/components/AdSlot.tsx`** (Lines 1–133)
   - **Primary Responsibilities**: Dynamically renders Adsterra responsive iframe banners (728x90 desktop / 320x50 mobile) or native banner widgets.
   - **Configured Adsterra Keys & Endpoints** (Lines 13–16):
     ```typescript
     const ADSTERRA_DESKTOP_KEY = "2de4d4b4a2f675e5880e6d1004852c8b"; // 728x90
     const ADSTERRA_MOBILE_KEY = "e595c21e4de14999cdb8003e66163d4b";   // 320x50
     const ADSTERRA_NATIVE_CONTAINER = "container-d151fe0fbadd628be5d88b715d6a1e68";
     const ADSTERRA_NATIVE_SRC = "https://pl30953537.effectivecpmnetwork.com/d151fe0fbadd628be5d88b715d6a1e68/invoke.js";
     ```
   - **Script Execution Mechanism** (Lines 68–111):
     - Dynamically creates an `iframe` element (`width: 320 | 728`, `height: 50 | 90`, `frameBorder="0"`).
     - Uses `doc.open()`, `doc.write()`, and `doc.close()` to inject the inline `atOptions` config and `//www.highperformanceformat.com/${adKey}/invoke.js` script into the iframe.
     - For `variant === "native"`, creates `<div id="container-d151fe0fbadd628be5d88b715d6a1e68">` and injects `https://pl30953537.effectivecpmnetwork.com/d151fe0fbadd628be5d88b715d6a1e68/invoke.js`.
   - **Gating Logic Observed** (Lines 31–46):
     - Evaluates `canServeAdsInBrowser() && ADS_ENABLED && isEnabled`.
     - Unused import: `import { hasActivePremium } from "@/lib/reader-progression";` at line 11 is imported but never referenced in `sync()`.

2. **`frontend/src/components/MonetizationProvider.tsx`** (Lines 1–70)
   - **Primary Responsibilities**: Global script injector mounted in `RootLayout` (`frontend/src/app/layout.tsx` line 124).
   - **Global Scripts**:
     - Google AdSense: Injects `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=...` when `ADSENSE_CLIENT` is defined.
     - Adsterra Global Script (Social Bar / Popunder): Injects `process.env.NEXT_PUBLIC_ADSTERRA_SCRIPT_URL` when defined.
   - **Unused Import**: `hasActivePremium` is imported at line 11 but never called.

3. **`frontend/src/components/StickyAnchorAd.tsx`** (Lines 1–97)
   - **Primary Responsibilities**: Bottom sticky banner anchored above mobile bottom navigation bar or desktop bottom edge.
   - **Render Position**: Mounted globally in `SiteLayout.tsx` (Line 406), suppressed only on reader pages (`isReader`) or when `InterstitialAdModal` is open.
   - **CSS Positioning**: Fixed at `bottom-16 md:bottom-2`, left-0 right-0 (md:left-[260px]).
   - **Renders**: `<AdSlot placement="home-feed" className="!my-0 !border-0 !bg-transparent !p-0 !shadow-none" />`.

4. **`frontend/src/components/InterstitialAdModal.tsx`** (Lines 1–134)
   - **Primary Responsibilities**: Full-screen 5-second unskippable modal ad overlay with countdown timer.
   - **Storage Keys**: Uses `sessionStorage` (`senpai_library_interstitial_seen`, `senpai_history_interstitial_seen`).
   - **Renders**: `<AdSlot placement="home-feed" className="!my-0 !max-w-xl" />` inside modal dialog.

5. **`frontend/src/components/VideoAdUnit.tsx`** (Lines 1–134)
   - **Primary Responsibilities**: Simulated high-CPM video sponsor card.
   - **Current Implementation**: A mock video player with a fake setInterval progress bar, static Unsplash image (`photo-1578632767115-351597cf2477`), and hardcoded link to `https://senpaiden.vercel.app`.

6. **`frontend/src/lib/monetization.ts`** (Lines 1–59)
   - **Environment Variables & Toggles**:
     - `ADS_ENABLED`: `process.env.NEXT_PUBLIC_ADS_ENABLED === "true"` (default `false` in `.env.example`).
     - `ADS_PREVIEW`: `process.env.NEXT_PUBLIC_ADS_PREVIEW === "true"`.
     - `AD_PLACEMENT_ENABLED`: 9 placement switches (`home-feed`, `discover-grid`, `manga-detail`, `reader-top`, `reader-bottom`, `library-bottom`, `history-bottom`, `notifications-bottom`, `discover-bottom`), all defaulting to `true` unless explicitly set to `"false"`.

7. **`frontend/src/lib/consent.ts` & `CookieConsent.tsx`**
   - Granular privacy consent manager storing `senpaiden_consent_v1` in `localStorage` and dispatching `senpaiden-consent-updated`.

8. **`frontend/src/app/ads.txt/route.ts`** (Lines 1–7)
   - Serves Google AdSense `google.com, ${publisherId}, DIRECT, f08c47fec0942fa0`. Inactive if AdSense client is empty.

---

### 1.2 Comprehensive File Inventory of All Ad Usages Across Pages

| # | File Path | Line(s) | Ad Unit / Placement | Render Type & Position | Layout / Container Constraints | Observed Issues |
|---|---|---|---|---|---|---|
| 1 | `frontend/src/app/page.tsx` | 182 | `AdSlot` (`home-feed`) | In-Page Banner (between Recommended and Trending) | `max-w-7xl px-4 md:px-8` | Natural section break. Good placement. |
| 2 | `frontend/src/app/page.tsx` | 193 | `AdSlot` (`home-feed`) | In-Feed Grid (every 6 cards in Trending) | `col-span-full my-3` inside CSS grid | Disrupts 8-column card grid rhythm. |
| 3 | `frontend/src/app/page.tsx` | 203 | `VideoAdUnit` | Video Sponsor Card (between Trending & Updated) | `max-w-7xl px-4 md:px-8` | Fake mock video player with dummy link. |
| 4 | `frontend/src/app/discover/page.tsx` | 120 | `AdSlot` (`discover-grid`) | In-Feed Grid (every 6 cards in Discover) | `col-span-full my-3` inside CSS grid | Causes up to 4 in-grid ad breaks in 24 items. |
| 5 | `frontend/src/app/discover/page.tsx` | 127 | `AdSlot` (`discover-grid`) | In-Page Banner (above pagination) | `mt-8` | Redundant with line 169. |
| 6 | `frontend/src/app/discover/page.tsx` | 169 | `AdSlot` (`discover-bottom`) | In-Page Banner (below pagination) | `mt-8 border-t border-white/5 pt-8` | Natural break at bottom of page. |
| 7 | `frontend/src/app/search/page.tsx` | 138 | `AdSlot` (`discover-grid`) | In-Feed Grid (every 6 search results) | `col-span-full my-3` inside CSS grid | Injects multiple ads into search results. |
| 8 | `frontend/src/app/manga/[id]/page.tsx` | 115 | `AdSlot` (`manga-detail`) | In-Page Banner (bottom of detail page) | `max-w-6xl px-4 pb-10 md:px-8` | Natural break after content. |
| 9 | `frontend/src/app/manga/[id]/MangaDetailClient.tsx` | 238 | `AdSlot` (`manga-detail`) | Desktop Right Sidebar | `w-52` container (= 208px wide) | **CRITICAL CLS DEFECT**: 728x90 desktop banner forced into 208px box, causing severe horizontal overflow/clipping! |
| 10 | `frontend/src/app/manga/[id]/MangaDetailClient.tsx` | 303 | `AdSlot` (`manga-detail`) | In-Page Banner (above chapter list) | Keyed on `range-ad-${selectedRangeIndex}-${sortOrder}` | Forces full ad reload on chapter filter clicks. |
| 11 | `frontend/src/app/manga/[id]/MangaDetailClient.tsx` | 341 | `AdSlot` (`manga-detail`) | In-Feed List (every 10 chapters) | `my-1.5` inside chapter list | Injects ads inside active chapter navigation list. |
| 12 | `frontend/src/app/manga/[id]/MangaDetailClient.tsx` | 383 | `VideoAdUnit` | Video Sponsor (inside Info tab) | `col-span-full mt-4` | Mock video component. |
| 13 | `frontend/src/app/library/page.tsx` | 53 | `InterstitialAdModal` | Full-screen 5s Blocking Modal | `fixed inset-0 z-[150]` | **INTRUSIVE UX**: Blocks user when accessing personal saved library! |
| 14 | `frontend/src/app/library/page.tsx` | 97 | `AdSlot` (`library-bottom`) | In-Feed Grid (every 6 library items) | `col-span-full my-3` inside CSS grid | Injects ads inside user's private library. |
| 15 | `frontend/src/app/library/page.tsx` | 106 | `AdSlot` (`library-bottom`) | In-Page Banner (bottom of library) | `mt-10 border-t border-white/5 pt-8` | Natural bottom placement. |
| 16 | `frontend/src/app/history/page.tsx` | 136 | `InterstitialAdModal` | Full-screen 5s Blocking Modal | `fixed inset-0 z-[150]` | **INTRUSIVE UX**: Blocks user when checking reading history! |
| 17 | `frontend/src/app/history/page.tsx` | 180 | `AdSlot` (`history-bottom`) | In-Feed Grid (every 6 history items) | `col-span-full my-3` inside CSS grid | Injects ads into history list. |
| 18 | `frontend/src/app/history/page.tsx` | 189 | `AdSlot` (`history-bottom`) | In-Page Banner (bottom of history) | `mt-10 border-t border-white/5 pt-8` | Natural bottom placement. |
| 19 | `frontend/src/app/notifications/page.tsx` | 80 | `AdSlot` (`notifications-bottom`) | In-List (every 4 notifications) | `border-b border-white/5 p-3` | Clutters notification inbox. |
| 20 | `frontend/src/app/notifications/page.tsx` | 87 | `AdSlot` (`notifications-bottom`) | In-Page Banner (bottom of notifications) | `mt-8 border-t border-white/5 pt-8` | Clean bottom boundary. |
| 21 | `frontend/src/components/MangaReaderContainer.tsx` | 591 | `AdSlot` (`reader-top`) | Reader Top Banner (above manga pages) | `max-w-3xl px-4 pt-16 pb-3` | **CLS & UX DEFECT**: Hydration pop-in shifts manga reading start position down! |
| 22 | `frontend/src/components/MangaReaderContainer.tsx` | 708 | `AdSlot` (`reader-bottom`) | Chapter Completion Card (end of chapter) | `w-full mb-6` inside completion card | **EXCELLENT PLACEMENT**: Natural reading break between chapters. |
| 23 | `frontend/src/components/SiteLayout.tsx` | 406 | `StickyAnchorAd` | Fixed Viewport Bottom Banner | `fixed bottom-16 md:bottom-2` | **MOBILE UX DEFECT**: Sits directly above 64px mobile bottom nav, consuming ~140px vertical screen space on mobile. |

---

## 2. Logic Chain

### 2.1 Adsterra Script Execution Architecture
1. **Observation**: `AdSlot.tsx` injects Adsterra banners via an dynamically instantiated `<iframe>` populated using `doc.write()`.
2. **Logic**:
   - `atOptions` sets `format: 'iframe'`, `height: 90 (desktop) | 50 (mobile)`, `width: 728 (desktop) | 320 (mobile)`.
   - The script loaded inside the iframe is `//www.highperformanceformat.com/${adKey}/invoke.js`.
   - By running inside an isolated iframe, Adsterra's banner script does NOT pollute the main React DOM, mutate window globals, or break Next.js client-side navigation.
   - **Defect Identified**: The `isMobile` check (`window.innerWidth < 768`) is evaluated only on mount inside `useEffect`. A window resize or tablet orientation change does NOT dynamically resize the iframe or swap the Adsterra ad unit key.
   - **Native Variant Defect**: When `variant === "native"`, `nativeDiv.id = "container-d151fe0fbadd628be5d88b715d6a1e68"`. If more than one native ad slot is rendered on a page, duplicate IDs occur, causing Adsterra's native invoke script to fail or only populate the first instance.

### 2.2 Layout Stability (CLS) Analysis
1. **Observation**: `AdSlot.tsx` returns `null` when `visible === false` (Line 114).
2. **Logic**:
   - Before React hydration completes or while consent status is checked, `AdSlot` renders nothing (`null`, 0px height).
   - Once `visible` resolves to `true`, the `<aside>` element mounts with `min-h-[50px] md:min-h-[90px]` plus padding and border (`~70px` mobile, `~110px` desktop).
   - This causes visible Cumulative Layout Shift (CLS) on pages where ads are placed near top-of-fold content (especially `reader-top` in `MangaReaderContainer.tsx`).
   - In `MangaDetailClient.tsx` (Line 238), the right sidebar is styled with `w-52` (208px width on `lg` screens). On desktop, `AdSlot` injects a 728px wide iframe. A 728px iframe inside a 208px container overflows horizontally or gets clipped, violating layout integrity.

### 2.3 User Experience & Over-Monetization Analysis
1. **Observation**: `InterstitialAdModal.tsx` is injected into `LibraryPage` (Line 53) and `HistoryPage` (Line 136).
2. **Logic**:
   - Forcing 5-second unskippable countdown modals on personal management views (Library and Reading History) severely frustrates users trying to access their bookmarks or resume reading.
   - Injecting in-feed ads every 6 cards in small grids (Trending, Discover, Search, Library, History) produces visual noise and makes manga browsing feel cluttered and spammy.
   - `StickyAnchorAd` on mobile sits at `bottom-16` (64px from bottom), directly stacked above the 64px mobile navigation bar. On a standard mobile screen (e.g. 375x667px or 390x844px), the bottom 140px (~20% of screen height) is completely obscured by navigation + ad banner.

### 2.4 Incomplete / Mock States Analysis
1. **Observation**: `VideoAdUnit.tsx` is rendered on Home and Manga Detail Info tab.
2. **Logic**:
   - `VideoAdUnit.tsx` is a non-functional mock that plays a fake progress bar on an Unsplash still photo.
   - It is not hooked into any real video ad server (VAST/VPAID/Adsterra video) and directs to `https://senpaiden.vercel.app`.
   - It should either be replaced with real Adsterra native banner / high-CPM display placement or removed to prevent misleading UI.

### 2.5 Premium Gating Leak
1. **Observation**: `hasActivePremium()` from `@/lib/reader-progression` is imported in `AdSlot.tsx` and `MonetizationProvider.tsx` but never checked.
2. **Logic**:
   - Paying / Pro-Plus subscribers who have an active `senpai_premium` subscription still see all ads.
   - `AdSlot` and `MonetizationProvider` must check `!hasActivePremium()` in their visibility gating.

---

## 3. Caveats

1. **Adsterra Account Domain Approval**: Production Adsterra ad keys (`2de4d4b4a2f675e5880e6d1004852c8b`, `e595c21e4de14999cdb8003e66163d4b`) require the domain (`senpaiden.vercel.app` or custom domain) to be verified and active in the publisher's Adsterra dashboard. On `localhost` or unapproved domains, Adsterra may return blank creative responses.
2. **Ad Blocker Interception**: Adblock extensions (uBlock Origin, Brave Shields) block `highperformanceformat.com` at the DNS/network level. The code must handle blocked states gracefully without rendering broken empty boxes.

---

## 4. Conclusion

### Architectural Assessment
The codebase has a functioning Adsterra iframe integration foundation in `AdSlot.tsx`, but suffers from **6 distinct defects**:
1. **Desktop Sidebar Layout Overflow**: 728x90 desktop banner placed in 208px (`w-52`) sidebar in `MangaDetailClient.tsx`.
2. **CLS from Zero-Height Initial Hydration & Reader-Top Shift**: Unreserved initial slot height and `reader-top` placement directly disrupting manga reading flow.
3. **Severe UX Intrusion**: Unskippable 5-second modals on Library/History, sticky anchor ad crowding mobile bottom navigation, and excessive in-feed grid breaks (every 6 cards).
4. **Mock Component Residue**: `VideoAdUnit.tsx` using simulated progress bar and dummy Unsplash image.
5. **Multi-Instance Native Container ID Collisions**: Hardcoded `id="container-d151fe0fbadd628be5d88b715d6a1e68"`.
6. **Premium Suppression Omission**: `hasActivePremium()` imported but never evaluated.

---

## 5. Actionable Recommendations for Workers (Implementers & Reviewers)

### 5.1 Refactor `AdSlot.tsx`
- **Dynamic Resize Listener**: Add a debounced `resize` listener so viewport width changes (e.g. rotation) seamlessly update between 320x50 and 728x90 without full remounting.
- **Enforce Premium Suppression**:
  ```typescript
  import { hasActivePremium } from "@/lib/reader-progression";
  import { getConsent } from "@/lib/consent";
  // In sync():
  const isAllowed = Boolean(
    canServeAdsInBrowser() &&
    ADS_ENABLED &&
    isEnabled &&
    !hasActivePremium() &&
    getConsent()?.advertising
  );
  ```
- **Tear Down Cleanup**: Return a cleanup function in `useEffect` to clear `containerRef.current.innerHTML = ""` and unbind iframes to prevent memory leaks on client navigation.
- **Unique Container IDs for Native**: Append a unique instance UID (e.g. `useId()`) to native container divs if native ads are enabled.
- **Graceful Error / Adblock Handling**: Provide fallback styling or clean collapsing when ad creative fails to load.

### 5.2 Clean Up Layout & Placement Strategy
- **Manga Detail Sidebar**: Remove `<AdSlot>` from the `w-52` right sidebar in `MangaDetailClient.tsx` (Line 238) or replace with a dedicated square/rectangle format if configured. Keep the bottom placement in `MangaDetailClient` / `page.tsx` (Line 115).
- **Manga Reader UX**:
  - **Remove `reader-top`** (Line 591 in `MangaReaderContainer.tsx`) — placing an ad right before the first panel pushes reading content down and causes CLS.
  - **Retain & Enhance `reader-bottom`** (Line 708 in `MangaReaderContainer.tsx`) — the chapter completion card is the ideal natural break for high-engagement monetization without interrupting reading.
- **Eliminate Intrusive Modals**:
  - Remove `InterstitialAdModal` from `frontend/src/app/library/page.tsx` (Line 53) and `frontend/src/app/history/page.tsx` (Line 136).
- **Reduce In-Feed Ad Clutter**:
  - Remove in-feed grid breaks every 6 items in Discover, Search, Library, History, and Notifications.
  - Rely on natural section boundaries (e.g., bottom feed banners, end-of-grid banners).
- **Optimize `StickyAnchorAd` on Mobile**:
  - On mobile screens (`< 768px`), ensure `StickyAnchorAd` has an easy dismiss/minimize option that does not crowd the bottom navigation bar, or auto-collapse by default on small viewports.
- **Replace or Decommission `VideoAdUnit.tsx`**:
  - Replace dummy Unsplash video cards with clean standard `AdSlot` banners or remove them from `page.tsx` and `MangaDetailClient.tsx`.

---

## 6. Verification Method

To verify the audit findings:
1. **Inspect AdSlot & Adsterra Keys**:
   - Verify `ADSTERRA_DESKTOP_KEY = "2de4d4b4a2f675e5880e6d1004852c8b"` and `ADSTERRA_MOBILE_KEY = "e595c21e4de14999cdb8003e66163d4b"` in `frontend/src/components/AdSlot.tsx`.
2. **Inspect Sidebar Overflow**:
   - Check `frontend/src/app/manga/[id]/MangaDetailClient.tsx` line 238 — confirm `<AdSlot>` is nested within `<div className="hidden lg:block flex-shrink-0 w-52 pt-16">`.
3. **Inspect Interstitial Usage**:
   - Check `frontend/src/app/library/page.tsx` line 53 and `frontend/src/app/history/page.tsx` line 136 for `<InterstitialAdModal>`.
4. **Inspect Reader Ad Placement**:
   - Check `frontend/src/components/MangaReaderContainer.tsx` line 591 (`reader-top`) and line 708 (`reader-bottom`).
5. **Code Integrity Verification**:
   - Confirm all TypeScript types and exports in `frontend/src/lib/monetization.ts` compile without errors.
