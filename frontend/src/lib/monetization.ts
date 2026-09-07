export const ADS_ENABLED = process.env.NEXT_PUBLIC_ADS_ENABLED === "true";
export const ADS_PREVIEW = process.env.NEXT_PUBLIC_ADS_PREVIEW === "true";

// Google AdSense
export const ADSENSE_CLIENT = process.env.NEXT_PUBLIC_ADSENSE_CLIENT || "";
export const ADSENSE_SLOT_HOME = process.env.NEXT_PUBLIC_ADSENSE_SLOT_HOME || "";
export const ADSENSE_SLOT_DISCOVER = process.env.NEXT_PUBLIC_ADSENSE_SLOT_DISCOVER || "";
export const ADSENSE_SLOT_DETAIL = process.env.NEXT_PUBLIC_ADSENSE_SLOT_DETAIL || "";
export const ADSENSE_SLOT_LIBRARY = process.env.NEXT_PUBLIC_ADSENSE_SLOT_LIBRARY || "";
export const ADSENSE_SLOT_HISTORY = process.env.NEXT_PUBLIC_ADSENSE_SLOT_HISTORY || "";
export const ADSENSE_SLOT_NOTIFICATIONS = process.env.NEXT_PUBLIC_ADSENSE_SLOT_NOTIFICATIONS || "";
export const ADSENSE_SLOT_DISCOVER_BOTTOM = process.env.NEXT_PUBLIC_ADSENSE_SLOT_DISCOVER_BOTTOM || "";

// Adsterra & Custom Ad Networks
export const ADSTERRA_SCRIPT_URL = process.env.NEXT_PUBLIC_ADSTERRA_SCRIPT_URL || "";
export const ADSTERRA_BANNER_KEY = process.env.NEXT_PUBLIC_ADSTERRA_BANNER_KEY || "";
export const ADSTERRA_BANNER_HTML = process.env.NEXT_PUBLIC_ADSTERRA_BANNER_HTML || "";
export const ADSTERRA_DESKTOP_KEY = "2de4d4b4a2f675e5880e6d1004852c8b"; // 728x90
export const ADSTERRA_MOBILE_KEY = "e595c21e4de14999cdb8003e66163d4b";   // 320x50
export const ADSTERRA_NATIVE_CONTAINER = "container-d151fe0fbadd628be5d88b715d6a1e68";
export const ADSTERRA_NATIVE_SRC = "https://pl30953537.effectivecpmnetwork.com/d151fe0fbadd628be5d88b715d6a1e68/invoke.js";
export const ADSTERRA_SMARTLINK_URL = process.env.NEXT_PUBLIC_ADSTERRA_SMARTLINK_URL || "https://www.profitableratecpmnetwork.com/jb3rsspv0?key=6f199363c5a64c848cdb187fbb9d47f9";

export const AD_PLACEMENT_ENABLED: Record<AdPlacement, boolean> = {
  "home-feed": process.env.NEXT_PUBLIC_ADS_PLACEMENT_HOME !== "false",
  "discover-grid": process.env.NEXT_PUBLIC_ADS_PLACEMENT_DISCOVER !== "false",
  "manga-detail": process.env.NEXT_PUBLIC_ADS_PLACEMENT_DETAIL !== "false",
  "reader-top": process.env.NEXT_PUBLIC_ADS_PLACEMENT_READER_TOP !== "false",
  "reader-bottom": process.env.NEXT_PUBLIC_ADS_PLACEMENT_READER_BOTTOM !== "false",
  "library-bottom": process.env.NEXT_PUBLIC_ADS_PLACEMENT_LIBRARY !== "false",
  "history-bottom": process.env.NEXT_PUBLIC_ADS_PLACEMENT_HISTORY !== "false",
  "notifications-bottom": process.env.NEXT_PUBLIC_ADS_PLACEMENT_NOTIFICATIONS !== "false",
  "discover-bottom": process.env.NEXT_PUBLIC_ADS_PLACEMENT_DISCOVER_BOTTOM !== "false",
};

export type AdPlacement =
  | "home-feed"
  | "discover-grid"
  | "manga-detail"
  | "reader-top"
  | "reader-bottom"
  | "library-bottom"
  | "history-bottom"
  | "notifications-bottom"
  | "discover-bottom";

export const AD_SLOT_BY_PLACEMENT: Record<AdPlacement, string> = {
  "home-feed": ADSENSE_SLOT_HOME,
  "discover-grid": ADSENSE_SLOT_DISCOVER,
  "manga-detail": ADSENSE_SLOT_DETAIL,
  "reader-top": process.env.NEXT_PUBLIC_ADSENSE_SLOT_READER_TOP || "",
  "reader-bottom": process.env.NEXT_PUBLIC_ADSENSE_SLOT_READER_BOTTOM || "",
  "library-bottom": ADSENSE_SLOT_LIBRARY,
  "history-bottom": ADSENSE_SLOT_HISTORY,
  "notifications-bottom": ADSENSE_SLOT_NOTIFICATIONS,
  "discover-bottom": ADSENSE_SLOT_DISCOVER_BOTTOM,
};

export function canServeAdsInBrowser() {
  if (typeof window === "undefined") return false;
  return true;
}

