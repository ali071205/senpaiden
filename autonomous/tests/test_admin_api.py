import pytest
from unittest.mock import MagicMock
from autonomous.orchestrator.admin_api import AdminCommandCenter
from autonomous.orchestrator.state_machine import ChapterState

@pytest.mark.asyncio
async def test_admin_dashboard_metrics():
    mock_supabase = MagicMock()
    center = AdminCommandCenter(supabase_client=mock_supabase)

    metrics = await center.get_dashboard_metrics()

    assert "system_status" in metrics
    assert "phases" in metrics
    assert "chapters" in metrics
    assert "dlq" in metrics
    assert "storage" in metrics
    assert "providers" in metrics
    assert metrics["storage"]["primary"] == "google_drive"
    assert metrics["providers"]["mangapill"]["role"] == "primary"

@pytest.mark.asyncio
async def test_protected_replay_dlq_chapter():
    mock_supabase = MagicMock()
    center = AdminCommandCenter(supabase_client=mock_supabase)

    # Empty ID should fail
    bad_res = await center.protected_replay_dlq_chapter("   ")
    assert bad_res["success"] is False

    # Valid ID should succeed
    res = await center.protected_replay_dlq_chapter("ch-dlq-1", actor="admin_lead")
    assert res["success"] is True
    assert res["action"] == "REPLAYED"
    assert res["actor"] == "admin_lead"

    # Verify update to QUEUED
    update_data = mock_supabase.from_().update.call_args_list[0][0][0]
    assert update_data["job_status"] == ChapterState.QUEUED.value

@pytest.mark.asyncio
async def test_protected_toggle_maintenance():
    mock_supabase = MagicMock()
    center = AdminCommandCenter(supabase_client=mock_supabase)

    res = await center.protected_toggle_maintenance(True, actor="ops_bot", reason="Scheduled DB migration")
    assert res["success"] is True
    assert res["maintenance_mode"] is True
    assert res["actor"] == "ops_bot"
