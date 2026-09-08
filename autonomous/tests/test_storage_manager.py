import pytest
import time
from unittest.mock import MagicMock
from autonomous.orchestrator.storage_manager import StorageManager, StorageTier
from autonomous.orchestrator.storage_reconciler import StorageReconciler
from autonomous.orchestrator.state_machine import ChapterState

def test_storage_tier_primary_and_failover():
    sm = StorageManager()
    # Default is Google Drive (Primary)
    assert sm.get_active_storage_tier() == StorageTier.GDRIVE_PRIMARY

    # Trigger 4 failures (under threshold of 5)
    for _ in range(4):
        sm.record_gdrive_failure("Rate limit 429")
    assert sm.get_active_storage_tier() == StorageTier.GDRIVE_PRIMARY

    # 5th failure -> trips circuit breaker to R2 fallback
    sm.record_gdrive_failure("Rate limit 429")
    assert sm.get_active_storage_tier() == StorageTier.R2_FALLBACK

    # Reset on success
    sm.record_gdrive_success()
    assert sm.get_active_storage_tier() == StorageTier.GDRIVE_PRIMARY

def test_key_formatting_and_detection():
    r2_key = StorageManager.format_r2_key("manga-1", 12.0, 1, 0)
    assert r2_key == "mangas/manga-1/ch_12/p1_s0.webp"

    gdrive_key = StorageManager.format_gdrive_key("1A2B3C_fileID")
    assert gdrive_key == "gdrive/1A2B3C_fileID"
    assert StorageManager.is_gdrive_key(gdrive_key) is True
    assert StorageManager.is_gdrive_key(r2_key) is False

@pytest.mark.asyncio
async def test_reconciler_healthy_chapter():
    mock_supabase = MagicMock()
    # Mock healthy pages returned from DB
    mock_supabase.from_().select().eq().order().execute.return_value.data = [
        {"page_number": 1, "r2_keys": ["gdrive/file1"]},
        {"page_number": 2, "r2_keys": ["gdrive/file2"]}
    ]

    reconciler = StorageReconciler(supabase_client=mock_supabase)
    report = await reconciler.reconcile_chapter("test-healthy-ch")

    assert report.status == "HEALTHY"
    assert report.pages_audited == 2
    assert len(report.missing_pages) == 0
    assert report.action_taken == "NONE"

@pytest.mark.asyncio
async def test_reconciler_degraded_chapter():
    mock_supabase = MagicMock()
    # Page 2 has empty r2_keys
    mock_supabase.from_().select().eq().order().execute.return_value.data = [
        {"page_number": 1, "r2_keys": ["gdrive/file1"]},
        {"page_number": 2, "r2_keys": []}
    ]

    reconciler = StorageReconciler(supabase_client=mock_supabase)
    report = await reconciler.reconcile_chapter("test-degraded-ch")

    assert report.status == "DEGRADED"
    assert 2 in report.missing_pages
    assert "STALE_RETRY" in report.action_taken

    # Verify DB update called with STALE_RETRY
    update_data = mock_supabase.from_().update.call_args[0][0]
    assert update_data["job_status"] == ChapterState.STALE_RETRY.value
