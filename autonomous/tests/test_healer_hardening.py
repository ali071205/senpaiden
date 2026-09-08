"""Tests for Healer CLI Hardening, Timer Parsing, Test Dispatcher, and Change Auditor.
"""

import pytest
from pathlib import Path
from autonomous.orchestrator.main import parse_timer_duration
from autonomous.orchestrator.change_auditor import ChangeAuditor, classify_file
from autonomous.orchestrator.healer_tests import HealerTestDispatcher, format_test_report
from autonomous.orchestrator.scheduler import AutonomousScheduler

def test_timer_parsing_units():
    """Verify s, m, h, d unit parsing and decimal support."""
    assert parse_timer_duration("10s") == 10.0
    assert parse_timer_duration("0.5m") == 30.0
    assert parse_timer_duration("30m") == 1800.0
    assert parse_timer_duration("1h") == 3600.0
    assert parse_timer_duration("1.5h") == 5400.0
    assert parse_timer_duration("1d") == 86400.0
    assert parse_timer_duration("0.25d") == 21600.0
    assert parse_timer_duration("2d") == 172800.0

def test_timer_parsing_invalid():
    """Verify invalid timer strings raise ValueError with helpful message."""
    with pytest.raises(ValueError):
        parse_timer_duration("invalid")
    with pytest.raises(ValueError):
        parse_timer_duration("10x")
    with pytest.raises(ValueError):
        parse_timer_duration("-5m")

def test_change_auditor_classification():
    """Verify accurate separation of code, config, test, log, cache, and temporary files."""
    assert classify_file("autonomous/orchestrator/main.py") == "CODE CHANGES"
    assert classify_file("frontend/src/app/page.tsx") == "CODE CHANGES"
    assert classify_file("frontend/package.json") == "CONFIG CHANGES"
    assert classify_file(".env") == "CONFIG CHANGES"
    assert classify_file("autonomous/tests/test_scheduler.py") == "TEST CHANGES"
    assert classify_file("autonomous/__pycache__/main.cpython-311.pyc") == "CACHE FILES"
    assert classify_file("logs/server.log") == "LOG FILES"
    assert classify_file("scratch/debug.js") == "TEMPORARY FILES"
    assert classify_file("frontend/.next/server/app.js") == "GENERATED FILES"

def test_change_auditor_baseline_and_audit():
    """Verify baseline snapshot and change detection without crashing."""
    auditor = ChangeAuditor()
    baseline = auditor.take_baseline_snapshot()
    assert "head_commit" in baseline
    assert "arch_hashes" in baseline
    assert "phase_state.json" in baseline["arch_hashes"]

    audit = auditor.compute_audit(baseline)
    assert "added_files" in audit
    assert "modified_files" in audit
    assert "classified" in audit
    assert "arch_status" in audit

    # Format report
    report_text = auditor.format_audit_report(audit)
    assert "HEALER CHANGE AUDIT REPORT" in report_text
    assert "UNCHANGED ARCHITECTURE VERIFICATION" in report_text
    assert "phase_state.json" in report_text

@pytest.mark.asyncio
async def test_healer_test_dispatcher_missing_args():
    """Verify custom test handles missing required arguments gracefully without tracebacks."""
    scheduler = AutonomousScheduler(supabase_client=None)
    dispatcher = HealerTestDispatcher(scheduler, dry_run=True)

    # Missing --name on manga-name
    res = await dispatcher.run_test("manga-name", {})
    assert res["status"] == "FAIL"
    assert "Missing required argument: --name" in res["error_message"]

    # Missing --chapter on manga-chapter
    res2 = await dispatcher.run_test("manga-chapter", {"name": "One Piece"})
    assert res2["status"] == "FAIL"
    assert "Missing required argument: --chapter" in res2["error_message"]

@pytest.mark.asyncio
async def test_healer_test_dispatcher_dry_run_operations():
    """Verify test operations execute cleanly in dry-run mode."""
    scheduler = AutonomousScheduler(supabase_client=None)
    dispatcher = HealerTestDispatcher(scheduler, dry_run=True)

    # Run queue test
    res = await dispatcher.run_test("queue", {})
    assert res["status"] == "PASS"
    assert "queue" in res["test"]

    # Run storage test
    res_storage = await dispatcher.run_test("storage", {})
    assert res_storage["status"] == "PASS"

    # Run worker-failure test
    res_wf = await dispatcher.run_test("worker-failure", {})
    assert res_wf["status"] == "PASS"

    # Format report
    formatted = format_test_report(res)
    assert "===== HEALER TEST =====" in formatted
    assert "Status:" in formatted
    assert "PASS" in formatted
