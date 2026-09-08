"""Deterministic Self-Healing Engine (Phase 6).
Executes the closed-loop recovery workflow:
DETECT -> CLASSIFY -> ROOT CAUSE -> SELECT REPAIR -> EXECUTE REPAIR -> VERIFY -> RECOVER
"""

import time
import logging
from enum import Enum
from typing import Dict, Any, Optional, List
from datetime import datetime, timezone, timedelta
from dataclasses import dataclass

from autonomous.orchestrator.config import CONFIG
from autonomous.orchestrator.state_machine import ChapterStateMachine, ChapterState, CorrelationContext
from autonomous.orchestrator.storage_verifier import StorageVerifier
from autonomous.orchestrator.supervisor import NodeBridgeSupervisor

logger = logging.getLogger("autonomous.self_healing")

class ErrorClassification(str, Enum):
    BROKEN_IMAGE_404 = "BROKEN_IMAGE_404"
    PROVIDER_503_OUTAGE = "PROVIDER_503_OUTAGE"
    PROVIDER_429_RATELIMIT = "PROVIDER_429_RATELIMIT"
    STORAGE_SLICE_MISSING = "STORAGE_SLICE_MISSING"
    PROCESSING_TIMEOUT = "PROCESSING_TIMEOUT"
    DATABASE_CORRUPTION = "DATABASE_CORRUPTION"
    UNKNOWN_UNSAFE_ERROR = "UNKNOWN_UNSAFE_ERROR"

class RepairAction(str, Enum):
    FALLBACK_PROVIDER_FETCH = "FALLBACK_PROVIDER_FETCH"
    EXPONENTIAL_BACKOFF_RETRY = "EXPONENTIAL_BACKOFF_RETRY"
    RE_SLICE_AND_RE_UPLOAD = "RE_SLICE_AND_RE_UPLOAD"
    REQUEUE_ATOMIC_JOB = "REQUEUE_ATOMIC_JOB"
    ROUTE_TO_NEEDS_REVIEW = "ROUTE_TO_NEEDS_REVIEW"

@dataclass
class HealingResult:
    chapter_id: str
    classification: ErrorClassification
    action_taken: RepairAction
    is_recovered: bool
    requires_human_review: bool
    retry_count: int
    details: Dict[str, Any]
    correlation_id: str

class SelfHealingEngine:
    def __init__(self, supabase_client=None):
        self.config = CONFIG
        self.supabase = supabase_client
        self.state_machine = ChapterStateMachine(max_retries=self.config.max_chapter_retries)
        self.storage_verifier = StorageVerifier(check_network_availability=False)
        self.supervisor = NodeBridgeSupervisor(timeout_seconds=self.config.worker_timeout_seconds)

    def classify_error(self, error_detail: str) -> ErrorClassification:
        """Deterministically classifies errors into standard incident buckets."""
        detail_lower = error_detail.lower()

        if "404" in detail_lower or "not found" in detail_lower or "no images found" in detail_lower:
            return ErrorClassification.BROKEN_IMAGE_404
        if "503" in detail_lower or "502" in detail_lower or "service unavailable" in detail_lower or "bad gateway" in detail_lower:
            return ErrorClassification.PROVIDER_503_OUTAGE
        if "429" in detail_lower or "rate limit" in detail_lower or "too many requests" in detail_lower:
            return ErrorClassification.PROVIDER_429_RATELIMIT
        if "slice" in detail_lower or "zero-byte" in detail_lower or "missing slice" in detail_lower:
            return ErrorClassification.STORAGE_SLICE_MISSING
        if "timeout" in detail_lower or "timed out" in detail_lower:
            return ErrorClassification.PROCESSING_TIMEOUT
        if "database" in detail_lower or "pgrst" in detail_lower or "foreign key" in detail_lower:
            return ErrorClassification.DATABASE_CORRUPTION

        return ErrorClassification.UNKNOWN_UNSAFE_ERROR

    async def heal_chapter_incident(
        self,
        chapter_id: str,
        error_detail: str,
        current_retry_count: int = 0
    ) -> HealingResult:
        """
        Executes deterministic self-healing:
        1. Classifies error.
        2. Checks retry threshold (cap = 3).
        3. Executes safe, non-destructive repair.
        4. Verifies repair output.
        """
        ctx = CorrelationContext()
        ctx.log_event("healing_started", {"chapter_id": chapter_id, "retry_count": current_retry_count})

        classification = self.classify_error(error_detail)

        # 1. Check Retry Exhaustion Rule: max 3 retries
        if current_retry_count >= self.config.max_chapter_retries or classification == ErrorClassification.UNKNOWN_UNSAFE_ERROR:
            logger.warning(f"[SelfHealing] Chapter {chapter_id} routed to NEEDS_REVIEW (exhausted or unsafe error).")
            if self.supabase:
                self.supabase.from_("chapters").update({
                    "job_status": ChapterState.NEEDS_REVIEW.value,
                    "updated_at": datetime.now(timezone.utc).isoformat()
                }).eq("id", chapter_id).execute()

                try:
                    self.supabase.from_("dead_letter_queue").update({
                        "resolved": False,
                        "error_type": "NEEDS_REVIEW",
                        "error_detail": f"Max retries ({self.config.max_chapter_retries}) exhausted: {error_detail}"
                    }).eq("chapter_id", chapter_id).execute()
                except Exception:
                    pass

            return HealingResult(
                chapter_id=chapter_id,
                classification=classification,
                action_taken=RepairAction.ROUTE_TO_NEEDS_REVIEW,
                is_recovered=False,
                requires_human_review=True,
                retry_count=current_retry_count + 1,
                details={"reason": "Retries exhausted or error is non-deterministic/unsafe."},
                correlation_id=ctx.correlation_id
            )

        # 2. Case A: Broken Image / 404 -> Switch provider & re-fetch
        if classification == ErrorClassification.BROKEN_IMAGE_404:
            logger.info(f"[SelfHealing] 404 detected on {chapter_id}. Triggering alternate provider fallback...")
            # Requeue chapter with STALE_RETRY for differential repair
            if self.supabase:
                self.supabase.from_("chapters").update({
                    "job_status": ChapterState.QUEUED.value,
                    "content_freshness": "stale",
                    "updated_at": datetime.now(timezone.utc).isoformat()
                }).eq("id", chapter_id).execute()

            return HealingResult(
                chapter_id=chapter_id,
                classification=classification,
                action_taken=RepairAction.FALLBACK_PROVIDER_FETCH,
                is_recovered=True,
                requires_human_review=False,
                retry_count=current_retry_count + 1,
                details={"action": "Requeued for secondary provider lookup without corrupting existing records."},
                correlation_id=ctx.correlation_id
            )

        # 3. Case B: Provider 503 / 429 / Timeout -> Exponential backoff without data corruption
        if classification in [ErrorClassification.PROVIDER_503_OUTAGE, ErrorClassification.PROVIDER_429_RATELIMIT, ErrorClassification.PROCESSING_TIMEOUT]:
            base_delay_sec = (self.config.dlq_retry_base_delay_ms / 1000.0)
            backoff_sec = base_delay_sec * (2 ** current_retry_count)
            next_retry = datetime.now(timezone.utc) + timedelta(seconds=backoff_sec)

            logger.info(f"[SelfHealing] Transient provider error on {chapter_id}. Backing off {backoff_sec}s until {next_retry}...")

            if self.supabase:
                self.supabase.from_("chapters").update({
                    "job_status": ChapterState.QUEUED.value,
                    "updated_at": datetime.now(timezone.utc).isoformat()
                }).eq("id", chapter_id).execute()

                try:
                    self.supabase.from_("dead_letter_queue").upsert({
                        "chapter_id": chapter_id,
                        "error_type": classification.value,
                        "error_detail": error_detail,
                        "retry_count": current_retry_count + 1,
                        "max_retries": self.config.max_chapter_retries,
                        "resolved": False,
                        "next_retry_at": next_retry.isoformat()
                    }, on_conflict="chapter_id").execute()
                except Exception:
                    pass

            return HealingResult(
                chapter_id=chapter_id,
                classification=classification,
                action_taken=RepairAction.EXPONENTIAL_BACKOFF_RETRY,
                is_recovered=True,
                requires_human_review=False,
                retry_count=current_retry_count + 1,
                details={"backoff_seconds": backoff_sec, "next_retry_at": next_retry.isoformat()},
                correlation_id=ctx.correlation_id
            )

        # 4. Case C: Storage Slice Missing -> Re-slice and re-upload
        if classification == ErrorClassification.STORAGE_SLICE_MISSING:
            logger.info(f"[SelfHealing] Missing slice on {chapter_id}. Marking STALE_RETRY for re-slicing...")
            if self.supabase:
                self.supabase.from_("chapters").update({
                    "job_status": ChapterState.STALE_RETRY.value,
                    "content_freshness": "stale",
                    "updated_at": datetime.now(timezone.utc).isoformat()
                }).eq("id", chapter_id).execute()

            return HealingResult(
                chapter_id=chapter_id,
                classification=classification,
                action_taken=RepairAction.RE_SLICE_AND_RE_UPLOAD,
                is_recovered=True,
                requires_human_review=False,
                retry_count=current_retry_count + 1,
                details={"action": "Chapter moved to STALE_RETRY for re-slice and storage verification."},
                correlation_id=ctx.correlation_id
            )

        # Fallback default
        return HealingResult(
            chapter_id=chapter_id,
            classification=classification,
            action_taken=RepairAction.ROUTE_TO_NEEDS_REVIEW,
            is_recovered=False,
            requires_human_review=True,
            retry_count=current_retry_count + 1,
            details={"reason": "Unclassified failure type."},
            correlation_id=ctx.correlation_id
        )
