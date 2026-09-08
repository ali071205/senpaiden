"""Chaos Engineering & Comprehensive Failure Suite (Phase 11).
Simulates all core failure modes and proves that the closed-loop recovery:
DETECT -> CLASSIFY -> THINK -> FIX -> VERIFY -> RECOVER
recovers safely without data loss, corruption, or illegal state transitions.
"""

import pytest
from unittest.mock import MagicMock, AsyncMock, patch

from autonomous.orchestrator.self_healing import SelfHealingEngine, ErrorClassification, RepairAction
from autonomous.orchestrator.pipeline import AutonomousIngestionPipeline
from autonomous.orchestrator.maintenance_manager import MaintenanceManager
from autonomous.orchestrator.state_machine import ChapterState, StateTransitionError, ChapterStateMachine
from autonomous.orchestrator.storage_verifier import StorageVerifier

@pytest.mark.asyncio
async def test_chaos_http_status_codes():
    """Simulates 404, 403, 429, 500, 502, 503, Timeout."""
    mock_supabase = MagicMock()
    engine = SelfHealingEngine(supabase_client=mock_supabase)

    chaos_scenarios = [
        ("HTTP 404: Not Found", ErrorClassification.BROKEN_IMAGE_404, RepairAction.FALLBACK_PROVIDER_FETCH),
        ("HTTP 403: Forbidden Cloudflare block", ErrorClassification.UNKNOWN_UNSAFE_ERROR, RepairAction.ROUTE_TO_NEEDS_REVIEW),
        ("HTTP 429: Too Many Requests Rate Limit", ErrorClassification.PROVIDER_429_RATELIMIT, RepairAction.EXPONENTIAL_BACKOFF_RETRY),
        ("HTTP 500: Internal Server Error", ErrorClassification.UNKNOWN_UNSAFE_ERROR, RepairAction.ROUTE_TO_NEEDS_REVIEW),
        ("HTTP 502: Bad Gateway upstream", ErrorClassification.PROVIDER_503_OUTAGE, RepairAction.EXPONENTIAL_BACKOFF_RETRY),
        ("HTTP 503: Service Unavailable provider down", ErrorClassification.PROVIDER_503_OUTAGE, RepairAction.EXPONENTIAL_BACKOFF_RETRY),
        ("Processing timed out after 600 seconds", ErrorClassification.PROCESSING_TIMEOUT, RepairAction.EXPONENTIAL_BACKOFF_RETRY),
    ]

    for error_msg, expected_class, expected_action in chaos_scenarios:
        res = await engine.heal_chapter_incident("ch-chaos", error_msg, current_retry_count=0)
        assert res.classification == expected_class, f"Failed classification for: {error_msg}"
        assert res.action_taken == expected_action, f"Failed action for: {error_msg}"

@pytest.mark.asyncio
async def test_chaos_storage_upload_failure():
    """Simulates corrupted image slice or zero-byte file."""
    verifier = StorageVerifier(check_network_availability=False)

    # 1. Zero-byte slice simulation
    corrupt_pages = [
        {"page_number": 1, "r2_keys": ["mangas/1/ch1/p1_s0.webp"]},
        {"page_number": 2, "r2_keys": [""]} # Empty slice key
    ]
    res = await verifier.verify_page_slices("ch-slice-chaos", corrupt_pages)
    assert res.valid is False
    assert "empty or malformed" in res.error

@pytest.mark.asyncio
async def test_chaos_partial_ingestion_and_unverified_block():
    """Simulates worker crashing mid-pipeline, verifying chapter never becomes READY."""
    mock_supabase = MagicMock()
    pipeline = AutonomousIngestionPipeline(supabase_client=mock_supabase)

    # Mock provider failure mid-flight
    with patch.object(pipeline.supervisor, "fetch_chapter_pages", new_callable=AsyncMock) as mock_fetch:
        mock_fetch.return_value = {"success": False, "error": "Provider network dropped mid-stream"}

        res = await pipeline.run_pipeline_for_chapter("ch-crash-1", "manga-1", 5.0, "http://provider/ch5")
        assert res["success"] is False
        assert "Provider network dropped" in res["error"]

        # Ensure state never became READY
        update_calls = mock_supabase.from_().update.call_args_list
        for c in update_calls:
            assert c[0][0].get("job_status") != ChapterState.READY.value

def test_chaos_illegal_state_transition_attack():
    """Simulates malicious or erroneous bypass attempting QUEUED -> READY directly."""
    sm = ChapterStateMachine()
    assert sm.can_transition(ChapterState.QUEUED, ChapterState.READY) is False
    with pytest.raises(StateTransitionError):
        sm.validate_transition(ChapterState.QUEUED, ChapterState.READY)

@pytest.mark.asyncio
async def test_chaos_critical_infrastructure_collapse():
    """Simulates database connection drop and ensures system engages maintenance mode safely."""
    mock_supabase = MagicMock()
    manager = MaintenanceManager(supabase_client=mock_supabase)

    with patch.object(manager, "probe_database_health", new_callable=AsyncMock) as mock_db, \
         patch.object(manager, "probe_storage_health", new_callable=AsyncMock) as mock_st:
        mock_db.return_value = False
        mock_st.return_value = False

        # Trip maintenance mode
        for _ in range(3):
            await manager.evaluate_system_health()

        assert manager.is_maintenance_active is True
