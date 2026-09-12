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
 */
export function getIs18Plus(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const local = localStorage.getItem(AGE_RESTRICTION_STORAGE_KEY);
    if (local === "true") return true;
    if (local === "false") return false;

    // Fallback to cookie check
    const match = document.cookie.match(new RegExp(`(^|;\\s*)${AGE_RESTRICTION_COOKIE}=([^;]*)`));
    return match ? match[2] === "true" : false;
  } catch {
    return false;
  }
}

/**
 * Updates 18+ mode in localStorage, cookie, and dispatches a broadcast event.
 */
export function setIs18Plus(enabled: boolean): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(AGE_RESTRICTION_STORAGE_KEY, enabled ? "true" : "false");
    const maxAge = enabled ? 31536000 : 0;
    document.cookie = `${AGE_RESTRICTION_COOKIE}=${enabled ? "true" : "false"}; path=/; max-age=${maxAge}; SameSite=Lax`;
  } catch (err) {
    console.error("Failed to persist age restriction setting:", err);
  }

  window.dispatchEvent(
    new CustomEvent(AGE_RESTRICTION_UPDATED_EVENT, {
      detail: { is18Plus: enabled },
    })
  );
}

/**
 * Helper to trigger the global Age Confirmation Modal.
 */
export function openAgeVerificationModal(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(OPEN_AGE_RESTRICTION_MODAL_EVENT));
}
