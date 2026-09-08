"""CLI entry point and runner for the Autonomous Control Plane.
"""

import sys
import asyncio
import logging
import json
from autonomous.orchestrator.config import CONFIG
from autonomous.orchestrator.scheduler import AutonomousScheduler
from autonomous.orchestrator.storage_verifier import StorageVerifier

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] [%(name)s] %(message)s"
)
logger = logging.getLogger("autonomous.main")

async def cmd_status(scheduler: AutonomousScheduler):
    if not scheduler.supabase:
        print(json.dumps({"error": "Supabase client not configured. Check environment variables."}, indent=2))
        return

    try:
        # Check counts in chapters table
        chapters_summary = {}
        for status in ["QUEUED", "PROCESSING", "READY", "FAILED", "STALE_RETRY"]:
            res = scheduler.supabase.from_("chapters").select("id", count="exact").eq("job_status", status).limit(1).execute()
            chapters_summary[status] = res.count or 0

        # DLQ count
        dlq_res = scheduler.supabase.from_("dead_letter_queue").select("id", count="exact").eq("resolved", False).limit(1).execute()
        dlq_count = dlq_res.count or 0

        # Maintenance mode
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

import time

async def cmd_start_daemon(scheduler: AutonomousScheduler):
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
    logger.info("Autonomous Healer running continuously. Press Ctrl+C to stop.")

    last_normal = 0.0
    last_deep = 0.0

    while True:
        try:
            now = time.time()

            # 1. Fast Loop (Watchdog, Queue Vitals, Circuit Breaker)
            logger.info("[ControlPlane] Executing Fast Loop (Watchdog & Health Monitor)...")
            fast_res = await scheduler.run_fast_loop()
            logger.info(f"[ControlPlane] Fast Loop: Queue={fast_res.get('queue')}, Reaped={fast_res.get('timed_out_chapters')}, StorageTier={fast_res.get('storage_tier')}")

            # 2. Normal Loop (Differential sync, DLQ retries)
            if now - last_normal >= CONFIG.normal_loop_interval_sec:
                logger.info("[ControlPlane] Executing Normal Loop (Diff Sync & DLQ Retries)...")
                norm_res = await scheduler.run_normal_loop()
                logger.info(f"[ControlPlane] Normal Loop: DLQ Retried={norm_res.get('dlq_retried')}, Discovered={norm_res.get('new_chapters_discovered')}")
                last_normal = now

            # 3. Deep Loop (Integrity audit)
            if now - last_deep >= CONFIG.deep_loop_interval_sec:
                logger.info("[ControlPlane] Executing Deep Loop (Catalog & Storage Audit)...")
                deep_res = await scheduler.run_deep_loop()
                logger.info(f"[ControlPlane] Deep Loop: Audited={deep_res.get('audited_chapters')}, Corrupt={deep_res.get('corrupt_chapters_found')}")
                last_deep = now

        except Exception as e:
            logger.error(f"[ControlPlane] Unexpected error in loop: {e}")

        await asyncio.sleep(CONFIG.fast_loop_interval_sec)

async def main():
    args = sys.argv[1:]
    command = args[0] if args else "status"

    scheduler = AutonomousScheduler()

    if command in ["start", "daemon", "healer", "worker"]:
        await cmd_start_daemon(scheduler)
    elif command == "status":
        await cmd_status(scheduler)
    elif command == "watchdog":
        await cmd_watchdog(scheduler)
    elif command == "diff-sync":
        await cmd_diff_sync(scheduler)
    elif command == "deep-audit":
        await cmd_deep_audit(scheduler)
    elif command == "verify" and len(args) > 1:
        await cmd_verify_chapter(scheduler, args[1])
    elif command == "health-check":
        res = await scheduler.supervisor.health_check()
        print(json.dumps(res, indent=2))
    else:
        print(f"Unknown command: {command}")
        print("Usage: python -m autonomous.orchestrator.main [start|status|watchdog|diff-sync|deep-audit|verify <chapter_id>|health-check]")
        sys.exit(1)

if __name__ == "__main__":
    asyncio.run(main())
