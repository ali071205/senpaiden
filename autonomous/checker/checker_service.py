"""Unified Fast Checker Service.
Allows seamless selection between Python Async and C++ Native checker backends.
"""

import os
import json
import logging
import subprocess
from pathlib import Path
from typing import List, Optional
from autonomous.checker.py_checker import PythonAsyncChecker, BatchCheckResult, SingleCheckResult

logger = logging.getLogger("autonomous.checker_service")

class FastCheckerService:
    def __init__(self, preferred_engine: str = "python", concurrency: int = 50):
        self.preferred_engine = preferred_engine.lower()
        self.concurrency = concurrency
        self.py_checker = PythonAsyncChecker(concurrency=concurrency)
        self.cpp_bin = Path(__file__).parent / "fast_checker.exe"

    def is_cpp_available(self) -> bool:
        return self.cpp_bin.exists() and os.access(str(self.cpp_bin), os.X_OK)

    async def check_urls(self, urls: List[str]) -> BatchCheckResult:
        if not urls:
            return await self.py_checker.check_batch([])

        # Only use C++ if explicitly requested (e.g. manual benchmark / special native mode)
        if self.preferred_engine == "cpp" and self.is_cpp_available():
            try:
                logger.info("[CheckerService] Running explicit C++ Native fast checker...")
                return self._run_cpp_checker(urls)
            except Exception as e:
                logger.warning(f"[CheckerService] C++ checker failed ({e}), falling back to Python async...")

        # Standard Production Path: Python Async (aiohttp with pooling)
        logger.debug("[CheckerService] Running primary Python Async fast checker...")
        return await self.py_checker.check_batch(urls)

    def _run_cpp_checker(self, urls: List[str]) -> BatchCheckResult:
        input_payload = "\n".join(urls) + "\n"
        proc = subprocess.Popen(
            [str(self.cpp_bin), str(min(16, self.concurrency))],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True
        )

        stdout, stderr = proc.communicate(input=input_payload, timeout=60)
        if proc.returncode != 0:
            raise RuntimeError(f"C++ fast checker exited with code {proc.returncode}: {stderr}")

        data = json.loads(stdout.strip())
        return BatchCheckResult(
            total_urls=data["total_urls"],
            successful_count=data["successful_count"],
            failed_count=data["failed_count"],
            total_duration_sec=data["total_duration_sec"],
            throughput_rps=data["throughput_rps"],
            avg_latency_ms=data["avg_latency_ms"],
            p50_latency_ms=data["p50_latency_ms"],
            p95_latency_ms=data["p95_latency_ms"],
            p99_latency_ms=data["p99_latency_ms"],
            engine="cpp_wininet",
            results=[]
        )
