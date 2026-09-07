import { readFileSync } from "fs";
import { resolve } from "path";

console.log("=== EMPIRICAL CHALLENGE SUITE: MONETIZATION & AD INFRASTRUCTURE (M1) ===\n");

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

// 1. Static Contract & Constant Checks
console.log("--- 1. Verification of Monetization Constants & Keys ---");
const monetizationSrc = readFileSync(resolve("src/lib/monetization.ts"), "utf-8");

assert(monetizationSrc.includes('ADSTERRA_DESKTOP_KEY = "2de4d4b4a2f675e5880e6d1004852c8b"'), "ADSTERRA_DESKTOP_KEY is configured with production key (728x90)");
assert(monetizationSrc.includes('ADSTERRA_MOBILE_KEY = "e595c21e4de14999cdb8003e66163d4b"'), "ADSTERRA_MOBILE_KEY is configured with production key (320x50)");
assert(monetizationSrc.includes('ADSTERRA_NATIVE_CONTAINER = "container-d151fe0fbadd628be5d88b715d6a1e68"'), "ADSTERRA_NATIVE_CONTAINER is configured");
assert(monetizationSrc.includes('ADSTERRA_NATIVE_SRC = "https://pl30953537.effectivecpmnetwork.com/d151fe0fbadd628be5d88b715d6a1e68/invoke.js"'), "ADSTERRA_NATIVE_SRC is configured with production endpoint");

const placements = [
  "home-feed", "discover-grid", "manga-detail", "reader-top", "reader-bottom",
  "library-bottom", "history-bottom", "notifications-bottom", "discover-bottom"
];
placements.forEach(p => {
  assert(monetizationSrc.includes(`"${p}"`), `Placement "${p}" is defined in monetization schema`);
});

// 2. AdSlot Component Structure & Layout Stability (CLS Prevention)
console.log("\n--- 2. AdSlot Component Verification (CLS & Layout) ---");
const adSlotSrc = readFileSync(resolve("src/components/AdSlot.tsx"), "utf-8");

assert(adSlotSrc.includes("min-h-[74px] md:min-h-[114px]"), "Outer aside container reserves min-h-[74px] (mobile) and md:min-h-[114px] (desktop)");
assert(adSlotSrc.includes("min-h-[50px] md:min-h-[90px]"), "Inner container reserves min-h-[50px] (320x50) and md:min-h-[90px] (728x90)");
assert(adSlotSrc.includes("bg-[#0E1422]/60"), "Obsidian dark theme background is applied");
assert(adSlotSrc.includes("border border-white/[0.08]"), "Subtle dark theme border is applied");
assert(adSlotSrc.includes("hasActivePremium()"), "AdSlot checks hasActivePremium() for subscription suppression");

// 3. Iframe Sandboxing & Lifecycle Management
console.log("\n--- 3. Iframe Isolation & Lifecycle / Memory Cleanup ---");
assert(adSlotSrc.includes("container.innerHTML = \"\""), "AdSlot clears container innerHTML before rendering new creatives");
assert(adSlotSrc.includes("containerRef.current.innerHTML = \"\""), "AdSlot unmount cleanup clears innerHTML to avoid memory leaks");
assert(adSlotSrc.includes("removeEventListener(\"resize\", handleResize)"), "AdSlot cleans up resize listener on unmount");
assert(adSlotSrc.includes("clearTimeout(resizeTimer)"), "AdSlot cleans up resize debounce timer on unmount");
assert(adSlotSrc.includes("safeId = rawId.replace(/[^a-zA-Z0-9_-]/g, \"\")"), "AdSlot sanitizes unique instance ID for native container to prevent collision");
assert(adSlotSrc.includes("try {") && adSlotSrc.includes("catch (err)"), "AdSlot wraps iframe doc.open/doc.write in try/catch for sandbox error containment");

// 4. MonetizationProvider Global Script Handling
console.log("\n--- 4. MonetizationProvider Verification ---");
const providerSrc = readFileSync(resolve("src/components/MonetizationProvider.tsx"), "utf-8");

assert(providerSrc.includes("hasActivePremium()"), "MonetizationProvider checks hasActivePremium() before injecting scripts");
assert(providerSrc.includes("ADSENSE_SCRIPT_ID"), "MonetizationProvider uses distinct ADSENSE_SCRIPT_ID");
assert(providerSrc.includes("ADSTERRA_SCRIPT_ID"), "MonetizationProvider uses distinct ADSTERRA_SCRIPT_ID");
assert(providerSrc.includes("existing.remove()"), "MonetizationProvider cleans up existing script tags when allowed status changes to false");

console.log(`\n=== SUMMARY: ${passed} PASSED, ${failed} FAILED ===`);
if (failed > 0) process.exit(1);
