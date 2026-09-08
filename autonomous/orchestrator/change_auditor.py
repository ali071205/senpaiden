"""Change Auditor for Senpai Den Autonomous Control Plane.
Takes a baseline snapshot of git & filesystem state at startup.
On shutdown, computes and reports exact additions, deletions, line-level diffs,
and separates code changes from runtime/cache/log changes.
"""

import os
import subprocess
import hashlib
from pathlib import Path
from typing import Dict, Any, List, Optional

ROOT_DIR = Path(__file__).resolve().parent.parent.parent

# Files that represent core architecture components to verify as unchanged
CRITICAL_ARCHITECTURE_FILES = {
    "phase_state.json": ROOT_DIR / "autonomous" / "phase_state.json",
    "Scheduler": ROOT_DIR / "autonomous" / "orchestrator" / "scheduler.py",
    "Worker": ROOT_DIR / "hf-worker" / "src" / "index.ts",
    "Self-Healing": ROOT_DIR / "autonomous" / "orchestrator" / "self_healing.py",
    "Python Brain": ROOT_DIR / "autonomous" / "orchestrator" / "pipeline.py",
    "Node Provider": ROOT_DIR / "autonomous" / "node" / "bridge.js",
}

def compute_file_hash(filepath: Path) -> Optional[str]:
    """Compute SHA256 of a file if it exists."""
    if not filepath.is_file():
        return None
    try:
        hasher = hashlib.sha256()
        with open(filepath, "rb") as f:
            while chunk := f.read(65536):
                hasher.update(chunk)
        return hasher.hexdigest()
    except Exception:
        return None

def classify_file(filepath: str) -> str:
    """Categorize file path into distinct change types."""
    p = filepath.replace("\\", "/").lower()

    if "/.next/" in p or p.startswith(".next/") or "/build/" in p or "/dist/" in p:
        return "GENERATED FILES"
    if p.endswith(".pyc") or "/__pycache__/" in p or p.endswith(".cache"):
        return "CACHE FILES"
    if p.endswith(".log") or "/logs/" in p:
        return "LOG FILES"
    if "/scratch/" in p or "/tmp/" in p or p.startswith("scratch/") or p.startswith("tmp/"):
        return "TEMPORARY FILES"
    if "/tests/" in p or p.startswith("tests/") or "test_" in p or p.endswith(".test.ts"):
        return "TEST CHANGES"
    if (
        p.endswith(".env") or ".env." in p or p.endswith(".json") or p.endswith(".yml") or
        p.endswith(".yaml") or p.endswith(".toml") or p.endswith(".ini") or p.endswith("dockerfile")
    ):
        return "CONFIG CHANGES"
    if any(p.endswith(ext) for ext in [".py", ".ts", ".tsx", ".js", ".mjs", ".sql", ".cpp", ".h"]):
        return "CODE CHANGES"

    return "OTHER"

class ChangeAuditor:
    def __init__(self, root_dir: Path = ROOT_DIR):
        self.root_dir = root_dir

    def run_git_command(self, args: List[str]) -> str:
        """Run a git command in root directory safely."""
        try:
            res = subprocess.run(
                ["git"] + args,
                cwd=str(self.root_dir),
                capture_output=True,
                text=True,
                check=False,
                encoding="utf-8",
                errors="replace"
            )
            return res.stdout.strip()
        except Exception:
            return ""

    def take_baseline_snapshot(self) -> Dict[str, Any]:
        """Snapshots repository status and hashes of critical architecture files."""
        head_commit = self.run_git_command(["rev-parse", "HEAD"])
        status_raw = self.run_git_command(["status", "--porcelain=v1"])

        # Parse initial modified and untracked files
        initial_status: Dict[str, str] = {}
        for line in status_raw.splitlines():
            if len(line) >= 3:
                state = line[:2].strip()
                fpath = line[3:].strip()
                initial_status[fpath] = state

        # Compute architecture component hashes
        arch_hashes: Dict[str, Optional[str]] = {}
        for comp_name, comp_path in CRITICAL_ARCHITECTURE_FILES.items():
            arch_hashes[comp_name] = compute_file_hash(comp_path)

        return {
            "head_commit": head_commit,
            "initial_status": initial_status,
            "arch_hashes": arch_hashes,
        }

    def compute_audit(self, baseline: Dict[str, Any]) -> Dict[str, Any]:
        """Compares current state against startup baseline."""
        current_status_raw = self.run_git_command(["status", "--porcelain=v1"])
        diff_raw = self.run_git_command(["diff", "--unified=3"])

        current_status: Dict[str, str] = {}
        for line in current_status_raw.splitlines():
            if len(line) >= 3:
                state = line[:2].strip()
                fpath = line[3:].strip()
                current_status[fpath] = state

        # Detect newly added files, modified files, deleted files
        initial_status = baseline.get("initial_status", {})
        added_files: List[str] = []
        deleted_files: List[str] = []
        modified_files: List[str] = []

        # Check files present now
        for fpath, state in current_status.items():
            if fpath not in initial_status:
                if state == "??" or "A" in state:
                    added_files.append(fpath)
                elif "M" in state:
                    modified_files.append(fpath)
                elif "D" in state:
                    deleted_files.append(fpath)
            else:
                # Was already in status, check if state changed
                if "M" in state and "M" not in initial_status[fpath]:
                    modified_files.append(fpath)
                elif "D" in state and "D" not in initial_status[fpath]:
                    deleted_files.append(fpath)

        # Parse git diff for line-by-line additions and deletions
        diff_details: Dict[str, Dict[str, Any]] = {}
        current_file = None
        current_line_num = 0

        for line in diff_raw.splitlines():
            if line.startswith("diff --git"):
                parts = line.split(" ")
                if len(parts) >= 4:
                    b_path = parts[3].lstrip("b/")
                    current_file = b_path
                    diff_details[current_file] = {
                        "added": [],
                        "removed": [],
                        "changed": []
                    }
                    if current_file not in modified_files and current_file not in added_files:
                        modified_files.append(current_file)
            elif line.startswith("@@"):
                # e.g. @@ -10,4 +10,6 @@
                try:
                    hunk = line.split("+")[1].split(" ")[0]
                    current_line_num = int(hunk.split(",")[0])
                except Exception:
                    current_line_num = 0
            elif current_file and diff_details.get(current_file):
                if line.startswith("+") and not line.startswith("+++"):
                    diff_details[current_file]["added"].append({
                        "line": current_line_num,
                        "text": line[1:].strip()
                    })
                    current_line_num += 1
                elif line.startswith("-") and not line.startswith("---"):
                    diff_details[current_file]["removed"].append({
                        "line": current_line_num,
                        "text": line[1:].strip()
                    })
                elif not line.startswith("-"):
                    current_line_num += 1

        # Check architecture files preservation
        baseline_arch = baseline.get("arch_hashes", {})
        arch_status: Dict[str, bool] = {}
        for comp_name, comp_path in CRITICAL_ARCHITECTURE_FILES.items():
            current_hash = compute_file_hash(comp_path)
            arch_status[comp_name] = (current_hash == baseline_arch.get(comp_name) and current_hash is not None)

        # Categorize changes
        classified: Dict[str, List[str]] = {
            "CODE CHANGES": [],
            "CONFIG CHANGES": [],
            "TEST CHANGES": [],
            "GENERATED FILES": [],
            "LOG FILES": [],
            "CACHE FILES": [],
            "TEMPORARY FILES": [],
            "OTHER": []
        }

        all_changed = set(added_files + modified_files + deleted_files + list(diff_details.keys()))
        for f in all_changed:
            cat = classify_file(f)
            classified[cat].append(f)

        return {
            "added_files": added_files,
            "deleted_files": deleted_files,
            "modified_files": list(set(modified_files + list(diff_details.keys()))),
            "diff_details": diff_details,
            "classified": classified,
            "arch_status": arch_status,
        }

    def format_audit_report(self, audit: Dict[str, Any]) -> str:
        """Renders the change audit report according to specification."""
        lines = []
        lines.append("==================================================")
        lines.append("           HEALER CHANGE AUDIT REPORT")
        lines.append("==================================================")
        lines.append(f"Modified files: {len(audit['modified_files'])}")
        lines.append(f"Added files:    {len(audit['added_files'])}")
        lines.append(f"Deleted files:  {len(audit['deleted_files'])}")
        lines.append("")

        # 1. Classified changes breakdown
        lines.append("--- CATEGORIZED CHANGES ---")
        for category, files in audit["classified"].items():
            if files:
                lines.append(f"[{category}] ({len(files)}):")
                for f in sorted(files):
                    lines.append(f"  - {f}")
        lines.append("")

        # 2. Added files
        if audit["added_files"]:
            lines.append("--- ADDED FILES ---")
            for f in sorted(audit["added_files"]):
                lines.append(f"ADDED FILE: {f}")
            lines.append("")

        # 3. Deleted files
        if audit["deleted_files"]:
            lines.append("--- DELETED FILES ---")
            for f in sorted(audit["deleted_files"]):
                lines.append(f"DELETED FILE: {f}")
            lines.append("")

        # 4. Detailed Line-by-Line Diffs for Modified Files
        if audit["diff_details"]:
            lines.append("--- LINE-LEVEL MODIFICATIONS ---")
            for fpath, diff in audit["diff_details"].items():
                lines.append(f"MODIFIED: {fpath}")
                added = diff.get("added", [])
                removed = diff.get("removed", [])

                if added:
                    lines.append("  ADDED LINES:")
                    for a in added[:20]:  # Cap to prevent excessive terminal flooding
                        lines.append(f"    + Line {a['line']}: {a['text'][:80]}")
                    if len(added) > 20:
                        lines.append(f"    ... and {len(added) - 20} more added lines")

                if removed:
                    lines.append("  REMOVED LINES:")
                    for r in removed[:20]:
                        lines.append(f"    - Line {r['line']}: {r['text'][:80]}")
                    if len(removed) > 20:
                        lines.append(f"    ... and {len(removed) - 20} more removed lines")

                lines.append("")

        # 5. Architecture Integrity Verification
        lines.append("--- UNCHANGED ARCHITECTURE VERIFICATION ---")
        arch = audit.get("arch_status", {})
        for comp_name, is_ok in arch.items():
            status_icon = "✓" if is_ok else "✗ (MODIFIED)"
            lines.append(f"{status_icon} {comp_name}")

        lines.append("==================================================")
        return "\n".join(lines)
