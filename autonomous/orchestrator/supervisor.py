"""Subprocess Supervisor and Bridge Orchestrator.
Supervises Node.js provider adapters and pipeline tasks without creating duplicate worker claims.
Enforces timeouts, error containment, and output validation.
"""

import asyncio
import json
import logging
import time
import shutil
from typing import Dict, Any, List, Optional
from autonomous.orchestrator.config import CONFIG

logger = logging.getLogger("autonomous.supervisor")

class SupervisorError(Exception):
    pass

class NodeBridgeSupervisor:
    def __init__(self, timeout_seconds: Optional[int] = None):
        self.timeout_seconds = timeout_seconds or CONFIG.worker_timeout_seconds

    async def run_bridge_command(self, command: str, *args: str) -> Dict[str, Any]:
        """
        Executes a command on the Node.js bridge using 'npx tsx autonomous/node/bridge.js'.
        Captures stdout and stderr, parses JSON result, and enforces strict timeout.
        """
        bridge_script = str(CONFIG.node_bridge_path)
        npx_bin = shutil.which("npx") or "npx"
        cmd = [npx_bin, "tsx", bridge_script, command, *args]

        logger.debug(f"[Supervisor] Executing: {' '.join(cmd)}")
        start_time = time.time()

        try:
            process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                cwd=str(CONFIG.node_bridge_path.parent.parent.parent)
            )

            try:
                stdout_bytes, stderr_bytes = await asyncio.wait_for(
                    process.communicate(),
                    timeout=self.timeout_seconds
                )
            except asyncio.TimeoutError:
                process.kill()
                await process.wait()
                raise SupervisorError(
                    f"Command '{command}' timed out after {self.timeout_seconds} seconds"
                )

            stdout_text = stdout_bytes.decode("utf-8", errors="replace").strip()
            stderr_text = stderr_bytes.decode("utf-8", errors="replace").strip()

            elapsed = round(time.time() - start_time, 2)

            if process.returncode != 0 and not stdout_text:
                raise SupervisorError(
                    f"Bridge command failed (exit {process.returncode}): {stderr_text}"
                )

            # Find the JSON line in stdout (in case of log outputs preceding the JSON)
            json_payload = None
            for line in reversed(stdout_text.splitlines()):
                line = line.strip()
                if line.startswith("{") and line.endswith("}"):
                    try:
                        json_payload = json.loads(line)
                        break
                    except json.JSONDecodeError:
                        continue

            if json_payload is None:
                raise SupervisorError(
                    f"Failed to parse JSON response from bridge. Raw output: {stdout_text[:500]}"
                )

            json_payload["_elapsed_seconds"] = elapsed
            return json_payload

        except Exception as e:
            logger.error(f"[Supervisor] Error executing '{command}': {str(e)}")
            raise

    async def fetch_latest_manga(self, page: int = 1) -> Dict[str, Any]:
        return await self.run_bridge_command("fetch-latest", str(page))

    async def fetch_chapter_list(self, manga_source_id: str) -> Dict[str, Any]:
        return await self.run_bridge_command("fetch-chapters", manga_source_id)

    async def fetch_chapter_pages(self, chapter_source_id: str) -> Dict[str, Any]:
        return await self.run_bridge_command("fetch-pages", chapter_source_id)

    async def health_check(self) -> Dict[str, Any]:
        return await self.run_bridge_command("health-check")
