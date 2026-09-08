import pytest
from unittest.mock import MagicMock, AsyncMock, patch
from autonomous.orchestrator.scheduler import AutonomousScheduler

@pytest.mark.asyncio
async def test_fast_loop_vitals_and_watchdog():
    mock_supabase = MagicMock()
    # Mock queue counts
    mock_supabase.from_().select().eq().limit().execute.return_value.count = 5
    # Mock 0 stuck chapters
    mock_supabase.from_().select().eq().lt().limit().execute.return_value.data = []

    scheduler = AutonomousScheduler(supabase_client=mock_supabase)
    summary = await scheduler.run_fast_loop()

    assert summary["database_healthy"] is True
    assert summary["queue"]["queued"] == 5
    assert summary["timed_out_chapters"] == 0
    assert len(summary["errors"]) == 0

@pytest.mark.asyncio
async def test_normal_loop_provider_and_dlq():
    mock_supabase = MagicMock()
    mock_supabase.from_().select().eq().lt().lte().limit().execute.return_value.data = [
        {"id": "dlq-1", "chapter_id": "ch-1", "retry_count": 0, "max_retries": 3}
    ]
    mock_supabase.from_().select().eq().order().limit().execute.return_value.data = []

    scheduler = AutonomousScheduler(supabase_client=mock_supabase)
    with patch.object(scheduler.supervisor, "health_check", new_callable=AsyncMock) as mock_hc:
        mock_hc.return_value = {"success": True, "provider": "mangapill"}
        summary = await scheduler.run_normal_loop()

        assert summary["providers"]["mangapill"] == "ONLINE"
        assert summary["dlq_retried"] == 1
        assert len(summary["errors"]) == 0

@pytest.mark.asyncio
async def test_deep_loop_duplicates_detection():
    mock_supabase = MagicMock()
    # Mock sampled chapters
    mock_supabase.from_().select().eq().order().limit().execute.return_value.data = []
    # Mock duplicate chapter numbers in chapters table
    mock_supabase.from_().select().limit().execute.return_value.data = [
        {"manga_id": "m1", "chapter_number": 1.0},
        {"manga_id": "m1", "chapter_number": 1.0}, # Duplicate!
        {"manga_id": "m1", "chapter_number": 2.0}
    ]

    scheduler = AutonomousScheduler(supabase_client=mock_supabase)
    summary = await scheduler.run_deep_loop()

    assert summary["duplicate_chapters_detected"] == 1
    assert len(summary["errors"]) == 0
