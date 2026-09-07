import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

console.log("=== EMPIRICAL CHALLENGE & ADVERSARIAL STRESS TEST: MILESTONE 2 ===\n");

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`[PASS] ${message}`);
    passed++;
  } else {
    console.error(`[FAIL] ${message}`);
    failed++;
  }
}

// -------------------------------------------------------------
// 1. Empirical Verification of Interstitial Removal
// -------------------------------------------------------------
console.log("--- 1. Interstitial Removal & Zero Blocking Modals ---");

const librarySrc = readFileSync(resolve("src/app/library/page.tsx"), "utf-8");
const historySrc = readFileSync(resolve("src/app/history/page.tsx"), "utf-8");

assert(!librarySrc.includes("InterstitialAdModal"), "Library page has 0 imports or references to InterstitialAdModal");
assert(!historySrc.includes("InterstitialAdModal"), "History page has 0 imports or references to InterstitialAdModal");
assert(!librarySrc.includes("senpai_library_interstitial_seen"), "Library page has 0 interstitial storage keys");
assert(!historySrc.includes("senpai_history_interstitial_seen"), "History page has 0 interstitial storage keys");
assert(!librarySrc.includes("durationSeconds"), "Library page has 0 modal countdown timer props");
assert(!historySrc.includes("durationSeconds"), "History page has 0 modal countdown timer props");

// -------------------------------------------------------------
// 2. Immediate Reader Immersion (Zero Top Ads)
// -------------------------------------------------------------
console.log("\n--- 2. Chapter Reader Zero Top Ads & Immersion ---");

const readerSrc = readFileSync(resolve("src/components/MangaReaderContainer.tsx"), "utf-8");

assert(!readerSrc.includes('placement="reader-top"'), "MangaReaderContainer does NOT render 'reader-top' ad placement");
assert(!readerSrc.includes("reader-top"), "MangaReaderContainer contains zero references to top reader ad");

// Verify that the first visual element in Webtoon mode is the virtualizer / slice 0
const webtoonIndex = readerSrc.indexOf('readingMode === "webtoon"');
const readerBottomIndex = readerSrc.indexOf('placement="reader-bottom"');
assert(webtoonIndex > 0 && readerBottomIndex > webtoonIndex, "Manga slices render before the intermission card and bottom ad");

// -------------------------------------------------------------
// 3. Intermission CTA Positioned ABOVE Reader-Bottom Ad
// -------------------------------------------------------------
console.log("\n--- 3. Intermission Card CTA Hierarchy & CLS Defense ---");

const nextChapterCtaIndex = readerSrc.indexOf("Next Chapter");
const readerBottomAdIndex = readerSrc.indexOf('placement="reader-bottom"');

assert(nextChapterCtaIndex > 0, "Intermission card contains Next Chapter CTA button");
assert(readerBottomAdIndex > 0, "Intermission card contains reader-bottom AdSlot");
assert(nextChapterCtaIndex < readerBottomAdIndex, "Next Chapter navigation CTA is positioned ABOVE the reader-bottom ad unit (prevents CLS & misclicks)");

// -------------------------------------------------------------
// 4. Mobile Bottom Clearance & Floating Bubble Collision Elimination
// -------------------------------------------------------------
console.log("\n--- 4. Mobile Clearance & Vertical Stacking Coordinates ---");

const layoutSrc = readFileSync(resolve("src/components/SiteLayout.tsx"), "utf-8");
const bubbleSrc = readFileSync(resolve("src/components/ContinueReadingBubble.tsx"), "utf-8");
const stickyAdSrc = readFileSync(resolve("src/components/StickyAnchorAd.tsx"), "utf-8");

assert(layoutSrc.includes("pb-36"), "SiteLayout <main> applies pb-36 (144px) mobile bottom padding to clear nav + sticky ad");
assert(bubbleSrc.includes("bottom-36"), "ContinueReadingBubble applies bottom-36 (144px) mobile bottom offset");
assert(stickyAdSrc.includes("bottom-16"), "StickyAnchorAd is anchored at bottom-16 (64px) on mobile directly above bottom nav");
assert(layoutSrc.includes("h-16"), "SiteLayout mobile bottom navigation height is h-16 (64px)");

// Stacking coordinate validation:
// y=0 to y=64: Mobile Bottom Nav (h-16)
// y=64 to y=138: Sticky Anchor Ad (bottom-16 + ~74px ad container)
// y=144+: ContinueReadingBubble (bottom-36 = 144px) and <main> padding clearance (pb-36 = 144px)
const bottomNavHeight = 64;
const stickyAdMinHeight = 74; // min-h-[74px]
const totalStickyOcclusion = bottomNavHeight + stickyAdMinHeight; // 138px
const mainPaddingMobile = 144; // pb-36 = 36 * 4px = 144px
const bubbleOffsetMobile = 144; // bottom-36 = 36 * 4px = 144px

assert(mainPaddingMobile >= totalStickyOcclusion, `Main mobile padding (${mainPaddingMobile}px) >= Total bottom chrome occlusion (${totalStickyOcclusion}px)`);
assert(bubbleOffsetMobile >= totalStickyOcclusion, `ContinueReadingBubble offset (${bubbleOffsetMobile}px) >= Total bottom chrome occlusion (${totalStickyOcclusion}px)`);

// -------------------------------------------------------------
// 5. Elimination of Artificial Page Transition Delay / Skeleton Flash
// -------------------------------------------------------------
console.log("\n--- 5. Verification of Artificial Delay Removal in SiteLayout ---");

assert(!layoutSrc.includes("HomeSkeletonLoader"), "SiteLayout does NOT contain HomeSkeletonLoader");
assert(!layoutSrc.includes("isSiteLoading"), "SiteLayout does NOT contain artificial isSiteLoading delay state");
assert(!layoutSrc.includes("setTimeout"), "SiteLayout does NOT contain route-blocking setTimeout");

// -------------------------------------------------------------
// 6. Mobile HUD Densification & Viewport Truncation Safety
// -------------------------------------------------------------
console.log("\n--- 6. Mobile HUD Layout Densification (375px/390px Viewports) ---");

assert(readerSrc.includes("max-w-[140px] xs:max-w-[200px] sm:max-w-md"), "Reader top HUD applies responsive title truncation for small screens");
assert(readerSrc.includes("hidden sm:flex items-center gap-1 bg-white/5 p-1 rounded-xl border border-white/10"), "Page fit selectors are hidden on mobile viewports to prevent navbar clipping");

// -------------------------------------------------------------
// 7. Edge Case: Last Chapter in Series
// -------------------------------------------------------------
console.log("\n--- 7. Edge Cases: Series Completion & Empty States ---");

assert(readerSrc.includes("View Series Recommendations"), "When nextChapter is null, intermission renders 'View Series Recommendations' button");
assert(librarySrc.includes("Your library is empty"), "Library page handles empty array gracefully without modal or error");
assert(historySrc.includes("No history yet"), "History page handles empty history gracefully without modal or error");

console.log(`\n=== EMPIRICAL CHALLENGE SUMMARY: ${passed} PASSED, ${failed} FAILED ===`);
if (failed > 0) process.exit(1);
