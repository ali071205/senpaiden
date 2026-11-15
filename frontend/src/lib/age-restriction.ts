export const AGE_RESTRICTION_COOKIE = "senpaiden_18plus";
export const AGE_RESTRICTION_STORAGE_KEY = "senpaiden_18plus";
export const AGE_RESTRICTION_UPDATED_EVENT = "senpaiden-age-restriction-updated";
export const OPEN_AGE_RESTRICTION_MODAL_EVENT = "senpaiden-open-age-modal";

export const MATURE_GENRES = [
  "Adult",
  "Hentai",
  "Smut",
  "Mature",
  "Ecchi",
  "18+",
  "Erotica",
  "Boys Love",
  "Yaoi",
  "BL",
  "Yuri",
  "GL",
  "Shounen Ai",
  "Shoujo Ai",
] as const;

const MATURE_GENRES_SET = new Set(MATURE_GENRES.map((g) => g.toLowerCase()));

/**
 * Checks if a genre string matches any mature/adult classification.
 */
export function isMatureGenre(genre: string): boolean {
  if (!genre) return false;
  return MATURE_GENRES_SET.has(genre.trim().toLowerCase());
}

/**
 * Checks if a manga's genres list contains any mature/adult genre.
 */
export function isMatureManga(genres?: string[]): boolean {
  if (!genres || !Array.isArray(genres)) return false;
  return genres.some((genre) => isMatureGenre(genre));
}

/**
 * Reads whether 18+ mode is currently enabled on the client.
 * Always returns false as 18+/sexual content is disabled site-wide.
 */
export function getIs18Plus(): boolean {
  return false;
}

/**
 * No-op setter for 18+ mode.
 */
export function setIs18Plus(_enabled: boolean): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(AGE_RESTRICTION_STORAGE_KEY);
    document.cookie = `${AGE_RESTRICTION_COOKIE}=false; path=/; max-age=0; SameSite=Lax`;
  } catch {}
}

/**
 * No-op helper for age modal.
 */
export function openAgeVerificationModal(): void {}

