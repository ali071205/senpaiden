"use client";

export const FASTPASS_UPDATED_EVENT = "senpai_fastpass_updated";

/**
 * Checks if a chapter is considered "FastPass Early Access" (the top 3 latest chapters for series with > 3 chapters)
 */
export function isChapterFastPass(chapterNumber: number, latestChapter: number, totalChapters: number): boolean {
  if (totalChapters <= 3) return false;
  return chapterNumber > latestChapter - 3;
}

/**
 * Gets the list of unlocked chapter numbers for a manga from localStorage
 */
export function getUnlockedChapters(mangaId: string): number[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(`senpai_unlocked_${mangaId}`);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * Checks whether a specific chapter is unlocked (either not FastPass, or unlocked by user)
 */
export function isChapterUnlocked(mangaId: string, chapterNumber: number, latestChapter?: number, totalChapters?: number): boolean {
  if (typeof window === "undefined") return true;
  
  // If not FastPass, always unlocked
  if (latestChapter !== undefined && totalChapters !== undefined) {
    if (!isChapterFastPass(chapterNumber, latestChapter, totalChapters)) {
      return true;
    }
  }

  const unlockedList = getUnlockedChapters(mangaId);
  return unlockedList.includes(chapterNumber);
}

/**
 * Unlocks a FastPass chapter for the current device and broadcasts update event
 */
export function unlockChapter(mangaId: string, chapterNumber: number): void {
  if (typeof window === "undefined") return;
  try {
    const current = getUnlockedChapters(mangaId);
    if (!current.includes(chapterNumber)) {
      current.push(chapterNumber);
      localStorage.setItem(`senpai_unlocked_${mangaId}`, JSON.stringify(current));
      window.dispatchEvent(new CustomEvent(FASTPASS_UPDATED_EVENT, { detail: { mangaId, chapterNumber } }));
    }
  } catch (err) {
    console.error("Failed to persist chapter unlock:", err);
  }
}
