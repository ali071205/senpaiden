"""CLI entry point and runner for the Autonomous Control Plane & Healer.
Supports dedicated healer mode, configurable timers, safe custom test operations,
dry-run mode, graceful shutdown (Ctrl+C), and automated change audit.
"""

import sys
import re
import time
import asyncio
import logging
import json
import argparse
from typing import Optional, Dict, Any

from autonomous.orchestrator.config import CONFIG
from autonomous.orchestrator.scheduler import AutonomousScheduler
from autonomous.orchestrator.storage_verifier import StorageVerifier
from autonomous.orchestrator.change_auditor import ChangeAuditor
from autonomous.orchestrator.healer_tests import HealerTestDispatcher, format_test_report

if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] [%(name)s] %(message)s"
)
logging.getLogger("httpx").setLevel(logging.WARNING)
logger = logging.getLogger("autonomous.main")

def parse_timer_duration(timer_str: str) -> float:
    """
    Parses timer strings like 10s, 0.5m, 30m, 1h, 24h, 1d, 0.25d into seconds.
    Supports decimal values.
    """
    if not timer_str or not isinstance(timer_str, str):
        raise ValueError("Invalid timer string")

    match = re.match(r"^([0-9]+(?:\.[0-9]+)?)([smhd])$", timer_str.strip().lower())
    if not match:
        raise ValueError(
            f"Invalid timer format '{timer_str}'. Use format like: 10s, 0.5m, 30m, 1h, 24h, 1d, 0.25d"
        )

    val = float(match.group(1))
    unit = match.group(2)

    if unit == "s":
        return val
    elif unit == "m":
        return val * 60.0
    elif unit == "h":
        return val * 3600.0
    elif unit == "d":
        return val * 86400.0
    else:
        raise ValueError(f"Unsupported timer unit: {unit}")

async def cmd_status(scheduler: AutonomousScheduler):
    if not scheduler.supabase:
        print(json.dumps({"error": "Supabase client not configured. Check environment variables."}, indent=2))
        return

    try:
        chapters_summary = {}
        for status in ["QUEUED", "PROCESSING", "READY", "FAILED", "STALE_RETRY"]:
            res = scheduler.supabase.from_("chapters").select("id", count="exact").eq("job_status", status).limit(1).execute()
            chapters_summary[status] = res.count or 0

        dlq_res = scheduler.supabase.from_("dead_letter_queue").select("id", count="exact").eq("resolved", False).limit(1).execute()
        dlq_count = dlq_res.count or 0

        maint = False
        try:
            rpc_res = scheduler.supabase.rpc("is_maintenance_mode", {}).execute()
            maint = bool(rpc_res.data)
        except Exception:
            pass

        output = {
            "status": "online",
            "maintenance_mode": maint,
            "chapters": chapters_summary,
            "unresolved_dlq_count": dlq_count,
            "timeouts": {
                "worker_timeout_seconds": CONFIG.worker_timeout_seconds,
                "max_chapter_retries": CONFIG.max_chapter_retries
            }
        }
        print(json.dumps(output, indent=2))
    except Exception as e:
        print(json.dumps({"error": str(e)}, indent=2))

async def cmd_watchdog(scheduler: AutonomousScheduler):
    print("Running Fast Loop (Watchdog)...")
    res = await scheduler.run_fast_loop()
    print(json.dumps(res, indent=2))

async def cmd_diff_sync(scheduler: AutonomousScheduler):
    print("Running Normal Loop (Differential Sync & DLQ Retry)...")
    res = await scheduler.run_normal_loop()
    print(json.dumps(res, indent=2))

async def cmd_deep_audit(scheduler: AutonomousScheduler):
    print("Running Deep Loop (Integrity Audit)...")
    res = await scheduler.run_deep_loop()
    print(json.dumps(res, indent=2))

async def cmd_verify_chapter(scheduler: AutonomousScheduler, chapter_id: str):
    if not scheduler.supabase:
        print("Supabase client not configured.")
        return

    pages_res = scheduler.supabase.from_("pages").select("page_number, r2_keys, slice_dimensions").eq("chapter_id", chapter_id).execute()
    verifier = StorageVerifier(check_network_availability=False)
    res = await verifier.verify_page_slices(chapter_id, pages_res.data or [])
    print(json.dumps({
        "valid": res.valid,
        "chapter_id": res.chapter_id,
        "total_pages": res.total_pages,
        "total_slices": res.total_slices,
        "storage_provider": res.verified_storage_provider,
        "error": res.error,
        "details": res.details
    }, indent=2))

async def cmd_run_healer_daemon(
    scheduler: AutonomousScheduler,
    timer_seconds: Optional[float] = None,
    test_dispatcher: Optional[HealerTestDispatcher] = None,
    test_name: Optional[str] = None,
    test_args: Optional[Dict[str, Any]] = None
):
    """
    Continuous or timed healer control loop with periodic live status logging.
    """
    start_time = time.time()
    logger.info("===========================================================")
    logger.info("  SENPAI DEN AUTONOMOUS WORKER & SELF-HEALING CONTROL PLANE")
    logger.info("===========================================================")
    logger.info("Python Brain: RUNNING")
    logger.info("Scheduler: ACTIVE")
    logger.info("Health Monitor: ACTIVE")
    logger.info("Self-Healing: ACTIVE")

    hb = await scheduler.supervisor.health_check()
    logger.info(f"Node Bridge: RUNNING (Provider: {hb.get('provider', 'mangapill')})")
    logger.info(f"Fast Loop interval: {CONFIG.fast_loop_interval_sec}s")
    logger.info(f"Normal Loop interval: {CONFIG.normal_loop_interval_sec}s")
    logger.info(f"Deep Loop interval: {CONFIG.deep_loop_interval_sec}s")

    if timer_seconds is not None:
        logger.info(f"Timer set: {timer_seconds}s. Healer will run until timer expires.")
    else:
        logger.info("Autonomous Healer running continuously. Press Ctrl+C to stop.")

    last_normal = start_time
    last_deep = start_time
    dlq_retries_total = 0

    while True:
        now = time.time()
        elapsed = now - start_time

        # Check timer limit
        if timer_seconds is not None and elapsed >= timer_seconds:
            logger.info(f"[Healer] Configured timer duration ({timer_seconds}s) reached.")
            break

        # 1. Fast Loop (Watchdog, Queue Vitals, Circuit Breaker)
        fast_res = await scheduler.run_fast_loop()
        q_vitals = fast_res.get("queue", {})

        # 2. Normal Loop (Differential sync, DLQ retries)
        if now - last_normal >= CONFIG.normal_loop_interval_sec:
            norm_res = await scheduler.run_normal_loop()
            dlq_retries_total += norm_res.get("dlq_retried", 0)
            last_normal = now

        # 3. Deep Loop (Integrity audit)
        if now - last_deep >= CONFIG.deep_loop_interval_sec:
            await scheduler.run_deep_loop()
            last_deep = now

        # 4. If a test is assigned to run within the timer loop, execute it
        if test_dispatcher and test_name:
            t_res = await test_dispatcher.run_test(test_name, test_args or {})
            print(format_test_report(t_res))

        # Format live status output
        uptime_mins = int(elapsed // 60)
        uptime_secs = int(elapsed % 60)
        uptime_str = f"{uptime_mins:02d}:{uptime_secs:02d}"

        print(f"[Healer] Uptime: {uptime_str}")
        print(f"[Healer] Queue: {q_vitals.get('queued', 0)}")
        print(f"[Healer] Processing: {q_vitals.get('processing', 0)}")
        print(f"[Healer] DLQ retries: {dlq_retries_total}")
        print(f"[Healer] Watchdog: {'HEALTHY' if fast_res.get('database_healthy') else 'DEGRADED'}")
        print(f"[Healer] Last loop: {int(CONFIG.fast_loop_interval_sec)}s ago")

        # Sleep interval (or remaining timer fraction)
        sleep_dur = CONFIG.fast_loop_interval_sec
        if timer_seconds is not None:
            remaining = timer_seconds - (time.time() - start_time)
            if remaining <= 0:
                break
            sleep_dur = min(sleep_dur, remaining)

        await asyncio.sleep(sleep_dur)

async def main():
    auditor = ChangeAuditor()
    baseline = auditor.take_baseline_snapshot()

    raw_args = sys.argv[1:]
    if not raw_args:
        raw_args = ["status"]

    subcommand = raw_args[0]

    # Handle standard non-healer commands directly
    scheduler = AutonomousScheduler()

    if subcommand == "status":
        await cmd_status(scheduler)
        return
    elif subcommand == "watchdog":
        await cmd_watchdog(scheduler)
        return
    elif subcommand == "diff-sync":
        await cmd_diff_sync(scheduler)
        return
    elif subcommand == "deep-audit":
        await cmd_deep_audit(scheduler)
        return
    elif subcommand == "verify":
        if len(raw_args) > 1:
            await cmd_verify_chapter(scheduler, raw_args[1])
        else:
            print("Usage: python -m autonomous.orchestrator.main verify <chapter_id>")
        return
    elif subcommand == "health-check":
        res = await scheduler.supervisor.health_check()
        print(json.dumps(res, indent=2))
        return

    # Subcommand is healer (or aliases start, daemon, worker)
    if subcommand in ["healer", "start", "daemon", "worker"]:
        # Parse flags for healer mode
        parser = argparse.ArgumentParser(prog="python -m autonomous.orchestrator.main healer", add_help=False)
        parser.add_argument("--timer", type=str, default=None, help="Monitoring/test duration (e.g. 10s, 0.5m, 30m, 1h, 1d)")
        parser.add_argument("--test", type=str, default=None, help="Custom test to execute")
        parser.add_argument("--name", type=str, default=None, help="Manga name for test")
        parser.add_argument("--chapter", type=str, default=None, help="Chapter number for test")
        parser.add_argument("--dry-run", action="store_true", default=False, help="Dry-run safety mode")

        parsed_flags, unknown = parser.parse_known_args(raw_args[1:])

        timer_seconds = None
        if parsed_flags.timer:
            try:
                timer_seconds = parse_timer_duration(parsed_flags.timer)
            except ValueError as ve:
                print(f"Error: {ve}")
                return

        test_dispatcher = HealerTestDispatcher(scheduler, dry_run=parsed_flags.dry_run)
        test_args = {
            "name": parsed_flags.name,
            "chapter": parsed_flags.chapter,
            "dry_run": parsed_flags.dry_run
        }

        try:
            # Case A: If custom test requested WITHOUT a timer, execute test once and produce audit
            if parsed_flags.test and timer_seconds is None:
                test_result = await test_dispatcher.run_test(parsed_flags.test, test_args)
                print(format_test_report(test_result))
            else:
                # Case B: Run continuous or timed daemon loop
                await cmd_run_healer_daemon(
                    scheduler=scheduler,
                    timer_seconds=timer_seconds,
                    test_dispatcher=test_dispatcher if parsed_flags.test else None,
                    test_name=parsed_flags.test,
                    test_args=test_args
                )

        except (KeyboardInterrupt, asyncio.CancelledError):
            print("\n[Healer] Shutdown requested by user.\n")
        finally:
            print("[Healer] Generating change audit...\n")
            audit_report = auditor.compute_audit(baseline)
            print(auditor.format_audit_report(audit_report))

    else:
        print(f"Unknown command: {subcommand}")
        print("Usage: python -m autonomous.orchestrator.main [healer|status|watchdog|diff-sync|deep-audit|verify <chapter_id>|health-check]")
        sys.exit(1)

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except (KeyboardInterrupt, asyncio.CancelledError):
        print("\n[Healer] Process terminated.")
