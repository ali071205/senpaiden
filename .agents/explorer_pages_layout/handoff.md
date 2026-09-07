# Comprehensive Multi-Viewport Page & Ad Layout Audit Report
**Explorer 2 (Page & Viewport Layout Specialist)**
**Date:** 2026-09-02 | **Workspace:** `/home/unshakensoul/senpai_den`

---

## 1. Observation

### 1.1 Scope of Inspection
Audited all 21 frontend routes and admin subsystems across desktop viewports (1280px+) and mobile viewports (375px - 390px):
1. **Home** (`/` - `src/app/page.tsx`)
2. **Discover** (`/discover` - `src/app/discover/page.tsx`)
3. **Search** (`/search` - `src/app/search/page.tsx`)
4. **Manga Detail** (`/manga/[id]` - `src/app/manga/[id]/page.tsx`, `MangaDetailClient.tsx`)
5. **Chapter Reader** (`/manga/[id]/[chapter]` - `src/components/MangaReaderContainer.tsx`, `page.tsx`)
6. **Reader Processing** (`/manga/[id]/[chapter]/processing/page.tsx`)
7. **Library** (`/library` - `src/app/library/page.tsx`)
8. **History** (`/history` - `src/app/history/page.tsx`)
9. **Notifications** (`/notifications` - `src/app/notifications/page.tsx`)
10. **Admin Monetization Status** (`/admin/monetization` - `src/app/admin/monetization/page.tsx`)
11. **Admin Control Hub** (`admin-dashboard/src/app/page.tsx`)
12. **Account** (`/account` - `src/app/account/page.tsx`)
13. **Login / Auth** (`/login` - `src/app/login/page.tsx`)
14. **Premium** (`/premium` - `src/app/premium/page.tsx`)
15. **Legal & Informational Pages** (`/about`, `/contact`, `/partners`, `/privacy`, `/terms`, `/cookies`, `/copyright`, `/affiliate-disclosure` via `src/components/LegalPage.tsx`)

---

### 1.2 Identified Ad Units & Implementations

#### A. Global Sticky Anchor Ad (`src/components/StickyAnchorAd.tsx`)
- **Mount Point**: `src/components/SiteLayout.tsx:406` (`{!isReader && <StickyAnchorAd />}`)
- **Desktop (1280px+)**: Pinned at `bottom-2` with `md:left-[260px] md:right-0 max-w-3xl mx-auto`. Renders 728x90 Adsterra banner (`min-h-[90px]`) inside dark backdrop blur container.
- **Mobile (375px - 390px)**: Pinned at `bottom-16` (directly sitting above mobile bottom navigation bar `h-16`). Renders 320x50 Adsterra banner (`min-h-[50px]`) + header bar (~25px), taking ~75px vertical height.
- **Collision Observation**: `src/components/ContinueReadingBubble.tsx:25` is placed at `bottom-20 right-4` on mobile. Because the sticky anchor ad occupies vertical space from `y = 64px` to `y = 139px` from the bottom, the floating Continue Reading bubble directly overlays and obstructs the right side of the sticky anchor ad container!

#### B. Full-Screen Interstitial Ad Modal (`src/components/InterstitialAdModal.tsx`)
- **Mount Points**:
  - `src/app/library/page.tsx:53`: `<InterstitialAdModal storageKey="senpai_library_interstitial_seen" title="Library Partner Sponsor" durationSeconds={5} />`
  - `src/app/history/page.tsx:136`: `<InterstitialAdModal storageKey="senpai_history_interstitial_seen" title="Reading History Sponsor" durationSeconds={5} />`
- **Behavior**: Renders a fixed full-screen modal (`z-[150] bg-black/90 backdrop-blur-xl`) with a 5-second mandatory countdown timer before the continue button unlocks.
- **Impact**: Completely blocks user interaction when opening personal bookmarks or reading history.

#### C. AdSlot Unit (`src/components/AdSlot.tsx`)
- **Mechanics**:
  - Desktop: 728x90 iframe (`ADSTERRA_DESKTOP_KEY = "2de4d4b4a2f675e5880e6d1004852c8b"`).
  - Mobile: 320x50 iframe (`ADSTERRA_MOBILE_KEY = "e595c21e4de14999cdb8003e66163d4b"`).
  - Native variant: `ADSTERRA_NATIVE_CONTAINER = "container-d151fe0fbadd628be5d88b715d6a1e68"`.
- **CLS Behavior**: Returns `null` on server / initial render (`if (!visible) return null;`). When client consent evaluates, container suddenly mounts with height ~70px (mobile) to ~115px (desktop), inducing Cumulative Layout Shift (CLS) if surrounding content is not space-reserved.

#### D. High-CPM Video Ad Unit (`src/components/VideoAdUnit.tsx`)
- **Mount Points**:
  - `src/app/page.tsx:203` (Home page below Trending grid)
  - `src/app/manga/[id]/MangaDetailClient.tsx:383` (Manga Detail Info tab)
- **Mechanics**: 16:9 aspect-ratio video player simulation with interactive controls, progress bar, and external partner CTA.

---

### 1.3 Page-by-Page Detailed Layout & Ad Placement Inventory

| Page / Route | Viewport | Current Ad Placements | In-Grid / Modal Injections | Mobile / Desktop Layout Issues |
| :--- | :--- | :--- | :--- | :--- |
| **Home** (`/`) | **Desktop (1280px+)** | 1. Mid-feed Banner (`home-feed`)<br>2. In-grid Banner (`home-feed`)<br>3. Video Ad Unit (`VideoAdUnit`)<br>4. Sticky Anchor Ad | In-grid ad injected at `(index + 1) % 6 === 0` inside 8-item Trending grid (breaks 8-column layout after 6 items, leaving 2 orphans) | High promotional density within ~500px vertical space |
| | **Mobile (375px-390px)** | Same 4 ad units + Floating Continue Reading Bubble | In-grid ad splits 2-column grid after 3 rows | `ContinueReadingBubble` overlaps `StickyAnchorAd` at `bottom-20` vs `bottom-16`. High viewport crowding (~40% of viewport consumed by fixed chrome + sticky ad) |
| **Discover** (`/discover`) | **Desktop (1280px+)** | 1. In-grid Banner (`discover-grid`) x3<br>2. Post-grid Banner (`discover-grid`)<br>3. Post-pagination Banner (`discover-bottom`)<br>4. Sticky Anchor Ad | Injected at index 5, 11, 17 in 24-item catalog. Post-grid ad at index 23 immediately followed by post-pagination ad! | 5 inline banners on one page! In-grid banners break 8-column grid at 6 cards (3/4 of a row), leaving 2 empty card slots |
| | **Mobile (375px-390px)** | Same 5 inline ad slots + Sticky Anchor Ad | Injected every 6 cards (every 3 rows) | Extreme ad clutter during catalog browsing; double ad at bottom separated only by ~45px pagination buttons |
| **Search** (`/search`) | **Desktop & Mobile** | 1. In-grid Banner (`discover-grid`)<br>2. Sticky Anchor Ad | Injected at `(index + 1) % 6 === 0` in search results | Disrupts visual scanning of search results |
| **Manga Detail** (`/manga/[id]`) | **Desktop (1280px+)** | 1. Sidebar Banner (`manga-detail`)<br>2. Top Range Banner (`manga-detail`)<br>3. In-feed Chapter Ads (every 10 ch)<br>4. Video Ad Unit (Info tab)<br>5. Footer Banner (`manga-detail`)<br>6. Sticky Anchor Ad | Up to 4 in-feed ads in 50-chapter view + Top banner = 5 ads inside chapter list | Chapter list heavily cluttered with repetitive banner blocks |
| | **Mobile (375px-390px)** | Same ad units minus sidebar | Top Range banner renders before Chapter 1 row | Top banner pushes Chapter 1 below the fold; in-feed ads every 10 chapters; footer ad + sticky ad |
| **Chapter Reader** (`/manga/[id]/[chapter]`) | **Desktop & Mobile** | 1. Reader-top Banner (`reader-top`)<br>2. Intermission Card Banner (`reader-bottom`) | `StickyAnchorAd` is **correctly hidden** in reader mode (`!isReader`) | **Critical UX Defect 1**: Top banner renders at `pt-16` directly above first chapter panel, pushing manga down.<br>**Critical UX Defect 2**: In Intermission Card, `AdSlot` is positioned *above* the "Next Chapter" CTA button. Async ad load causes CLS directly over the Next Chapter button. |
| **Library** (`/library`) | **Desktop & Mobile** | 1. Interstitial Ad Modal (5s lock)<br>2. In-grid Banner (`library-bottom`)<br>3. Bottom Banner (`library-bottom`)<br>4. Sticky Anchor Ad | Fullscreen 5-second unskippable modal on entry; in-grid splitter every 6 bookmarks | **Severe UX Defect**: Blocked access to user's saved library bookmarks; repetitive ads for personal bookmark manager |
| **History** (`/history`) | **Desktop & Mobile** | 1. Interstitial Ad Modal (5s lock)<br>2. In-grid Banner (`history-bottom`)<br>3. Bottom Banner (`history-bottom`)<br>4. Sticky Anchor Ad | Fullscreen 5-second unskippable modal on entry; in-grid splitter every 6 history items | **Severe UX Defect**: Blocked access to reading history; hostile UX for returning readers |
| **Notifications** (`/notifications`) | **Desktop & Mobile** | 1. In-feed Banner (`notifications-bottom`)<br>2. Bottom Banner (`notifications-bottom`)<br>3. Sticky Anchor Ad | Injected after every 4 notifications (`(index + 1) % 4 === 0`) | In-feed ad breaks notification list items |
| **Admin & Monetization** (`/admin/monetization`, `admin-dashboard`) | **Desktop & Mobile** | Zero ads (Admin protected) | None | Clean diagnostic & control telemetry |
| **Static / Legal / Premium** (`/about`, `/premium`, `/privacy`, etc.) | **Desktop & Mobile** | Sticky Anchor Ad only | None | Clean typography & documentation layouts |

---

## 2. Logic Chain

### 2.1 Why Current In-Grid Ad Injection Causes Layout & UX Breakage
1. **Observation**: On desktop (1280px+), manga grids use `xl:grid-cols-8` or `lg:grid-cols-6`.
2. **Observation**: Code injects `<div className="col-span-full my-3"><AdSlot /></div>` when `(index + 1) % 6 === 0`.
3. **Logic**:
   - On an 8-column grid (`xl:grid-cols-8`), 6 cards only fill 75% of row 1. When the 7th cell is replaced by a `col-span-full` element, the CSS grid engine terminates row 1 prematurely with a 2-card gap on the right, forces the ad to a new row, and then starts row 3 with cards 7 and 8.
   - On Home, `trending` has only 8 items. Card 6 triggers the ad, leaving cards 7 and 8 stranded as an orphan 2-card row beneath a full-width ad.
   - On Discover (24 items), this fragmentation happens 3 separate times across one page.
4. **Conclusion**: In-grid `col-span-full` banners mathematically break responsive CSS grid flow across all viewports wider than 2 columns.

### 2.2 Why Chapter Reader Ad Placement Harms Immersion and Creates CTA CLS
1. **Observation**: `MangaReaderContainer.tsx:590-593` places `<AdSlot placement="reader-top" />` before the virtualized reader canvas.
2. **Observation**: `MangaReaderContainer.tsx:708-713` places `<AdSlot placement="reader-bottom" />` above `<Link href={...nextChapter}>Next Chapter</Link>`.
3. **Logic**:
   - When a user enters chapter reading mode, the user expects instant visual connection with panel 1. A 728x90 / 320x50 top banner forces the user to scroll past an advertisement before the comic art begins.
   - In the Chapter Intermission Card, readers finish panel N and immediately glance down to tap "Next Chapter". Because AdSlot loads asynchronously in an iframe, the layout expands dynamically from 0px to 90px+ right when the reader attempts to click the CTA, causing mis-clicks and high Cumulative Layout Shift (CLS).
4. **Conclusion**: The top reader ad must be eliminated, and the bottom intermission ad must be positioned *below* or cleanly isolated from the primary "Next Chapter" CTA.

### 2.3 Why Full-Screen Interstitial Modals on Library & History Hurt Retention
1. **Observation**: `LibraryPage` and `HistoryPage` mount `<InterstitialAdModal durationSeconds={5} />`.
2. **Logic**:
   - The Library and History views are utility destinations where users manage personal bookmarks and resume reading.
   - Imposing a 5-second blocking screen with a countdown timer punishes core users who read frequently and check their bookmarks often.
   - This directly conflicts with Senpai Den's "reader-first" product philosophy.
3. **Conclusion**: The 5-second interstitial modal must be removed from `/library` and `/history`. Monetization on these utility pages should be limited to 1 subtle, space-reserved footer sponsor unit.

### 2.4 Why Mobile Fixed Chrome (Bottom Nav + Sticky Anchor + Floating Bubble) Collides
1. **Observation**:
   - Mobile bottom nav is `h-16` (`fixed bottom-0`).
   - `StickyAnchorAd` is `fixed bottom-16` (~75px height).
   - `ContinueReadingBubble` is `fixed bottom-20 right-4`.
2. **Logic**:
   - Coordinate calculation: `bottom-20` is `80px` from the screen bottom.
   - `StickyAnchorAd` spans from `64px` to `139px` from the bottom.
   - Thus, `ContinueReadingBubble` occupies `y = 80px` to `130px`, directly colliding with the right third of `StickyAnchorAd` (including the close / minimize buttons).
3. **Conclusion**: When `StickyAnchorAd` is visible on mobile, `ContinueReadingBubble` must be offset to `bottom-36` (~144px) or docked gracefully above the sticky anchor ad.

---

## 3. Caveats

1. **Adsterra Network Traffic & Ad Blockers**:
   - If an ad blocker is active, Adsterra scripts will not execute. The container must gracefully collapse without leaving unsightly empty boxes or broken layout gaps.
2. **Fixed Iframe Dimension Constraints**:
   - Adsterra banner key `2de4d4b4a2f675e5880e6d1004852c8b` is hardcoded to 728x90px; mobile key `e595c21e4de14999cdb8003e66163d4b` is 320x50px.
   - On screen widths between 320px and 728px (e.g. tablet 600px), the 728px desktop iframe will overflow horizontally if rendered. `AdSlot.tsx` uses `window.innerWidth < 768` to switch to 320x50, which correctly prevents horizontal overflow.
3. **Read-Only Investigation Scope**:
   - This report provides exact specifications, layout coordinates, and architectural directives for implementation subagents. No application source files were altered during this audit.

---

## 4. Conclusion & Actionable Recommendations

### 4.1 Optimal Ad Placement Blueprint per Page

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       SENPAI DEN AD PLACEMENT MATRIX                        │
├───────────────────┬──────────────────────────────────┬──────────────────────┤
│ Page Route        │ Proposed Optimal Placement Zone  │ Recommended Format   │
├───────────────────┼──────────────────────────────────┼──────────────────────┤
│ Home (/)          │ Mid-Feed (between Feeds & Trend) │ 728x90 / 320x50      │
│                   │ Post-Trending Sponsor Feature    │ 16:9 Video Ad Unit   │
│                   │ Bottom Anchor Ad (Dismissable)   │ 728x90 / 320x50      │
├───────────────────┼──────────────────────────────────┼──────────────────────┤
│ Discover          │ Post-Grid / Pre-Pagination       │ 728x90 / 320x50      │
│ (/discover)       │ Bottom Page Sponsor              │ 728x90 / 320x50      │
├───────────────────┼──────────────────────────────────┼──────────────────────┤
│ Search (/search)  │ Bottom of Results Feed           │ 728x90 / 320x50      │
├───────────────────┼──────────────────────────────────┼──────────────────────┤
│ Manga Detail      │ Desktop Sidebar (under Related)  │ Native / 300x250     │
│ (/manga/[id])     │ Bottom of Chapter Card Section   │ 728x90 / 320x50      │
│                   │ Info Tab Video Spotlight         │ 16:9 Video Ad Unit   │
├───────────────────┼──────────────────────────────────┼──────────────────────┤
│ Chapter Reader    │ TOP BANNER: REMOVED              │ None (Zero Friction) │
│ (/manga/.../ch)   │ Intermission Card (BELOW CTA)    │ 728x90 / 320x50      │
├───────────────────┼──────────────────────────────────┼──────────────────────┤
│ Library (/library)│ INTERSTITIAL MODAL: REMOVED      │ None                 │
│                   │ Bottom Collection Footer Sponsor │ 728x90 / 320x50      │
├───────────────────┼──────────────────────────────────┼──────────────────────┤
│ History (/history)│ INTERSTITIAL MODAL: REMOVED      │ None                 │
│                   │ Bottom History Footer Sponsor    │ 728x90 / 320x50      │
├───────────────────┼──────────────────────────────────┼──────────────────────┤
│ Notifications     │ Bottom Updates Footer Sponsor    │ 728x90 / 320x50      │
└───────────────────┴──────────────────────────────────┴──────────────────────┘
```

### 4.2 Specific Code Refactoring Guidance for Workers

1. **Eliminate Grid-Breaking Injections**:
   - Remove `(index + 1) % 6 === 0` in-grid ad blocks in:
     - `src/app/page.tsx:191-195`
     - `src/app/discover/page.tsx:118-122`
     - `src/app/search/page.tsx:136-140`
     - `src/app/library/page.tsx:95-99`
     - `src/app/history/page.tsx:178-182`
   - Remove `(index + 1) % 10 === 0` in `src/app/manga/[id]/MangaDetailClient.tsx:338-344`
   - Remove `(index + 1) % 4 === 0` in `src/app/notifications/page.tsx:78-82`

2. **Remove Intrusive Interstitials from Utility Pages**:
   - Delete `<InterstitialAdModal ... />` calls in:
     - `src/app/library/page.tsx:53`
     - `src/app/history/page.tsx:136`

3. **Restructure Chapter Reader Intermission & Remove Top Ad**:
   - In `src/components/MangaReaderContainer.tsx`:
     - Remove lines 590-593 (`<div className="mx-auto max-w-3xl px-4 pt-16 pb-3"><AdSlot placement="reader-top" /></div>`).
     - In lines 690-745 (Intermission Card): Reorder so the primary "Next Chapter" button renders **above** the `AdSlot placement="reader-bottom"`.

4. **Fix Mobile Viewport Stacking & Floating Collision**:
   - In `src/components/ContinueReadingBubble.tsx:25`:
     - Update mobile position from `bottom-20` to `bottom-36` (e.g. `bottom-36 md:bottom-6 right-4 md:right-6`).
     - This guarantees the bubble floats cleanly above both the mobile bottom nav (`h-16`) and the `StickyAnchorAd` (`bottom-16`).

5. **Eliminate CLS in `AdSlot.tsx`**:
   - Add reserved min-height and dark skeleton container styling:
     ```tsx
     <aside className="mx-auto my-4 w-full max-w-4xl min-h-[66px] md:min-h-[106px] overflow-hidden rounded-2xl border border-white/5 bg-[#11131A] p-2 text-center">
     ```

---

## 5. Verification Method

### 5.1 Compilation & Build Verification
Execute Next.js Turbopack production build:
```bash
cd /home/unshakensoul/senpai_den/frontend && npm run build
```
*Expected result:* Exit code 0, 0 TypeScript errors, all static and dynamic routes compiled.

### 5.2 Multi-Viewport Layout Inspection Checklist
Verify the following viewports in Chrome DevTools / browser responsive mode:
- **Desktop (1440px & 1280px)**:
  - Sidebar fixed at `w-[260px]` without horizontal overflow.
  - Manga grids render solid 6 to 8 columns without fragmented empty gaps.
  - StickyAnchorAd renders centered at `bottom-2` with `md:left-[260px]`.
- **Mobile (375px iPhone SE / 390px iPhone 14/15/16)**:
  - Top nav `h-14` + Bottom nav `h-16` intact.
  - StickyAnchorAd renders cleanly at `bottom-16` above bottom nav.
  - ContinueReadingBubble renders at `bottom-36` without overlapping StickyAnchorAd.
  - In Chapter Reader, opening any chapter immediately displays Chapter Panel 1 with zero top ad delay.
  - In Chapter Intermission, "Next Chapter" CTA is immediately clickable without CLS displacement.
  - Library (`/library`) and History (`/history`) load instantly with zero blocking modal overlays.

