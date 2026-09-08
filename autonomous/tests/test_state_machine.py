import pytest
from autonomous.orchestrator.state_machine import (
    ChapterStateMachine,
    ChapterState,
    StateTransitionError,
    CorrelationContext
)

def test_valid_happy_path_transitions():
    sm = ChapterStateMachine(max_retries=3)
    # QUEUED -> PROCESSING
    assert sm.can_transition(ChapterState.QUEUED, ChapterState.PROCESSING) is True
    # PROCESSING -> STORAGE_VERIFYING
    assert sm.can_transition(ChapterState.PROCESSING, ChapterState.STORAGE_VERIFYING) is True
    # STORAGE_VERIFYING -> READY
    assert sm.can_transition(ChapterState.STORAGE_VERIFYING, ChapterState.READY) is True

def test_illegal_transitions_blocked():
    sm = ChapterStateMachine(max_retries=3)
    # Cannot jump directly from QUEUED to READY (skipping processing & storage verification)
    assert sm.can_transition(ChapterState.QUEUED, ChapterState.READY) is False

    with pytest.raises(StateTransitionError):
        sm.validate_transition(ChapterState.QUEUED, ChapterState.READY)

def test_failure_retry_limit_and_dlq_routing():
    sm = ChapterStateMachine(max_retries=3)
    ctx = CorrelationContext()

    # Attempt 1 (from 0 to 1) -> should auto-requeue
    next_state, meta = sm.determine_failure_resolution(0, "HTTP_500", "Gateway error", ctx)
    assert next_state == ChapterState.QUEUED
    assert meta["resolution"] == "AUTO_REQUEUE"
    assert meta["retry_count"] == 1

    # Attempt 2 (from 1 to 2) -> should auto-requeue
    next_state, meta = sm.determine_failure_resolution(1, "HTTP_500", "Gateway error", ctx)
    assert next_state == ChapterState.QUEUED
    assert meta["resolution"] == "AUTO_REQUEUE"
    assert meta["retry_count"] == 2

    # Attempt 3 (from 2 to 3) -> should route to NEEDS_REVIEW
    next_state, meta = sm.determine_failure_resolution(2, "HTTP_500", "Gateway error", ctx)
    assert next_state == ChapterState.NEEDS_REVIEW
    assert meta["resolution"] == "EXHAUSTED_MAX_RETRIES"
    assert meta["retry_count"] == 3

def test_correlation_context_logging():
    ctx = CorrelationContext()
    assert ctx.correlation_id.startswith("req_")
    ctx.log_event("step_completed", {"pages": 10})
    assert len(ctx.events) == 1
    assert ctx.events[0]["event"] == "step_completed"
    assert ctx.events[0]["payload"]["pages"] == 10
