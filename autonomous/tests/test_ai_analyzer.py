import pytest
from autonomous.orchestrator.ai_analyzer import (
    AIErrorAnalyzer,
    SafetyGuardrail,
    GuardedRepairPlan
)
from autonomous.orchestrator.self_healing import ErrorClassification, RepairAction

@pytest.mark.asyncio
async def test_ai_analyzer_root_cause_synthesis():
    analyzer = AIErrorAnalyzer()

    # 1. 404 test
    plan_404 = await analyzer.analyze_incident(
        incident_id="inc-1",
        chapter_id="ch-101",
        error_detail="HTTP 404 Not Found on MangaPill",
        classification=ErrorClassification.BROKEN_IMAGE_404
    )
    assert plan_404.pattern_category == "UPSTREAM_ASSET_REMOVAL"
    assert plan_404.recommended_action == RepairAction.FALLBACK_PROVIDER_FETCH.value
    assert plan_404.is_safety_validated is True

    # 2. 503 test
    plan_503 = await analyzer.analyze_incident(
        incident_id="inc-2",
        chapter_id="ch-102",
        error_detail="HTTP 503 Service Unavailable",
        classification=ErrorClassification.PROVIDER_503_OUTAGE,
        retry_count=1
    )
    assert plan_503.pattern_category == "TRANSIENT_GATEWAY_OUTAGE"
    assert plan_503.recommended_action == RepairAction.EXPONENTIAL_BACKOFF_RETRY.value
    assert plan_503.suggested_backoff_sec == 60

def test_safety_guardrail_blocks_destructive_sql():
    guardrail = SafetyGuardrail()

    # Dangerous plan attempting to inject DROP TABLE
    evil_plan = GuardedRepairPlan(
        plan_id="p-evil",
        incident_id="inc-evil",
        chapter_id="ch-666",
        root_cause_hypothesis="Corrupted table",
        pattern_category="ANOMALY",
        recommended_action=RepairAction.FALLBACK_PROVIDER_FETCH.value,
        suggested_backoff_sec=10,
        confidence_score=0.9,
        explanation="Attempting DROP TABLE chapters to reset database",
        is_safety_validated=False
    )

    is_valid = guardrail.validate_plan(evil_plan)
    assert is_valid is False
    assert "Destructive SQL command pattern detected" in evil_plan.rejection_reason

def test_safety_guardrail_blocks_unauthorized_action():
    guardrail = SafetyGuardrail()

    unauthorized_plan = GuardedRepairPlan(
        plan_id="p-bad",
        incident_id="inc-bad",
        chapter_id="ch-777",
        root_cause_hypothesis="Bad code",
        pattern_category="ANOMALY",
        recommended_action="REWRITE_SOURCE_CODE_DIRECTLY", # Unauthorized!
        suggested_backoff_sec=10,
        confidence_score=0.9,
        explanation="Rewrite worker code",
        is_safety_validated=False
    )

    is_valid = guardrail.validate_plan(unauthorized_plan)
    assert is_valid is False
    assert "not in allowed repair whitelist" in unauthorized_plan.rejection_reason
