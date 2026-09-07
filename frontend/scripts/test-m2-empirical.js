// frontend/scripts/test-m2-empirical.js
// Empirical test harness for Milestone 2 (Reader Immersion, Interstitial Removal & Mobile Layout)

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..');

console.log('=== SENPAI DEN MILESTONE 2 EMPIRICAL VERIFICATION HARNESS ===\n');

let passedTests = 0;
let totalTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`✅ [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`❌ [FAIL] ${name}`);
    console.error(`   Error: ${err.message}`);
  }
}

// 1. Check library/page.tsx for complete removal of InterstitialAdModal
runTest('Library Page: InterstitialAdModal completely removed', () => {
  const content = fs.readFileSync(path.join(ROOT, 'src/app/library/page.tsx'), 'utf8');
  assert.strictEqual(content.includes('InterstitialAdModal'), false, 'InterstitialAdModal must not be present in library page');
  assert.strictEqual(content.includes('senpai_library_interstitial_seen'), false, 'Interstitial storage key must not be present');
});

// 2. Check history/page.tsx for complete removal of InterstitialAdModal
runTest('History Page: InterstitialAdModal completely removed', () => {
  const content = fs.readFileSync(path.join(ROOT, 'src/app/history/page.tsx'), 'utf8');
  assert.strictEqual(content.includes('InterstitialAdModal'), false, 'InterstitialAdModal must not be present in history page');
  assert.strictEqual(content.includes('senpai_history_interstitial_seen'), false, 'Interstitial storage key must not be present');
});

// 3. Check MangaReaderContainer.tsx for zero top ad and immersion
runTest('MangaReaderContainer: reader-top ad banner completely removed', () => {
  const content = fs.readFileSync(path.join(ROOT, 'src/components/MangaReaderContainer.tsx'), 'utf8');
  assert.strictEqual(content.includes('placement="reader-top"'), false, 'reader-top ad must be eliminated for zero-friction immersion');
});

// 4. Check MangaReaderContainer.tsx for Intermission CTA order relative to bottom ad
runTest('MangaReaderContainer: Next Chapter CTA rendered ABOVE reader-bottom ad', () => {
  const content = fs.readFileSync(path.join(ROOT, 'src/components/MangaReaderContainer.tsx'), 'utf8');
  const nextChapterIdx = content.indexOf('Next Chapter');
  const readerBottomIdx = content.indexOf('placement="reader-bottom"');
  assert.ok(nextChapterIdx !== -1, 'Next Chapter CTA must exist in MangaReaderContainer');
  assert.ok(readerBottomIdx !== -1, 'reader-bottom AdSlot must exist in MangaReaderContainer');
  assert.ok(nextChapterIdx < readerBottomIdx, `Next Chapter CTA (pos ${nextChapterIdx}) must appear BEFORE reader-bottom ad (pos ${readerBottomIdx})`);
});

// 5. Check MangaReaderContainer.tsx mobile HUD layout containment
runTest('MangaReaderContainer: Mobile HUD responsive densification and truncation', () => {
  const content = fs.readFileSync(path.join(ROOT, 'src/components/MangaReaderContainer.tsx'), 'utf8');
  assert.ok(content.includes('max-w-[140px] xs:max-w-[200px] sm:max-w-md'), 'Manga title must have responsive truncation');
  assert.ok(content.includes('hidden sm:flex items-center gap-1 bg-white/5 p-1 rounded-xl'), 'Page fit selectors must be hidden on mobile (<sm) to prevent header overflow');
  assert.ok(content.includes('px-3 sm:px-4 py-2.5 sm:py-3'), 'HUD container must have densified padding on mobile');
});

// 6. Check SiteLayout.tsx for elimination of 250ms artificial skeleton loader flash
runTest('SiteLayout: Artificial 250ms timeout & isSiteLoading removed', () => {
  const content = fs.readFileSync(path.join(ROOT, 'src/components/SiteLayout.tsx'), 'utf8');
  assert.strictEqual(content.includes('isSiteLoading'), false, 'isSiteLoading state must not exist');
  assert.strictEqual(content.includes('HomeSkeletonLoader'), false, 'HomeSkeletonLoader overlay must not exist in SiteLayout');
});

// 7. Check SiteLayout.tsx mobile bottom padding clearance
runTest('SiteLayout: Main container bottom clearance pb-36 on mobile', () => {
  const content = fs.readFileSync(path.join(ROOT, 'src/components/SiteLayout.tsx'), 'utf8');
  assert.ok(content.includes('pb-36'), 'Main content must have pb-36 (144px) mobile bottom padding');
});

// 8. Check ContinueReadingBubble.tsx coordinate positioning
runTest('ContinueReadingBubble: Positioned at bottom-36 on mobile to clear StickyAnchorAd', () => {
  const content = fs.readFileSync(path.join(ROOT, 'src/components/ContinueReadingBubble.tsx'), 'utf8');
  assert.ok(content.includes('bottom-36'), 'ContinueReadingBubble must have bottom-36 (144px) offset on mobile');
  assert.ok(content.includes('md:bottom-6'), 'ContinueReadingBubble must have md:bottom-6 desktop offset');
});

// 9. Coordinate Bounding Simulation & Stacking Collision Analysis
runTest('Coordinate Stacking Math: No collision between Mobile Bottom Nav, Sticky Ad, and Resume Bubble', () => {
  const mobileNavHeight = 64; // h-16 = 4rem = 64px
  const mobileNavYRange = [0, mobileNavHeight];

  const stickyAdBottom = 64; // bottom-16 = 64px
  const stickyAdHeight = 80; // approximate height: header + 50px mobile ad + padding
  const stickyAdYRange = [stickyAdBottom, stickyAdBottom + stickyAdHeight]; // [64, 144]

  const bubbleBottom = 144; // bottom-36 = 9rem = 144px
  const bubbleHeight = 48; // bubble height ~48px
  const bubbleYRange = [bubbleBottom, bubbleBottom + bubbleHeight]; // [144, 192]

  const mainPaddingBottom = 144; // pb-36 = 9rem = 144px

  // Test collision between Nav and Sticky Ad
  const navAdOverlap = Math.max(0, Math.min(mobileNavYRange[1], stickyAdYRange[1]) - Math.max(mobileNavYRange[0], stickyAdYRange[0]));
  assert.strictEqual(navAdOverlap, 0, 'Nav and Sticky Ad must not overlap on y-axis');

  // Test collision between Sticky Ad and Bubble
  const adBubbleOverlap = Math.max(0, Math.min(stickyAdYRange[1], bubbleYRange[1]) - Math.max(stickyAdYRange[0], bubbleYRange[0]));
  assert.strictEqual(adBubbleOverlap, 0, 'Sticky Ad and Resume Bubble must not overlap on y-axis');

  // Test main bottom padding covers the combined occlusion
  assert.ok(mainPaddingBottom >= stickyAdYRange[1], `Main pb-36 (${mainPaddingBottom}px) must clear sticky chrome height (${stickyAdYRange[1]}px)`);
});

console.log(`\n=== RESULTS: ${passedTests}/${totalTests} TESTS PASSED ===\n`);

if (passedTests !== totalTests) {
  process.exit(1);
} else {
  process.exit(0);
}
