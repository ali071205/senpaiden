"""Autonomous Phase State Registry.
Tracks and persists phase execution progress so operations can safely resume without re-running completed phases.
"""

import json
from pathlib import Path
from enum import Enum
from typing import Dict, Any, Optional
from datetime import datetime, timezone

STATE_FILE = Path(__file__).resolve().parent.parent / "phase_state.json"

class PhaseStatus(str, Enum):
    PENDING = "PENDING"
    RUNNING = "RUNNING"
    VERIFYING = "VERIFYING"
    FAILED = "FAILED"
    NEEDS_REVIEW = "NEEDS_REVIEW"
    PASSED = "PASSED"
    LOCKED = "LOCKED"

DEFAULT_PHASES = {
    "PHASE_1": {"status": PhaseStatus.LOCKED.value, "description": "Existing bugs fix & hardening", "locked_at": "2026-09-07T17:32:20Z"},
    "PHASE_2": {"status": PhaseStatus.LOCKED.value, "description": "Autonomous Architecture Foundations & Python Orchestrator", "locked_at": "2026-09-07T17:37:50Z"},
    "PHASE_3": {"status": PhaseStatus.LOCKED.value, "description": "Fast Checker & Empirical Benchmark", "locked_at": "2026-09-07T17:41:50Z"},
    "PHASE_4": {"status": PhaseStatus.LOCKED.value, "description": "Ingestion Control Plane (Differential Updates & Multi-source Coordination)", "locked_at": "2026-09-07T17:50:30Z"},
    "PHASE_5": {"status": PhaseStatus.PENDING.value, "description": "End-to-End Autonomous Ingestion Pipeline", "locked_at": None},
    "PHASE_6": {"status": PhaseStatus.PENDING.value, "description": "Deterministic Self-Healing Engine", "locked_at": None},
    "PHASE_7": {"status": PhaseStatus.PENDING.value, "description": "AI Error Analyzer & Guarded Repair Planner", "locked_at": None},
    "PHASE_8": {"status": PhaseStatus.PENDING.value, "description": "Multi-Level Autonomous Loops (Fast, Normal, Deep)", "locked_at": None},
    "PHASE_9": {"status": PhaseStatus.PENDING.value, "description": "Dynamic Maintenance Mode & Recovery Automation", "locked_at": None},
    "PHASE_10": {"status": PhaseStatus.PENDING.value, "description": "Admin Command Center & Health Metrics API", "locked_at": None},
    "PHASE_11": {"status": PhaseStatus.PENDING.value, "description": "Chaos Engineering & Comprehensive Failure Suite", "locked_at": None},
}

class PhaseRegistry:
    def __init__(self, state_file: Path = STATE_FILE):
        self.state_file = state_file
        self.state: Dict[str, Any] = self._load()

    def _load(self) -> Dict[str, Any]:
        if self.state_file.exists():
            try:
                with open(self.state_file, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception:
                pass
        # Initialize with defaults
        self._save(DEFAULT_PHASES)
        return DEFAULT_PHASES.copy()

    def _save(self, data: Dict[str, Any]):
        with open(self.state_file, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)

    def get_phase_status(self, phase_name: str) -> Optional[str]:
        return self.state.get(phase_name, {}).get("status")

    def set_phase_status(self, phase_name: str, status: PhaseStatus, details: Optional[Dict[str, Any]] = None):
        if phase_name not in self.state:
            self.state[phase_name] = {"description": "", "status": status.value}
        self.state[phase_name]["status"] = status.value
        self.state[phase_name]["updated_at"] = datetime.now(timezone.utc).isoformat()
        if status == PhaseStatus.LOCKED:
            self.state[phase_name]["locked_at"] = datetime.now(timezone.utc).isoformat()
        if details:
            self.state[phase_name]["details"] = details
        self._save(self.state)

    def is_phase_locked(self, phase_name: str) -> bool:
        return self.get_phase_status(phase_name) == PhaseStatus.LOCKED.value
