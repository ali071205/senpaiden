"""State Machine for Chapter Lifecycle and Error Handling.
Enforces strict transitions, retry caps (AD-002), and correlation ID tracking.
"""

from enum import Enum
import uuid
import time
from typing import Dict, Any, Optional, Set, Tuple
from dataclasses import dataclass, field
from datetime import datetime, timezone

class ChapterState(str, Enum):
    QUEUED = "QUEUED"
    PROCESSING = "PROCESSING"
    STORAGE_VERIFYING = "STORAGE_VERIFYING"
    READY = "READY"
    FAILED = "FAILED"
    NEEDS_REVIEW = "NEEDS_REVIEW"
    STALE = "STALE"
    STALE_RETRY = "STALE_RETRY"
    ARCHIVED = "ARCHIVED"

# Valid state transitions graph
VALID_TRANSITIONS: Dict[ChapterState, Set[ChapterState]] = {
    ChapterState.QUEUED: {
        ChapterState.PROCESSING,
        ChapterState.FAILED,
    },
    ChapterState.PROCESSING: {
        ChapterState.STORAGE_VERIFYING,
        ChapterState.FAILED,
    },
    ChapterState.STORAGE_VERIFYING: {
        ChapterState.READY,
        ChapterState.FAILED,
    },
    ChapterState.READY: {
        ChapterState.STALE,
        ChapterState.STALE_RETRY,
        ChapterState.ARCHIVED,
    },
    ChapterState.STALE: {
        ChapterState.PROCESSING,
        ChapterState.ARCHIVED,
    },
    ChapterState.STALE_RETRY: {
        ChapterState.PROCESSING,
        ChapterState.FAILED,
    },
    ChapterState.FAILED: {
        ChapterState.QUEUED,       # Requeue on retry
        ChapterState.NEEDS_REVIEW, # Max retries exhausted
        ChapterState.PROCESSING,
    },
    ChapterState.NEEDS_REVIEW: {
        ChapterState.QUEUED,       # Manually or autonomously re-approved
        ChapterState.ARCHIVED,
    },
    ChapterState.ARCHIVED: {
        ChapterState.QUEUED,       # Restored from archive
    }
}

class StateTransitionError(Exception):
    """Raised when an illegal state transition is attempted."""
    pass

@dataclass
class CorrelationContext:
    correlation_id: str = field(default_factory=lambda: f"req_{uuid.uuid4().hex[:12]}")
    started_at: float = field(default_factory=time.time)
    events: list = field(default_factory=list)

    def log_event(self, event_name: str, payload: Optional[Dict[str, Any]] = None):
        self.events.append({
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "event": event_name,
            "elapsed_seconds": round(time.time() - self.started_at, 3),
            "payload": payload or {}
        })

class ChapterStateMachine:
    def __init__(self, max_retries: int = 3):
        self.max_retries = max_retries

    def can_transition(self, current_state: ChapterState, target_state: ChapterState) -> bool:
        allowed = VALID_TRANSITIONS.get(current_state, set())
        return target_state in allowed

    def validate_transition(self, current_state: ChapterState, target_state: ChapterState):
        if not self.can_transition(current_state, target_state):
            raise StateTransitionError(
                f"Illegal state transition from {current_state.value} to {target_state.value}."
            )

    def determine_failure_resolution(
        self,
        current_retry_count: int,
        error_type: str,
        error_detail: str,
        context: Optional[CorrelationContext] = None
    ) -> Tuple[ChapterState, Dict[str, Any]]:
        """
        Determines whether to retry or route to NEEDS_REVIEW / Dead Letter Queue.
        Implements 3-retry cap rule.
        """
        next_retry_count = current_retry_count + 1
        
        if next_retry_count < self.max_retries:
            next_state = ChapterState.QUEUED
            resolution = "AUTO_REQUEUE"
        else:
            next_state = ChapterState.NEEDS_REVIEW
            resolution = "EXHAUSTED_MAX_RETRIES"

        meta = {
            "retry_count": next_retry_count,
            "max_retries": self.max_retries,
            "resolution": resolution,
            "error_type": error_type,
            "error_detail": error_detail,
            "correlation_id": context.correlation_id if context else None,
            "timestamp": datetime.now(timezone.utc).isoformat()
        }

        if context:
            context.log_event("failure_evaluated", meta)

        return next_state, meta
