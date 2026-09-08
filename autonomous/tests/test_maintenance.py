import pytest
from unittest.mock import MagicMock, AsyncMock, patch
from autonomous.orchestrator.maintenance_manager import MaintenanceManager

@pytest.mark.asyncio
async def test_normal_health_keeps_maintenance_off():
    mock_supabase = MagicMock()
    manager = MaintenanceManager(supabase_client=mock_supabase)

    with patch.object(manager, "probe_database_health", new_callable=AsyncMock) as mock_db, \
         patch.object(manager, "probe_storage_health", new_callable=AsyncMock) as mock_st:
        mock_db.return_value = True
        mock_st.return_value = True

        report = await manager.evaluate_system_health()
        assert report.database_ok is True
        assert report.is_critical_failure is False
        assert manager.is_maintenance_active is False

@pytest.mark.asyncio
async def test_single_failure_does_not_trigger_maintenance():
    mock_supabase = MagicMock()
    manager = MaintenanceManager(supabase_client=mock_supabase)

    with patch.object(manager, "probe_database_health", new_callable=AsyncMock) as mock_db, \
         patch.object(manager, "probe_storage_health", new_callable=AsyncMock) as mock_st:
        mock_db.return_value = False # Single DB failure
        mock_st.return_value = True

        report = await manager.evaluate_system_health()
        assert report.is_critical_failure is True
        # 1 failure is below the threshold of 3
        assert manager.is_maintenance_active is False
        assert manager.consecutive_critical_failures == 1

@pytest.mark.asyncio
async def test_consecutive_critical_failures_triggers_maintenance_and_recovers():
    mock_supabase = MagicMock()
    manager = MaintenanceManager(supabase_client=mock_supabase)

    with patch.object(manager, "probe_database_health", new_callable=AsyncMock) as mock_db, \
         patch.object(manager, "probe_storage_health", new_callable=AsyncMock) as mock_st:
        # Fail 3 consecutive times
        mock_db.return_value = False
        mock_st.return_value = False

        await manager.evaluate_system_health()
        assert manager.is_maintenance_active is False
        await manager.evaluate_system_health()
        assert manager.is_maintenance_active is False
        await manager.evaluate_system_health()
        # 3rd failure -> trips maintenance mode!
        assert manager.is_maintenance_active is True

        # Now simulate recovery
        mock_db.return_value = True
        mock_st.return_value = True

        await manager.evaluate_system_health()
        # 1st success -> still verifying
        assert manager.is_maintenance_active is True

        await manager.evaluate_system_health()
        # 2nd success -> threshold met, auto exits maintenance mode!
        assert manager.is_maintenance_active is False
