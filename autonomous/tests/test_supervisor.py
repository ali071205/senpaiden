import pytest
from autonomous.orchestrator.supervisor import NodeBridgeSupervisor

@pytest.mark.asyncio
async def test_supervisor_health_check():
    supervisor = NodeBridgeSupervisor(timeout_seconds=30)
    res = await supervisor.health_check()
    assert res.get("success") is True
    assert res.get("provider") in ["mangapill", "mangadex"]
    assert res.get("sample_count", 0) > 0
    assert "_elapsed_seconds" in res
