<div align="center">

# 🏯 Senpai Den

### The Giant-Killer Manga & Manhwa Platform

*Free. Ultra-Fast. Resilient. Zero-Cost Cloud Architecture.*

[![Phase](https://img.shields.io/badge/Phase-Production%20Ready-brightgreen)](docs/project-roadmap.md)
[![Next.js](https://img.shields.io/badge/Next.js-15%20%2F%2016%20App%20Router-black?logo=next.js)](frontend/)
[![Cloudflare](https://img.shields.io/badge/Cloudflare-Workers%20%2B%20R2-F38020?logo=cloudflare)](cloudflare-worker/)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3ECF8E?logo=supabase)](supabase/)
[![HuggingFace](https://img.shields.io/badge/Image%20Worker-HF%20Spaces%20(Docker)-FFD21E?logo=huggingface)](hf-worker/)
[![License](https://img.shields.io/badge/License-MIT-yellow)](LICENSE)

</div>

---

## 📖 Table of Contents

- [Overview](#-overview)
- [Key Features & Killer Advantages](#-key-features--killer-advantages)
- [System Architecture](#-system-architecture)
- [Tech Stack & Cost Breakdown](#-tech-stack--cost-breakdown)
- [Repository Structure](#-repository-structure)
- [Subsystems Deep Dive](#-subsystems-deep-dive)
  - [1. Next.js Frontend (`frontend/`)](#1-nextjs-frontend-frontend)
  - [2. Mission Control Admin Dashboard (`admin-dashboard/`)](#2-mission-control-admin-dashboard-admin-dashboard)
  - [3. Edge API Gateway (`cloudflare-worker/`)](#3-edge-api-gateway-cloudflare-worker)
  - [4. High-Throughput Image Processor (`hf-worker/`)](#4-high-throughput-image-processor-hf-worker)
  - [5. Scraper & Eviction Engine (`github-action/`)](#5-scraper--eviction-engine-github-action)
  - [6. Database & Storage Layer (`supabase/` + R2/B2/GDrive)](#6-database--storage-layer)
- [Getting Started & Local Development](#-getting-started--local-development)
- [Master Service Controls](#-master-service-controls)
- [Audit & Maintenance Tooling](#-audit--maintenance-tooling)
- [Architectural Decisions (Locked)](#-architectural-decisions-locked)
- [Roadmap & Contributing](#-roadmap--contributing)

---

## 🌟 Overview

**Senpai Den** is a high-performance, mobile-first manga and manhwa streaming platform built to out-architect incumbent platforms without requiring corporate infrastructure budgets. Running completely on generous free-tier cloud architectures, Senpai Den delivers sub-second page loads, zero OOM memory crashes on long manhwa vertical strips, high-fidelity offline preloading, and resilient multi-provider failover.

### Why Senpai Den Wins Against Legacy Readers

| Challenge / Metric | Legacy Manga Sites | Senpai Den Architectural Solution |
|---|---|---|
| **Manhwa Memory Crashes** | Massive 15,000px single strips crash mobile browser WebViews | Distributed worker pre-slices strips to uniform **1,500px WebP segments** with BlurHash previews. |
| **Reader Customization** | Locked to rigid single-column vertical scroll | **3 Reading Modes**: Continuous Webtoon, Single Page Flip, and **Double-Spread Manga Book View** with 3 Fit modes (Width, Height, Original). |
| **Multi-Language Support** | Separate fragmented catalog entries per language | **Unified Canonical Hierarchy**: Single manga record with multi-language sub-layers (`en`, `es`, `fr`, `ja`) switched in 1 tap. |
| **Edge Resilience & Outages** | Origin 502/504 errors cascade directly to users | Edge Workers serve cached R2/B2 assets with stale-while-revalidate headers; dead jobs auto-route to Dead Letter Queue (DLQ). |
| **Page Latency & Buffering** | Sequential on-demand page downloads | **In-Memory Slicing Preloader**: Pre-buffers 4–6 upcoming page slices in browser memory for instant flips. |
| **Monetization & UX** | Aggressive pop-unders and screen-covering ads | Non-intrusive, space-reserved Adsterra responsive units (728x90 desktop / 320x50 mobile), **zero top reader ads**, and instant premium ad suppression. |

---

## 🏛️ System Architecture

```
                               ┌────────────────────────────────┐
                               │  GitHub Actions (Hourly Cron)  │
                               │  MangaPill / MangaDex Scrapers │
                               └──────────────┬─────────────────┘
                                              │
                                              ▼
                               ┌────────────────────────────────┐
                               │  Supabase PostgreSQL Database  │
                               │  (State: DISCOVERED / QUEUED)  │
                               └──────────────┬─────────────────┘
                                              │
                                              ▼
                               ┌────────────────────────────────┐
                               │     Hugging Face Space Worker   │
                               │  • Download Remote Images      │
                               │  • Sharp: 1500px Slicing       │
                               │  • WebP Optimization + BlurHash │
                               │  • Upload to Storage Tier      │
                               └──────────────┬─────────────────┘
                                              │
                    ┌─────────────────────────┴─────────────────────────┐
                    ▼                                                   ▼
     ┌──────────────────────────────┐                   ┌──────────────────────────────┐
     │   Cloudflare R2 / B2 CDN     │                   │     Supabase / GDrive DB     │
     │   (READY Slice Artifacts)    │                   │   (Updated Slice Metadata)   │
     └──────────────┬───────────────┘                   └──────────────┬───────────────┘
                    │                                                  │
                    └─────────────────────────┬────────────────────────┘
                                              ▼
                               ┌────────────────────────────────┐
                               │   Cloudflare Workers API Gate  │
                               │   (Edge Caching & Stale-Retry) │
                               └──────────────┬─────────────────┘
                                              │
                    ┌─────────────────────────┴─────────────────────────┐
                    ▼                                                   ▼
     ┌──────────────────────────────┐                   ┌──────────────────────────────┐
     │    Next.js User Platform     │                   │   Mission Control Dashboard  │
     │    (Mobile-First Reader)     │                   │  (Queue, DLQ, Batch Scraper) │
     │    `localhost:3000`          │                   │  `localhost:3001`            │
     └──────────────────────────────┘                   └──────────────────────────────┘
```

### Chapter Ingestion Lifecycle State Machine

```
   [DISCOVERED] ──> [QUEUED] ──> [PROCESSING] ──> [READY] (Served via Edge CDN)
                        │               │
                        │ (Fatal Error) │ (Timeout / Corrupt)
                        ▼               ▼
                     [FAILED] ──────> [DLQ] ──(Admin Action)──> [QUEUED]
                        ▲
                        │ (Provider Outage / Stale Fallback)
                  [STALE_RETRY] ──(24hr Timeout)──> [ARCHIVED]
```

---

## 💻 Tech Stack & Cost Breakdown

| Subsystem | Technology | Purpose | Production Cost |
|---|---|---|---|
| **Client Frontend** | Next.js 15/16 (App Router), React 19, Tailwind CSS | Progressive Web App & Reader | Free (Vercel / Cloudflare Pages) |
| **Admin Control** | Next.js, Tailwind CSS, Lucide Icons | Telemetry, Scraper Triggers, DLQ Manager | Free (Internal Deployment) |
| **Edge API Gateway** | Cloudflare Workers (TypeScript) | Edge routing, CORS, Cache headers | Free (100k req/day) |
| **Database** | Supabase PostgreSQL | Catalogs, chapters, slice metadata, DLQ | Free (500MB DB tier) |
| **Asset Storage** | Cloudflare R2 / Backblaze B2 | High-throughput sliced WebP storage | Free (10GB R2 / 10GB B2) |
| **Image Pipeline** | Hugging Face Spaces (Docker), Node.js, Sharp | Strip slicing, WebP conversion, BlurHash | Free (CPU Basic Space) |
| **Automation** | GitHub Actions Cron | Hourly provider polling & auto-eviction | Free (2,000 CI min/mo) |

**Total Operating Cost: $0.00 / month** *(Scales gracefully to Supabase Pro / R2 Pay-as-you-go as traffic explodes).*

---

## 📁 Repository Structure

```
senpai_den/
├── frontend/                  # Next.js user-facing reading portal & PWA (Port 3000)
│   ├── src/
│   │   ├── app/               # App Router pages (Reader, Catalog, Search, Library, Legal)
│   │   ├── components/        # MangaReaderContainer, AdSlot, Virtualized grids, UI
│   │   └── lib/               # Supabase client, storage resolver, monetization logic
│   └── public/                # Static assets, icons, manifest
│
├── admin-dashboard/           # Dedicated mission control management portal (Port 3001)
│   ├── src/
│   │   ├── app/               # Server Actions, Telemetry & Authentication gate
│   │   ├── components/        # OverviewTab, MangaCatalogManager, BatchIngestion, DLQ
│   │   └── lib/               # Supabase admin instance & queue helpers
│   └── package.json
│
├── cloudflare-worker/         # Edge API Gateway proxy
│   ├── src/index.ts           # Router, edge caching headers & stale-while-revalidate
│   └── wrangler.toml          # Worker configuration & bindings
│
├── hf-worker/                 # Distributed background image processor (Docker)
│   ├── src/
│   │   ├── index.ts           # Supabase polling loop & slice dispatcher
│   │   ├── gdrive.ts          # Google Drive storage fallback adapter
│   │   └── crypto.ts          # Secure credential & token utilities
│   └── Dockerfile
│
├── github-action/             # Provider scrapers & automated maintenance
│   ├── src/providers/         # MangaPill and MangaDex provider adapters
│   └── scripts/               # Scraper cron & 30-day storage eviction runners
│
├── supabase/
│   └── schema.sql             # Full DDL schema, foreign keys, enums, & indexes
│
├── scripts/                   # Comprehensive diagnostic, audit & data migration suite
│   ├── audit_reader_quality.ts# Visual & dimensional slice audit
│   ├── local_scrape_all.js    # Local offline scraper runner
│   ├── reconcile_storage_db.js# Storage vs database sync reconciliation
│   └── seed_multilang.ts      # Multi-language catalog seeder
│
├── docs/                      # Architectural specs, roadmaps, and audit reports
├── docker-compose.yml         # Local S3 (MinIO) storage emulation
├── start_all.sh / .bat / .ps1 # One-click master startup script
├── stop_all.sh / .bat / .ps1  # One-click master shutdown & RAM purge script
├── architecture.md            # Detailed system design specification
├── PRD.md                     # Product Requirements Document
└── README.md                  # Project overview and documentation
```

---

## 🧩 Subsystems Deep Dive

### 1. Next.js Frontend (`frontend/`)
- **Reading Modes**:
  - **Webtoon Mode**: Continuous vertical scroll with zero layout shift, virtualized viewport rendering, and seamless slice stitching.
  - **Single Page Mode**: Traditional clean page-by-page reader.
  - **Double Spread Book View**: Realistic two-page spread rendering for desktop manga immersion with automatic left/right orientation detection.
- **Image Preloader Engine**: An intelligent browser pre-cacher loads the next 4–6 slices in background workers, eliminating reading pauses.
- **Multi-Language Selector**: Real-time chapter sub-layer selection (`en`, `es`, `fr`, `ja`) directly within the reader HUD.
- **Zero-Intrusive Monetization**: Standardized Adsterra responsive units (Desktop 728x90 / Mobile 320x50), sticky bottom anchor banner, and automatic ad unmounting for Premium users.

### 2. Mission Control Admin Dashboard (`admin-dashboard/`)
- **Overview & System Health**: Real-time queue gauges, storage utilization analytics, and job completion metrics.
- **Batch Ingestion Hub**: Multi-stream scrapers to ingest entire series (One Piece, Solo Leveling, Jujutsu Kaisen, etc.) in bulk with live status logs.
- **Manga Catalog Manager**: Live search, cover editor, metadata updates, and individual chapter re-scrape triggers.
- **DLQ Management**: Interactive Dead Letter Queue explorer with one-click retry, error stack inspection, and failure resolution.
- **Security**: Protected by secure password-gate authentication and Server Actions.

### 3. Edge API Gateway (`cloudflare-worker/`)
- Proxies requests between client applications and Supabase/R2 storage.
- Injects edge-level caching (`stale-while-revalidate`, `Cache-Control: public, max-age=86400`).
- Provides CORS enforcement and protects database service credentials.

### 4. High-Throughput Image Processor (`hf-worker/`)
- Polls Supabase for chapters in `QUEUED` state.
- Downloads source image bundles, analyzes aspect ratios, and naive-slices tall vertical manhwa strips into clean 1,500px WebP images using `sharp`.
- Generates BlurHash placeholders for progressive loading.
- Uploads sliced WebP artifacts to Cloudflare R2 / Backblaze B2 / Google Drive and commits `slice_dimensions` JSONB metadata to Supabase.

### 5. Scraper & Eviction Engine (`github-action/`)
- **Scraper Cron**: Ephemeral GitHub Actions workflow polling MangaPill & MangaDex with rate-limiting (2 req/s) and User-Agent rotation.
- **Storage Lifecycle Eviction**: Automated cron identifying chapters older than 30 days, purging image slices from R2 to respect storage budgets while preserving metadata.

### 6. Database & Storage Layer
- **PostgreSQL**: Stores canonical manga records, localized titles (`title_i18n`), multi-language chapter sub-layers, and page slice indexes.
- **Multi-Cloud Storage Strategy**: Primary R2 storage backed by Backblaze B2 and Google Drive adapters for failover redundancy.

---

## 🚀 Getting Started & Local Development

Senpai Den uses a **Hybrid Local Development** paradigm to preserve your local RAM:
- **Database**: Runs in cloud (Supabase Free Tier).
- **Storage**: Cloudflare R2 in cloud OR local MinIO via Docker.
- **Client & Workers**: Run natively with hot reloading.

### Prerequisites
- Node.js 18+ or 20+
- Docker & Docker Compose (optional for local S3)
- Supabase account & Cloudflare account

### Quick Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/your-username/senpai-den.git
   cd senpai_den
   ```

2. **Configure Environment Variables:**
   ```bash
   cp .env.example .env
   # Populate SUPABASE_URL, SUPABASE_ANON_KEY, and SUPABASE_SERVICE_KEY
   cp .env.example frontend/.env.local
   cp .env.example admin-dashboard/.env.local
   ```

3. **Install Dependencies:**
   ```bash
   npm install
   cd frontend && npm install && cd ..
   cd admin-dashboard && npm install && cd ..
   cd hf-worker && npm install && cd ..
   cd cloudflare-worker && npm install && cd ..
   ```

4. **Initialize Database Schema:**
   - Execute [`supabase/schema.sql`](supabase/schema.sql) in your Supabase SQL Editor.

---

## 🛠️ Master Service Controls

Senpai Den includes cross-platform master scripts to control all dev services and free occupied ports with a single command:

### Start All Services
```bash
# Linux / macOS
./start_all.sh

# Windows (Command Prompt)
start_all.bat

# Windows (PowerShell)
.\start_all.ps1
```
- **Frontend Portal**: [http://localhost:3000](http://localhost:3000)
- **Admin Dashboard**: [http://localhost:3001](http://localhost:3001)

### Stop All Services & Free RAM
```bash
# Linux / macOS
./stop_all.sh

# Windows (Command Prompt)
stop_all.bat

# Windows (PowerShell)
.\stop_all.ps1
```

---

## 🔬 Audit & Maintenance Tooling

The [`scripts/`](scripts/) directory contains tools for verification, catalog seeding, and storage auditing:

```bash
# Run comprehensive catalog health check
npx tsx scripts/full_manga_catalog_health.ts

# Inspect slice dimensions and reader image quality
npx tsx scripts/audit_reader_quality.ts

# Reconcile storage buckets against Supabase records
node scripts/reconcile_storage_db.js

# Seed multi-language chapter metadata
npx tsx scripts/seed_multilang.ts

# Run local scraper for all configured top manga
node scripts/local_scrape_all.js
```

---

## 🔒 Architectural Decisions (Locked)

| ID | Specification | Rationale |
|---|---|---|
| `AD-001` | **Stale-Cache Fallback** | On dual provider failure, serve stale R2 image cache; never display hard error screens to users. |
| `AD-002` | **15s Polling Cutoff** | Long-running image jobs poll for 15s with a 5-minute timeout cutoff instead of heavy WebSocket overhead. |
| `AD-003` | **1,500px Uniform Slicing** | Slices vertical manhwa strips into 1500px chunks; stores `slice_dimensions` in Supabase JSONB to prevent mobile canvas OOM. |
| `AD-004` | **30-Day Image Eviction** | Evicts stale image slices after 30 days while retaining full metadata forever for instant on-demand re-fetching. |
| `AD-005` | **Ephemeral Scraper Rate Limits** | Scraper runs under 2 req/s with randomized User-Agent headers to protect provider availability. |
| `AD-006` | **Canonical + Language Sub-Layers** | Single canonical manga entity supporting multi-language chapter child records. |
| `AD-007` | **Reader Immersion Integrity** | Reader top canvas strictly prohibits ad banners; navigation CTA always precedes bottom ad units. |
| `AD-008` | **In-Memory Preloader** | Browsers pre-fetch 4–6 upcoming image slices ahead of user scroll position. |

---

## 🗺️ Roadmap & Contributing

- [x] **Phase 1**: Database schema, relations, DLQ architecture, and multi-language models.
- [x] **Phase 2**: MangaPill & MangaDex provider adapters with UA rotation and rate-limiting.
- [x] **Phase 3**: Hugging Face Docker image slicing engine with Sharp and WebP output.
- [x] **Phase 4**: Cloudflare Workers edge gateway with caching and freshness verification.
- [x] **Phase 5**: Mobile-first Next.js reader (Webtoon / Single / Book View) + PWA support.
- [x] **Phase 6**: Dedicated Mission Control Admin Dashboard (Port 3001) with batch ingestion.
- [x] **Phase 7**: Monetization UX optimization & production Adsterra activation.

Contributions and architectural audits are welcome. Please open an issue or pull request after reviewing the [`architecture.md`](architecture.md) and [`PRD.md`](PRD.md) documents.

---

<div align="center">
Built with architectural obsession. Zero compromises.
</div>
