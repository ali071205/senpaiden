"""AI Error Analyzer & Guarded Repair Planner (Phase 7).
Executes bounded root cause analysis and generates validated repair proposals.
Strict Guardrails: AI cannot perform unrestricted mutations, drop data, or bypass retry limits.
"""

import re
import json
import logging
from typing import Dict, Any, Optional, List
from dataclasses import dataclass
from datetime import datetime, timezone

from autonomous.orchestrator.self_healing import ErrorClassification, RepairAction
from autonomous.orchestrator.state_machine import CorrelationContext

logger = logging.getLogger("autonomous.ai_analyzer")

# Forbidden destructive patterns
FORBIDDEN_SQL_PATTERNS = [
    r"\bDROP\s+TABLE\b",
    r"\bDELETE\s+FROM\b",
    r"\bTRUNCATE\b",
    r"\bALTER\s+TABLE\b",
    r"\bUPDATE\s+.*SET\s+.*WHERE\s+1=1\b",
]

ALLOWED_ACTIONS = {
    RepairAction.FALLBACK_PROVIDER_FETCH.value,
    RepairAction.EXPONENTIAL_BACKOFF_RETRY.value,
    RepairAction.RE_SLICE_AND_RE_UPLOAD.value,
    RepairAction.REQUEUE_ATOMIC_JOB.value,
    RepairAction.ROUTE_TO_NEEDS_REVIEW.value,
}

class SafetyViolationError(Exception):
    """Raised when an AI proposed plan violates safety constraints."""
    pass

@dataclass
class GuardedRepairPlan:
    plan_id: str
    incident_id: str
    chapter_id: str
    root_cause_hypothesis: str
    pattern_category: str
    recommended_action: str
    suggested_backoff_sec: int
    confidence_score: float
    explanation: str
    is_safety_validated: bool
    rejection_reason: Optional[str] = None
    created_at: str = ""

class SafetyGuardrail:
    @staticmethod
    def validate_plan(plan: GuardedRepairPlan) -> bool:
        """
        Deterministic safety validator:
        1. Action must be in ALLOWED_ACTIONS.
        2. Plan explanation/parameters must not contain destructive commands.
        3. Backoff must be bounded (0s to 3600s).
        4. Confidence must be valid probability (0.0 to 1.0).
        """
        # 1. Action Whitelist
        if plan.recommended_action not in ALLOWED_ACTIONS:
            plan.is_safety_validated = False
            plan.rejection_reason = f"Action '{plan.recommended_action}' is not in allowed repair whitelist."
            return False

        # 2. Check for destructive SQL injection in explanation
        combined_text = f"{plan.root_cause_hypothesis} {plan.explanation}"
        for pattern in FORBIDDEN_SQL_PATTERNS:
            if re.search(pattern, combined_text, re.IGNORECASE):
                plan.is_safety_validated = False
                plan.rejection_reason = f"Destructive SQL command pattern detected: {pattern}"
                return False

        # 3. Backoff bounds
        if plan.suggested_backoff_sec < 0 or plan.suggested_backoff_sec > 3600:
            plan.is_safety_validated = False
            plan.rejection_reason = f"Backoff ({plan.suggested_backoff_sec}s) exceeds safe boundaries (0-3600s)."
            return False

        # 4. Confidence bounds
        if not (0.0 <= plan.confidence_score <= 1.0):
            plan.is_safety_validated = False
            plan.rejection_reason = f"Confidence ({plan.confidence_score}) outside [0.0, 1.0]."
            return False

        plan.is_safety_validated = True
        plan.rejection_reason = None
        return True

class AIErrorAnalyzer:
    def __init__(self, supabase_client=None):
        self.supabase = supabase_client
        self.guardrail = SafetyGuardrail()

    async def analyze_incident(
        self,
        incident_id: str,
        chapter_id: str,
        error_detail: str,
        classification: ErrorClassification,
        retry_count: int = 0
    ) -> GuardedRepairPlan:
        """
        Analyzes an incident, determines root cause, and synthesizes a safe repair plan.
        """
        ctx = CorrelationContext()
        ctx.log_event("ai_analysis_started", {"incident_id": incident_id, "chapter_id": chapter_id})

        detail_lower = error_detail.lower()

        # Deterministic Root-Cause & Pattern Synthesis Engine
        if classification == ErrorClassification.BROKEN_IMAGE_404:
            pattern = "UPSTREAM_ASSET_REMOVAL"
            hypothesis = "Upstream provider changed image URL hash or deleted original chapter asset."
            action = RepairAction.FALLBACK_PROVIDER_FETCH.value
            backoff = 0
            conf = 0.95
            explanation = "Switch to alternate scanlation provider (MangaDex fallback) to fetch intact image assets."

        elif classification == ErrorClassification.PROVIDER_503_OUTAGE:
            pattern = "TRANSIENT_GATEWAY_OUTAGE"
            hypothesis = "Upstream scanlation server experiencing high load or Cloudflare maintenance."
            action = RepairAction.EXPONENTIAL_BACKOFF_RETRY.value
            backoff = min(30 * (2 ** retry_count), 600)
            conf = 0.90
            explanation = f"Apply exponential backoff ({backoff}s) and probe provider health before retrying."

        elif classification == ErrorClassification.PROVIDER_429_RATELIMIT:
            pattern = "CONCURRENCY_BURST_RATE_LIMIT"
            hypothesis = "Request rate exceeded upstream provider limits (2 req/s or 100 req/run cap)."
            action = RepairAction.EXPONENTIAL_BACKOFF_RETRY.value
            backoff = min(60 * (2 ** retry_count), 900)
            conf = 0.92
            explanation = f"Pause requests to provider for {backoff}s to let token bucket replenish."

        elif classification == ErrorClassification.STORAGE_SLICE_MISSING:
            pattern = "INCOMPLETE_UPLOAD_SLICE"
            hypothesis = "Page slicing completed but network interrupt aborted storage upload."
            action = RepairAction.RE_SLICE_AND_RE_UPLOAD.value
            backoff = 10
            conf = 0.88
            explanation = "Re-trigger image slicing and upload with storage verification gate."

        else:
            pattern = "UNCLASSIFIED_ANOMALY"
            hypothesis = "Non-deterministic failure requiring developer or admin inspection."
            action = RepairAction.ROUTE_TO_NEEDS_REVIEW.value
            backoff = 0
            conf = 0.50
            explanation = "Error details do not match known recovery patterns. Route to NEEDS_REVIEW."

        # Construct Plan
        plan = GuardedRepairPlan(
            plan_id=f"plan_{ctx.correlation_id}",
            incident_id=incident_id,
            chapter_id=chapter_id,
            root_cause_hypothesis=hypothesis,
            pattern_category=pattern,
            recommended_action=action,
            suggested_backoff_sec=backoff,
            confidence_score=conf,
            explanation=explanation,
            is_safety_validated=False,
            created_at=datetime.now(timezone.utc).isoformat()
        )

        # Enforce Safety Guardrail
        is_safe = self.guardrail.validate_plan(plan)
        if not is_safe:
            logger.error(f"[AIAnalyzer] Plan rejected by safety guardrail: {plan.rejection_reason}")
            # Safe fallback
            plan.recommended_action = RepairAction.ROUTE_TO_NEEDS_REVIEW.value
            plan.explanation = f"Plan modified: original proposal failed safety validation ({plan.rejection_reason})"
            plan.is_safety_validated = True

        ctx.log_event("ai_analysis_complete", {
            "plan_id": plan.plan_id,
            "recommended_action": plan.recommended_action,
            "is_safe": plan.is_safety_validated
        })

        return plan
