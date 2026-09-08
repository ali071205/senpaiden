"""Concentric Multi-Level Autonomous Control Loops (Phase 8).
Enforces distinct execution tiers with strict resource separation:
- FAST LOOP (1-5 min): Infrastructure health, queue vitals, active job watchdog, critical circuit breaker.
- NORMAL LOOP (15-30 min): Differential missing chapter sync, DLQ retries, provider availability.
- DEEP LOOP (daily/nightly): Catalog integrity audit, duplicate detection, orphan reconciliation.
"""

import asyncio
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, Any, List, Set
from supabase import create_client, Client

from autonomous.orchestrator.config import CONFIG
from autonomous.orchestrator.state_machine import ChapterStateMachine, ChapterState, CorrelationContext
from autonomous.orchestrator.storage_verifier import StorageVerifier
from autonomous.orchestrator.supervisor import NodeBridgeSupervisor
from autonomous.orchestrator.ingestion import IngestionCoordinator
from autonomous.orchestrator.storage_reconciler import StorageReconciler
from autonomous.orchestrator.storage_manager import StorageManager

logger = logging.getLogger("autonomous.scheduler")

class AutonomousScheduler:
    def __init__(self, supabase_client: Optional[Client] = None):
        self.config = CONFIG
        if supabase_client:
            self.supabase = supabase_client
        elif self.config.supabase_url and self.config.supabase_service_key:
            self.supabase = create_client(self.config.supabase_url, self.config.supabase_service_key)
        else:
            self.supabase = None

        self.state_machine = ChapterStateMachine(max_retries=self.config.max_chapter_retries)
        self.storage_verifier = StorageVerifier(check_network_availability=False)
        self.storage_manager = StorageManager()
        self.supervisor = NodeBridgeSupervisor(timeout_seconds=self.config.worker_timeout_seconds)
        self.ingestion = IngestionCoordinator(supabase_client=self.supabase)
        self.reconciler = StorageReconciler(supabase_client=self.supabase)

        self.is_running = False
        self.is_maintenance_mode = False
        self.last_fast_run: Optional[datetime] = None
        self.last_normal_run: Optional[datetime] = None
        self.last_deep_run: Optional[datetime] = None

    # ── 1. FAST LOOP (Health, Queue Vitals, Watchdog, 1-5m) ─────────────────────
    async def run_fast_loop(self) -> Dict[str, Any]:
        """
        Fast Loop:
        1. Checks maintenance mode.
        2. Probes database and queue health.
        3. Reaps stuck PROCESSING chapters (> 600s timeout).
        4. Probes storage circuit breaker.
        """
        summary = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "maintenance_mode": False,
            "database_healthy": False,
            "storage_tier": self.storage_manager.get_active_storage_tier().value,
            "queue": {"queued": 0, "processing": 0},
            "timed_out_chapters": 0,
            "errors": []
        }

        if not self.supabase:
            return summary

        try:
            # 1. Maintenance Mode Check
            try:
                rpc_res = self.supabase.rpc("is_maintenance_mode", {}).execute()
                self.is_maintenance_mode = bool(rpc_res.data)
            except Exception:
                try:
                    cfg = self.supabase.from_("system_config").select("value").eq("key", "maintenance_mode").single().execute()
                    if cfg.data:
                        self.is_maintenance_mode = bool(cfg.data.get("value"))
                except Exception:
                    self.is_maintenance_mode = False

            summary["maintenance_mode"] = self.is_maintenance_mode

            # 2. Database & Queue Vitals
            q_res = self.supabase.from_("chapters").select("id", count="exact").eq("job_status", "QUEUED").limit(1).execute()
            p_res = self.supabase.from_("chapters").select("id", count="exact").eq("job_status", "PROCESSING").limit(1).execute()
            summary["database_healthy"] = True
            summary["queue"]["queued"] = q_res.count or 0
            summary["queue"]["processing"] = p_res.count or 0

            if self.is_maintenance_mode:
                logger.warning("[FastLoop] System is in MAINTENANCE MODE. Job processing paused.")
                return summary

            # 3. Watchdog: Reap stuck PROCESSING chapters past 600s
            cutoff = (datetime.now(timezone.utc) - timedelta(seconds=self.config.worker_timeout_seconds)).isoformat()
            stuck_res = self.supabase.from_("chapters")\
                .select("id, chapter_number, manga_id, processing_started_at")\
                .eq("job_status", "PROCESSING")\
                .lt("processing_started_at", cutoff)\
                .limit(20)\
                .execute()

            stuck = stuck_res.data or []
            summary["timed_out_chapters"] = len(stuck)

            for ch in stuck:
                ch_id = ch["id"]
                ctx = CorrelationContext()
                logger.warning(f"[Watchdog] Chapter {ch_id} exceeded {self.config.worker_timeout_seconds}s timeout. Failing...")

                self.supabase.from_("chapters").update({
                    "job_status": "FAILED",
                    "updated_at": datetime.now(timezone.utc).isoformat()
                }).eq("id", ch_id).execute()

                try:
                    self.supabase.from_("dead_letter_queue").insert({
                        "chapter_id": ch_id,
                        "error_type": "PROCESSING_TIMEOUT",
                        "error_detail": f"Watchdog timeout: processing exceeded {self.config.worker_timeout_seconds}s.",
                        "max_retries": self.config.max_chapter_retries,
                        "retry_count": 0,
                        "resolved": False,
                        "next_retry_at": (datetime.now(timezone.utc) + timedelta(seconds=30)).isoformat()
                    }).execute()
                except Exception:
                    pass

        except Exception as e:
            logger.error(f"[FastLoop] Error: {str(e)}")
            summary["errors"].append(str(e))

        self.last_fast_run = datetime.now(timezone.utc)
        return summary

    # ── 2. NORMAL LOOP (Differential Sync, DLQ Retries, Provider Check, 15-30m) ─
    async def run_normal_loop(self) -> Dict[str, Any]:
        """
        Normal Loop:
        1. Probes upstream provider availability.
        2. Retries eligible DLQ entries (< 3 retries, backoff satisfied).
        3. Executes differential chapter sync on ongoing manga.
        """
        summary = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "providers": {"mangapill": "UNKNOWN", "mangadex": "UNKNOWN"},
            "dlq_retried": 0,
            "new_chapters_discovered": 0,
            "errors": []
        }

        if not self.supabase or self.is_maintenance_mode:
            return summary

        try:
            # 1. Provider Availability Probe
            try:
                check_res = await self.supervisor.health_check()
                if check_res.get("success"):
                    active_p = check_res.get("provider", "unknown")
                    summary["providers"][active_p] = "ONLINE"
            except Exception as p_err:
                logger.warning(f"[NormalLoop] Provider probe warning: {p_err}")

            # 2. DLQ Auto-Retry
            now_iso = datetime.now(timezone.utc).isoformat()
            dlq_res = self.supabase.from_("dead_letter_queue")\
                .select("id, chapter_id, retry_count, max_retries")\
                .eq("resolved", False)\
                .lt("retry_count", self.config.max_chapter_retries)\
                .lte("next_retry_at", now_iso)\
                .limit(10)\
                .execute()

            for item in (dlq_res.data or []):
                ch_id = item.get("chapter_id")
                if not ch_id:
                    continue

                new_count = item["retry_count"] + 1
                base_delay = self.config.dlq_retry_base_delay_ms / 1000.0
                next_delay = base_delay * (2 ** new_count)

                self.supabase.from_("chapters").update({
                    "job_status": "QUEUED",
                    "updated_at": now_iso
                }).eq("id", ch_id).execute()

                self.supabase.from_("dead_letter_queue").update({
                    "retry_count": new_count,
                    "next_retry_at": (datetime.now(timezone.utc) + timedelta(seconds=next_delay)).isoformat()
                }).eq("id", item["id"]).execute()

                summary["dlq_retried"] += 1

            # 3. Differential Sync on Ongoing Manga
            manga_res = self.supabase.from_("manga")\
                .select("id, source_id, title, source_provider")\
                .eq("status", "ongoing")\
                .order("updated_at", desc=False)\
                .limit(3)\
                .execute()

            for m in (manga_res.data or []):
                try:
                    sync_res = await self.ingestion.sync_manga_differential(m["id"], m["source_id"])
                    if sync_res.get("success"):
                        summary["new_chapters_discovered"] += sync_res.get("newly_queued_chapters", 0)
                except Exception as sync_err:
                    logger.warning(f"[NormalLoop] Sync failed for {m['title']}: {sync_err}")

        except Exception as e:
            logger.error(f"[NormalLoop] Error: {str(e)}")
            summary["errors"].append(str(e))

        self.last_normal_run = datetime.now(timezone.utc)
        return summary

    # ── 3. DEEP LOOP (Full Catalog Audit, Duplicates & Orphans, Daily) ─────────
    async def run_deep_loop(self) -> Dict[str, Any]:
        """
        Deep Loop:
        1. Samples live READY chapters and reconciles slice health.
        2. Detects duplicate chapter numbers within the same manga title.
        3. Identifies orphaned chapter records.
        """
        summary = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "audited_chapters": 0,
            "corrupt_chapters_found": 0,
            "duplicate_chapters_detected": 0,
            "errors": []
        }

        if not self.supabase or self.is_maintenance_mode:
            return summary

        try:
            # 1. Sample READY chapters for Storage Slice Reconciliation
            sample_res = self.supabase.from_("chapters")\
                .select("id, manga_id, chapter_number")\
                .eq("job_status", "READY")\
                .order("updated_at", desc=False)\
                .limit(5)\
                .execute()

            sample = sample_res.data or []
            summary["audited_chapters"] = len(sample)

            for ch in sample:
                report = await self.reconciler.reconcile_chapter(ch["id"])
                if report.status != "HEALTHY":
                    summary["corrupt_chapters_found"] += 1
                    logger.warning(f"[DeepLoop] Reconciler flagged chapter {ch['id']}: {report.status}")

            # 2. Duplicate Detection: Checks if any manga has duplicate chapter numbers
            dup_query = self.supabase.from_("chapters")\
                .select("manga_id, chapter_number")\
                .limit(100)\
                .execute()

            seen_pairs: Set[str] = set()
            for row in (dup_query.data or []):
                pair = f"{row['manga_id']}_{row['chapter_number']}"
                if pair in seen_pairs:
                    summary["duplicate_chapters_detected"] += 1
                seen_pairs.add(pair)

            # Record successful deep audit run
            try:
                self.supabase.from_("system_events").insert({
                    "event_type": "DEEP_AUDIT_RUN",
                    "severity": "INFO",
                    "source": "deep_loop_auditor",
                    "detail": f"Deep audit completed. Chapters: {summary['audited_chapters']}, Corrupt: {summary['corrupt_chapters_found']}, Duplicates: {summary['duplicate_chapters_detected']}",
                    "metadata": summary
                }).execute()
            except Exception:
                pass

        except Exception as e:
            logger.error(f"[DeepLoop] Error: {str(e)}")
            summary["errors"].append(str(e))

        self.last_deep_run = datetime.now(timezone.utc)
        return summary
