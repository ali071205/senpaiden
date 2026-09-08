# 🛡️ Senpai Den — Mission Control Admin Dashboard

The administrative operations control panel for Senpai Den, built with **Next.js 15 App Router**, **React 19**, and **Tailwind CSS**.

---

## ⚡ Features & Capabilities

- **System Telemetry & Health Gauges (`OverviewTab.tsx`)**:
  - Live chapter processing states (`DISCOVERED`, `QUEUED`, `PROCESSING`, `READY`, `FAILED`, `ARCHIVED`).
  - Storage bucket usage and sync health.
  - Failure rate monitors and real-time auto-refresh telemetry.
- **Batch Ingestion Pipelines (`BatchIngestionControl.tsx`)**:
  - Ingest top-tier manga catalogs in bulk (One Piece, Solo Leveling, Jujutsu Kaisen, Chainsaw Man, etc.).
  - Real-time SSE/stream ingestion log output and error traps.
- **Manga Catalog Manager (`MangaCatalogManager.tsx`)**:
  - Full CRUD operations over manga series.
  - Edit cover URLs, descriptions, genres, and localized titles.
  - Trigger individual chapter re-scrape or re-slice jobs.
- **Manual Scraper Control (`ManualScraperControl.tsx`)**:
  - Direct on-demand scraping triggers for MangaPill and MangaDex.
  - Custom target URL or manga slug scraping with user-agent spoofing.
- **Dead Letter Queue Manager (`DlqManager.tsx`)**:
  - Inspect failed job stack traces and provider rejection logs.
  - One-click bulk retry or resolution.
- **Security**:
  - Password gate session authentication protecting all Next.js Server Actions.

---

## 🚀 Running Locally

```bash
# Install dependencies
npm install

# Setup environment variables
cp ../.env.example .env.local

# Run development server on port 3001
npm run dev

# Run production build
npm run build
```

The dashboard will be available at [http://localhost:3001](http://localhost:3001).
