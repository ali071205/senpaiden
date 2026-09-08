import pytest
from unittest.mock import MagicMock
from autonomous.orchestrator.self_healing import (
    SelfHealingEngine,
    ErrorClassification,
    RepairAction
)
from autonomous.orchestrator.state_machine import ChapterState

def test_error_classification():
    engine = SelfHealingEngine()
    assert engine.classify_error("HTTP 404: Image not found on upstream") == ErrorClassification.BROKEN_IMAGE_404
    assert engine.classify_error("HTTP 503 Service Unavailable") == ErrorClassification.PROVIDER_503_OUTAGE
    assert engine.classify_error("HTTP 429 Too Many Requests: Rate limit exceeded") == ErrorClassification.PROVIDER_429_RATELIMIT
    assert engine.classify_error("Zero-byte slice found for page 3") == ErrorClassification.STORAGE_SLICE_MISSING
    assert engine.classify_error("Worker timed out after 600 seconds") == ErrorClassification.PROCESSING_TIMEOUT
    assert engine.classify_error("Fatal syntax error in external script") == ErrorClassification.UNKNOWN_UNSAFE_ERROR

@pytest.mark.asyncio
async def test_broken_image_404_recovery():
    mock_supabase = MagicMock()
    engine = SelfHealingEngine(supabase_client=mock_supabase)

    result = await engine.heal_chapter_incident(
        chapter_id="ch-404-test",
        error_detail="HTTP 404: Image slice missing upstream",
        current_retry_count=0
    )

    assert result.is_recovered is True
    assert result.action_taken == RepairAction.FALLBACK_PROVIDER_FETCH
    assert result.requires_human_review is False

    # Chapter should be requeued, not deleted or marked permanently broken
    update_data = mock_supabase.from_().update.call_args[0][0]
    assert update_data["job_status"] == ChapterState.QUEUED.value

@pytest.mark.asyncio
async def test_provider_503_exponential_backoff():
    mock_supabase = MagicMock()
    engine = SelfHealingEngine(supabase_client=mock_supabase)

    result = await engine.heal_chapter_incident(
        chapter_id="ch-503-test",
        error_detail="503 Service Unavailable on provider",
        current_retry_count=1
    )

    assert result.is_recovered is True
    assert result.action_taken == RepairAction.EXPONENTIAL_BACKOFF_RETRY
    assert result.details["backoff_seconds"] == 60.0  # 30s * 2^1

@pytest.mark.asyncio
async def test_max_retries_routes_to_needs_review():
    mock_supabase = MagicMock()
    engine = SelfHealingEngine(supabase_client=mock_supabase)

    # Attempt at max retries (3)
    result = await engine.heal_chapter_incident(
        chapter_id="ch-exhausted-test",
        error_detail="Repeated 500 error",
        current_retry_count=3
    )

    assert result.is_recovered is False
    assert result.requires_human_review is True
    assert result.action_taken == RepairAction.ROUTE_TO_NEEDS_REVIEW

    # Verified update to NEEDS_REVIEW
    update_calls = [args[0] for args, _ in mock_supabase.from_().update.call_args_list]
    assert any(u.get("job_status") == ChapterState.NEEDS_REVIEW.value for u in update_calls)
