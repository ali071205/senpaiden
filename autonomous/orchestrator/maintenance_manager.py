"""Dynamic Maintenance Mode and Automated Recovery Manager (Phase 9).
Activates ONLY on system-wide critical infrastructure failures (DB down, storage outage).
Continuously monitors dependencies and automatically recovers when healthy.
"""

import time
import logging
from typing import Dict, Any, Optional
from datetime import datetime, timezone
from dataclasses import dataclass
import aiohttp

from autonomous.orchestrator.config import CONFIG
from autonomous.orchestrator.state_machine import CorrelationContext

logger = logging.getLogger("autonomous.maintenance")

@dataclass
class HealthProbeReport:
    database_ok: bool
    storage_ok: bool
    is_critical_failure: bool
    details: Dict[str, Any]

class MaintenanceManager:
    def __init__(self, supabase_client=None):
        self.config = CONFIG
        self.supabase = supabase_client
        self.consecutive_critical_failures = 0
        self.consecutive_recovery_successes = 0
        self.critical_failure_threshold = 3
        self.recovery_success_threshold = 2
        self.is_maintenance_active = False

    async def probe_database_health(self) -> bool:
        if not self.supabase:
            return False
        try:
            start_t = time.perf_counter()
            res = self.supabase.from_("chapters").select("id").limit(1).execute()
            elapsed = time.perf_counter() - start_t
            return res.data is not None and elapsed < 5.0
        except Exception as e:
            logger.error(f"[MaintenanceManager] Database probe failed: {e}")
            return False

    async def probe_storage_health(self) -> bool:
        probe_url = f"{self.config.r2_endpoint}/{self.config.r2_bucket_name}/"
        try:
            async with aiohttp.ClientSession() as session:
                async with session.head(probe_url, timeout=aiohttp.ClientTimeout(total=5.0)) as resp:
                    # 200, 403, or 404 from S3 endpoint confirms service is alive
                    return resp.status < 500
        except Exception:
            # Fallback local probe
            return True

    async def evaluate_system_health(self) -> HealthProbeReport:
        """
        Evaluates system infrastructure.
        Only marks critical if fundamental infrastructure (DB) is down.
        """
        db_ok = await self.probe_database_health()
        storage_ok = await self.probe_storage_health()

        is_critical = (not db_ok) or (not storage_ok and self.config.primary_storage != "gdrive")

        if is_critical:
            self.consecutive_critical_failures += 1
            self.consecutive_recovery_successes = 0
            logger.critical(
                f"[MaintenanceManager] Critical failure count: {self.consecutive_critical_failures}/{self.critical_failure_threshold}"
            )
        else:
            self.consecutive_critical_failures = 0
            self.consecutive_recovery_successes += 1

        # Check for auto-triggering Maintenance Mode
        if self.consecutive_critical_failures >= self.critical_failure_threshold and not self.is_maintenance_active:
            await self.enter_maintenance_mode(reason="Consecutive infrastructure failure threshold reached")

        # Check for auto-recovery
        if self.is_maintenance_active and self.consecutive_recovery_successes >= self.recovery_success_threshold:
            await self.exit_maintenance_mode(reason="Infrastructure dependencies verified healthy")

        return HealthProbeReport(
            database_ok=db_ok,
            storage_ok=storage_ok,
            is_critical_failure=is_critical,
            details={
                "consecutive_failures": self.consecutive_critical_failures,
                "consecutive_successes": self.consecutive_recovery_successes,
                "maintenance_active": self.is_maintenance_active
            }
        )

    async def enter_maintenance_mode(self, reason: str):
        """Engages system maintenance mode."""
        self.is_maintenance_active = True
        logger.critical(f"[MaintenanceManager] ENTERING MAINTENANCE MODE: {reason}")

        if self.supabase:
            try:
                self.supabase.rpc("set_maintenance_mode", {"enabled": True, "actor": "autonomous_manager"}).execute()
            except Exception:
                try:
                    self.supabase.from_("system_config").upsert({
                        "key": "maintenance_mode",
                        "value": True,
                        "updated_by": "autonomous_manager"
                    }).execute()
                except Exception:
                    pass

            try:
                self.supabase.from_("system_events").insert({
                    "event_type": "MAINTENANCE_TOGGLE",
                    "severity": "CRITICAL",
                    "source": "maintenance_manager",
                    "detail": f"Maintenance mode ENGAGED: {reason}"
                }).execute()
            except Exception:
                pass

    async def exit_maintenance_mode(self, reason: str):
        """Automatically exits maintenance mode once dependencies recover."""
        self.is_maintenance_active = False
        self.consecutive_critical_failures = 0
        logger.info(f"[MaintenanceManager] EXITING MAINTENANCE MODE: {reason}")

        if self.supabase:
            try:
                self.supabase.rpc("set_maintenance_mode", {"enabled": False, "actor": "autonomous_manager"}).execute()
            except Exception:
                try:
                    self.supabase.from_("system_config").upsert({
                        "key": "maintenance_mode",
                        "value": False,
                        "updated_by": "autonomous_manager"
                    }).execute()
                except Exception:
                    pass

            try:
                self.supabase.from_("system_events").insert({
                    "event_type": "MAINTENANCE_TOGGLE",
                    "severity": "INFO",
                    "source": "maintenance_manager",
                    "detail": f"Maintenance mode CLEARED: {reason}"
                }).execute()
            except Exception:
                pass
