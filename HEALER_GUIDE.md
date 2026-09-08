# Senpai Den — Healer & Worker CLI Guide

Yeh guide Senpai Den ke **Worker Healer CLI**, **Test Commands**, **Configurable Timers**, aur **Change Audit System** ke liye complete reference manual hai.

---

## 1. Quick Start / Basic Commands

### Healer ko Continuous Loop (Daemon) me chalana
Agar aapko Healer ko lagatar background/foreground me chalana hai bina kisi time limit ke:

```bash
python -m autonomous.orchestrator.main healer
```

**Kya karta hai:**
- Startup par git baseline snapshot create karta hai.
- Autonomous Self-Healing loop monitor karta hai:
  - Worker health & heartbeat
  - Stuck jobs & cleanup
  - Dead Letter Queue (DLQ) automated retry
  - Ingestion queue & watchdog status
- Status terminal par real-time summarize karta hai.
- `Ctrl + C` dabane par clean shutdown aur exact **Change Audit** report print karta hai.

---

### Main Autonomous Ingestion Worker chalana
Agar aapko Healer ke bajaye main Autonomous Worker (ingestion pipeline) run karna hai:

```bash
python -m autonomous.orchestrator.main worker
```
*Ya simply default mode:*
```bash
python -m autonomous.orchestrator.main
```

---

## 2. Configurable Healer Timers (`--timer`)

Healer ko ek specific duration ke baad automatically band (graceful stop) karne ke liye `--timer` flag use karein:

| Duration | Command | Description |
| :--- | :--- | :--- |
| **10 Seconds** | `python -m autonomous.orchestrator.main healer --timer 10s` | Quick 10 second run & audit |
| **30 Seconds (0.5m)** | `python -m autonomous.orchestrator.main healer --timer 0.5m` | Half-minute smoke test |
| **5 Minutes** | `python -m autonomous.orchestrator.main healer --timer 5m` | Short health monitoring |
| **30 Minutes** | `python -m autonomous.orchestrator.main healer --timer 30m` | Standard maintenance run |
| **1 Hour** | `python -m autonomous.orchestrator.main healer --timer 1h` | Hourly healing window |
| **1.5 Hours** | `python -m autonomous.orchestrator.main healer --timer 1.5h` | Decimal hour support |
| **24 Hours** | `python -m autonomous.orchestrator.main healer --timer 24h` | Full day monitor |
| **1 Day** | `python -m autonomous.orchestrator.main healer --timer 1d` | 24 hour equivalent |
| **2 Days** | `python -m autonomous.orchestrator.main healer --timer 2d` | Extended multi-day run |

> **Supported Units:** `s` (seconds), `m` (minutes), `h` (hours), `d` (days). Decimals (`0.5m`, `1.5h`, `0.25d`) fully supported.

---

## 3. Safe Healer Testing Interface (`--test`)

Aap Senpai Den ke individual operations ko bina pure system ko disturb kiye isolated environment me test kar sakte hain.

### A. System & Infrastructure Tests

| Test Target | Command | Purpose |
| :--- | :--- | :--- |
| **Full Health** | `python -m autonomous.orchestrator.main healer --test health` | Supabase, Queue, DLQ, Watchdog health |
| **Queue** | `python -m autonomous.orchestrator.main healer --test queue` | Check pending & active ingestion queue |
| **Worker** | `python -m autonomous.orchestrator.main healer --test worker` | Worker registration & capacity status |
| **Watchdog** | `python -m autonomous.orchestrator.main healer --test watchdog` | Heartbeat & node health checks |
| **Stuck Job** | `python -m autonomous.orchestrator.main healer --test stuck-job` | Scans for stalled tasks > timeout |
| **DLQ** | `python -m autonomous.orchestrator.main healer --test dlq` | Inspect Dead Letter Queue count |
| **DLQ Retry** | `python -m autonomous.orchestrator.main healer --test dlq-retry` | Run DLQ retry evaluation loop |
| **Worker Failure** | `python -m autonomous.orchestrator.main healer --test worker-failure` | Test failover & crash recovery flow |
| **Storage** | `python -m autonomous.orchestrator.main healer --test storage` | Test Cloudflare R2 / Storage connectivity |
| **Provider** | `python -m autonomous.orchestrator.main healer --test provider` | Node.js manga provider bridge check |

---

### B. Manga & Chapter Specific Tests

Aap custom manga title aur chapter number pass karke pipeline test kar sakte hain:

```bash
# 1. General Manga test
python -m autonomous.orchestrator.main healer --test manga

# 2. Specific Manga lookup test
python -m autonomous.orchestrator.main healer --test manga-name --name "One Piece"

# 3. Manga Cover Image & Asset CDN test
python -m autonomous.orchestrator.main healer --test manga-image --name "One Piece"

# 4. Specific Chapter verification
python -m autonomous.orchestrator.main healer --test manga-chapter --name "One Piece" --chapter 100

# 5. Chapter processing & ingestion dry test
python -m autonomous.orchestrator.main healer --test chapter-processing --name "Solo Leveling" --chapter 1
```

> **Missing Argument Validation:** Agar `--name` ya `--chapter` missing hoga, toh python crash hone ke bajaye clean helpful message aayega:
> ```text
> Missing required argument: --name
> Example:
> --test manga-name --name "One Piece"
> ```

---

## 4. Safe Dry-Run Mode (`--dry-run`)

Test karte waqt production Supabase database me bina koi data modify ya write kiye test karne ke liye `--dry-run` lagayein:

```bash
python -m autonomous.orchestrator.main healer --test manga-chapter --name "One Piece" --chapter 100 --dry-run
```

**Output:**
```text
DRY RUN — no persistent changes will be made.
===== HEALER TEST =====
Test: manga-chapter
Input: Manga=One Piece, Chapter=100
Status: PASS
Duration: 0.85s
Operations:
  ✓ Manga lookup (dry-run)
  ✓ Chapter lookup (dry-run)
  ✓ Provider check (dry-run)
  ✓ Storage check (dry-run)
Errors: None
```

---

## 5. Combined Timer + Test Execution

Aap monitor loop me timer ke sath kisi specific test ko run kar sakte hain:

```bash
python -m autonomous.orchestrator.main healer --timer 0.5m --test health
```

```bash
python -m autonomous.orchestrator.main healer --timer 10s --test dlq-retry --dry-run
```

---

## 6. Live Status Output

Healer chalte samay terminal par clean & concise status periodic intervals par show karta hai:

```text
[Healer] Uptime: 00:30 | Queue: 0 | Processing: 0 | DLQ retries: 0 | Watchdog: HEALTHY | Last loop: 15s ago
```

---

## 7. Graceful Shutdown & Change Audit (`Ctrl + C`)

Jab bhi user `Ctrl + C` press karega, koi python traceback dump nahi hoga. System cleanly band hokar baseline ke against repository audit print karega:

```text
[Healer] Shutdown requested by user.
[Healer] Generating change audit...

======================================================================
                     HEALER CHANGE AUDIT REPORT
======================================================================
Modified files: 0
Added files:    0
Deleted files:  0

UNCHANGED CORE ARCHITECTURE:
  [OK] autonomous/phase_state.json
  [OK] Scheduler (autonomous/orchestrator/scheduler.py)
  [OK] Worker (autonomous/orchestrator/worker.py)
  [OK] Self-Healing (autonomous/orchestrator/self_healing.py)
  [OK] Python Brain (autonomous/brain/)
  [OK] Node Provider (autonomous/node/bridge.js)
======================================================================
```

Agar kisi code file me modification hua hoga, to exact line numbers aur changed lines display hongi:
```text
FILE: path/to/file.py
  ADDED LINES:
    + Line 45
  REMOVED LINES:
    - Line 20
```
Runtime logs, cache files, aur temporary files alag category me classify hoti hain taaki false alarms na ho.

---

## 8. Verification & Test Suite

Healer CLI aur Change Auditor ko verify karne ke liye automated tests run karein:

```bash
python -m pytest autonomous/tests/test_healer_hardening.py -v
```
Pure autonomous test suite ke liye:
```bash
python -m pytest autonomous/tests -v
```
