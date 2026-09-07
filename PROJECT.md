# Project: Senpai Den Multi-Page Audit, Ad UX Optimization & Adsterra Production Activation

## Architecture
Senpai Den is a Next.js (App Router) manga reading and catalog platform.
- **Frontend Stack**: Next.js 16, React 19, TypeScript, Tailwind CSS, Lucide Icons, TanStack Virtualizer.
- **Monetization Layer**: Adsterra production ad banners (728x90 desktop, 320x50 mobile) and native scripts encapsulated inside `AdSlot.tsx`, with global script management via `MonetizationProvider.tsx` and placement control via `lib/monetization.ts`.
- **Layout System**: Responsive `SiteLayout.tsx` supporting desktop persistent sidebar (`w-[260px]`) and mobile fixed bottom nav (`h-16`) + sticky bottom anchor ad (`StickyAnchorAd.tsx`).

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---|---|---|---|
| 1 | Production Adsterra Banner Activation | Configure & activate production 728x90 desktop (`2de4d4b4a2f675e5880e6d1004852c8b`) and 320x50 mobile (`e595c21e4de14999cdb8003e66163d4b`) units | M1 | Survey |
| 2 | Dynamic Responsive Resize & Memory Cleanup | Add window resize listener and iframe DOM unmount cleanup in `AdSlot.tsx` | M1 | Survey |
| 3 | Native Container Unique UID | Support unique instance IDs for Adsterra native banner widgets | M1 | Survey |
| 4 | Premium Ad Suppression | Ensure `hasActivePremium()` suppresses all ad rendering | M1 | Survey |
| 5 | Ad Container CLS Prevention & Dark Styling | Space-reserved min-heights (`min-h-[74px] md:min-h-[114px]`) and standardized dark obsidian styling | M1 | Survey |
| 6 | Remove Intrusive Interstitial Modals | Remove 5s blocking `InterstitialAdModal` from Library and History pages | M2 | Survey |
| 7 | Chapter Reader Zero-Friction Immersion | Remove `reader-top` ad above first manga panel in `MangaReaderContainer.tsx` | M2 | Survey |
| 8 | Intermission Card CTA Reordering | Position "Next Chapter" navigation CTA above `reader-bottom` ad to prevent click misfires and CLS | M2 | Survey |
| 9 | Mobile Fixed Chrome & Bubble Stacking | Fix `<main>` padding (`pb-36`) and `ContinueReadingBubble` (`bottom-36`) to eliminate collisions with `StickyAnchorAd` | M2 | Survey |
| 10 | Remove Artificial Skeleton Flash | Eliminate hardcoded 250ms `isSiteLoading` delay in `SiteLayout.tsx` | M2 | Survey |
| 11 | Eliminate Grid-Breaking In-Feed Ad Splits | Remove `(index + 1) % 6 === 0` in Home, Discover, Search, Library, History, Notifications | M3 | Survey |
| 12 | Fix Manga Detail Sidebar Overflow & Key Thrashing | Remove 728px banner from 208px `w-52` sidebar; eliminate chapter filter key thrashing | M3 | Survey |
| 13 | Upgrade / Decommission Mock Video Ads | Replace or clean up dummy Unsplash `VideoAdUnit.tsx` references | M3 | Survey |
| 14 | Admin Monetization Status Alignment | Update `/admin/monetization` to monitor production Adsterra banner keys | M3 | Survey |
| 15 | Multi-Viewport Build & Gate Verification | Verify `npm run build` in `frontend/`, check 0 errors, pass challenger and auditor checks | M4 | Survey |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|---|---|---|---|
| M1 | Ad Infrastructure & Adsterra Production Activation | `AdSlot.tsx`, `lib/monetization.ts`, `MonetizationProvider.tsx` | None | DONE |
| M2 | Reader Immersion, Interstitial Removal & Mobile Layout | `MangaReaderContainer.tsx`, `SiteLayout.tsx`, `ContinueReadingBubble.tsx`, `library/page.tsx`, `history/page.tsx` | M1 | DONE |
| M3 | In-Feed Grid Refactor, MangaDetail Cleanup & Admin Alignment | `page.tsx`, `discover/page.tsx`, `search/page.tsx`, `notifications/page.tsx`, `manga/[id]/MangaDetailClient.tsx`, `admin/monetization/page.tsx` | M2 | DONE |
| M4 | Final Build Verification & Review Gate | Full frontend build, responsive layout verification, audit & challenge | M3 | DONE |

## Interface Contracts
### AdSlot ↔ Application Pages
- `AdSlot` accepts `placement: AdPlacement`, `variant?: "banner" | "native"`, `className?: string`.
- Guarantees space-reserved container dimensions with dark styling (`bg-[#0E1422]/60 border border-white/[0.08]`).
- Automatically switches between desktop 728x90 and mobile 320x50 Adsterra banners based on dynamic viewport width.
- Evaluates `!hasActivePremium()` and user consent before rendering.

### Manga Reader ↔ Monetization
- Active reading canvas (`MangaReaderContainer.tsx`) has ZERO ads at the top (`reader-top` removed).
- Chapter Completion Intermission Card renders primary "Next Chapter" navigation CTA at top, followed by `reader-bottom` ad at the bottom.

### Mobile Navigation ↔ Sticky Chrome
- Mobile bottom navigation bar height: `64px` (`h-16`).
- `StickyAnchorAd` bottom offset: `bottom-16` (mobile) / `bottom-2 md:left-[260px]` (desktop).
- `ContinueReadingBubble` bottom offset: `bottom-36` (mobile) / `bottom-6` (desktop).
- Main page container bottom padding: `pb-36` (mobile) / `pb-20` (desktop).

## Code Layout
- `frontend/src/components/AdSlot.tsx`: Core ad container and Adsterra iframe / native injector.
- `frontend/src/components/StickyAnchorAd.tsx`: Viewport bottom sticky banner.
- `frontend/src/components/SiteLayout.tsx`: Top navbar, desktop sidebar, mobile bottom nav, sticky ad mount.
- `frontend/src/components/MangaReaderContainer.tsx`: Reader canvas, header/footer HUDs, intermission card.
- `frontend/src/components/ContinueReadingBubble.tsx`: Floating quick-resume reading bubble.
- `frontend/src/lib/monetization.ts`: Monetization constants and placement switches.
- `frontend/src/app/page.tsx`: Home page feed.
- `frontend/src/app/discover/page.tsx`: Discover catalog grid.
- `frontend/src/app/search/page.tsx`: Search results grid.
- `frontend/src/app/library/page.tsx`: Library bookmarks view.
- `frontend/src/app/history/page.tsx`: Reading history view.
- `frontend/src/app/notifications/page.tsx`: Notifications inbox.
- `frontend/src/app/manga/[id]/MangaDetailClient.tsx`: Manga detail, metadata, chapter list.
- `frontend/src/app/admin/monetization/page.tsx`: Admin monetization telemetry and readiness checks.
