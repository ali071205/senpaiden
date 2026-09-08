# 🏯 Senpai Den — Frontend Portal

The client-facing Progressive Web App (PWA) for Senpai Den, built with **Next.js 15/16 App Router**, **React 19**, and **Tailwind CSS**.

---

## ⚡ Key Features

- **3 Dynamic Reader Modes**:
  - **Webtoon Mode**: Continuous vertical scroll with zero layout shift and virtualized rendering.
  - **Single Page Flip**: Classic digital reader mode.
  - **Double Spread Book View**: Two-page book rendering with automated Japanese right-to-left (RTL) reading layout.
- **In-Memory Slice Preloader**: Background preloading of 4–6 upcoming image segments to ensure zero buffering during reading.
- **Multi-Language Sub-Layer Switcher**: 1-tap switching between language scans (`en`, `es`, `fr`, `ja`).
- **Responsive Monetization UX**:
  - Non-intrusive, space-reserved Adsterra banner units (728x90 desktop / 320x50 mobile).
  - Sticky bottom anchor ad that intelligently avoids mobile navigation collisions.
  - Reader canvas is ad-free at the top; next chapter navigation button always appears above bottom ads.
  - Premium subscriber ad-suppression check (`hasActivePremium()`).
- **SEO & Discoverability**: Dynamic OpenGraph tags, JSON-LD structured schema, dynamic `sitemap.ts`, and `robots.ts`.

---

## 🚀 Running Locally

```bash
# Install dependencies
npm install

# Setup environment variables
cp ../.env.example .env.local

# Run development server on port 3000
npm run dev

# Run production build & verify
npm run build
```

---

## 📂 Architecture & Directory Structure

- `src/app/`: App router routes (Manga details, Chapter Reader, Catalog Search, Discovery, Bookmarks, History).
- `src/components/`: Modular UI units (`MangaReaderContainer.tsx`, `AdSlot.tsx`, `SiteLayout.tsx`, `FeaturedHeroCarousel.tsx`).
- `src/lib/`: Database clients (`supabase.ts`), monetization switches (`monetization.ts`), and client utilities.
