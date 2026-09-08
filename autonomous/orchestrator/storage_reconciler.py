"""Automated Storage Reconciliation Worker.
Audits chapter page slices, detects missing/corrupted assets, and schedules self-healing.
"""

import logging
from typing import Dict, Any, List, Optional
from dataclasses import dataclass
from datetime import datetime, timezone

from autonomous.orchestrator.state_machine import ChapterState, CorrelationContext
from autonomous.orchestrator.storage_manager import StorageManager

logger = logging.getLogger("autonomous.reconciler")

@dataclass
class ReconciliationReport:
    chapter_id: str
    status: str # "HEALTHY" | "DEGRADED" | "EMPTY"
    pages_audited: int
    missing_pages: List[int]
    action_taken: str
    correlation_id: str

class StorageReconciler:
    def __init__(self, supabase_client=None):
        self.supabase = supabase_client
        self.storage_manager = StorageManager()

    async def reconcile_chapter(self, chapter_id: str) -> ReconciliationReport:
        """
        Audits all pages and slices of a chapter.
        If pages/slices are missing or malformed, marks chapter STALE_RETRY for re-processing.
        """
        ctx = CorrelationContext()
        ctx.log_event("storage_reconciliation_started", {"chapter_id": chapter_id})

        if not self.supabase:
            return ReconciliationReport(
                chapter_id=chapter_id,
                status="ERROR",
                pages_audited=0,
                missing_pages=[],
                action_taken="Supabase client not configured",
                correlation_id=ctx.correlation_id
            )

        # 1. Fetch all pages for chapter
        pages_res = self.supabase.from_("pages")\
            .select("id, page_number, r2_keys, slice_dimensions")\
            .eq("chapter_id", chapter_id)\
            .order("page_number", desc=False)\
            .execute()

        pages = pages_res.data or []
        if not pages:
            # 0 pages in database
            action = self._schedule_chapter_repair(chapter_id, "Zero pages recorded in database", ctx)
            return ReconciliationReport(
                chapter_id=chapter_id,
                status="EMPTY",
                pages_audited=0,
                missing_pages=[1],
                action_taken=action,
                correlation_id=ctx.correlation_id
            )

        missing_pages: List[int] = []
        for p in pages:
            p_num = p.get("page_number", 0)
            keys = p.get("r2_keys") or []
            if not isinstance(keys, list) or len(keys) == 0:
                missing_pages.append(p_num)
                continue

            # Verify no empty keys
            if any(not k or not isinstance(k, str) or not k.strip() for k in keys):
                missing_pages.append(p_num)

        if missing_pages:
            reason = f"Missing slice keys on pages: {missing_pages}"
            action = self._schedule_chapter_repair(chapter_id, reason, ctx)
            return ReconciliationReport(
                chapter_id=chapter_id,
                status="DEGRADED",
                pages_audited=len(pages),
                missing_pages=missing_pages,
                action_taken=action,
                correlation_id=ctx.correlation_id
            )

        return ReconciliationReport(
            chapter_id=chapter_id,
            status="HEALTHY",
            pages_audited=len(pages),
            missing_pages=[],
            action_taken="NONE",
            correlation_id=ctx.correlation_id
        )

    def _schedule_chapter_repair(self, chapter_id: str, reason: str, ctx: CorrelationContext) -> str:
        """Schedules chapter repair by transitioning state to STALE_RETRY."""
        logger.warning(f"[Reconciler] Degradation detected on {chapter_id} ({reason}). Scheduling repair...")

        # Update chapter job_status to STALE_RETRY
        self.supabase.from_("chapters").update({
            "job_status": ChapterState.STALE_RETRY.value,
            "content_freshness": "stale",
            "updated_at": datetime.now(timezone.utc).isoformat()
        }).eq("id", chapter_id).execute()

        # Record system event
        try:
            self.supabase.from_("system_events").insert({
                "event_type": "STORAGE_RECONCILIATION",
                "severity": "WARN",
                "source": "storage_reconciler",
                "detail": f"Chapter {chapter_id} scheduled for repair: {reason}",
                "metadata": {
                    "chapter_id": chapter_id,
                    "reason": reason,
                    "correlation_id": ctx.correlation_id
                }
            }).execute()
        except Exception:
            pass

        return "SCHEDULED_FOR_REPAIR (STALE_RETRY)"
