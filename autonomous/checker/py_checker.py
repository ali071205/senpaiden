"""Python Asynchronous High-Concurrency Fast Checker.
Uses aiohttp with connection pooling, DNS caching, and concurrency limiting.
"""

import asyncio
import time
from typing import List, Dict, Any, Optional
from dataclasses import dataclass, field
import aiohttp

@dataclass
class SingleCheckResult:
    url: str
    status_code: int
    latency_ms: float
    content_length: int
    is_valid: bool
    error: Optional[str] = None

@dataclass
class BatchCheckResult:
    total_urls: int
    successful_count: int
    failed_count: int
    total_duration_sec: float
    throughput_rps: float
    avg_latency_ms: float
    p50_latency_ms: float
    p95_latency_ms: float
    p99_latency_ms: float
    engine: str = "python_aiohttp"
    results: List[SingleCheckResult] = field(default_factory=list)

class PythonAsyncChecker:
    def __init__(self, concurrency: int = 50, timeout_sec: float = 5.0):
        self.concurrency = concurrency
        self.timeout_sec = timeout_sec

    async def _check_single_url(
        self,
        session: aiohttp.ClientSession,
        semaphore: asyncio.Semaphore,
        url: str
    ) -> SingleCheckResult:
        async with semaphore:
            start_t = time.perf_counter()
            try:
                # 1. Try HTTP HEAD first for zero-data verification
                async with session.head(
                    url,
                    allow_redirects=True,
                    timeout=aiohttp.ClientTimeout(total=self.timeout_sec)
                ) as resp:
                    latency = (time.perf_counter() - start_t) * 1000.0

                    if resp.status == 200:
                        cl = int(resp.headers.get("Content-Length", 0))
                        return SingleCheckResult(
                            url=url,
                            status_code=resp.status,
                            latency_ms=round(latency, 2),
                            content_length=cl,
                            is_valid=True
                        )

                    # If HEAD returned 405 (Method Not Allowed) or 403, fallback to GET Range
                    if resp.status in [405, 403]:
                        async with session.get(
                            url,
                            headers={"Range": "bytes=0-1024"},
                            timeout=aiohttp.ClientTimeout(total=self.timeout_sec)
                        ) as get_resp:
                            get_latency = (time.perf_counter() - start_t) * 1000.0
                            is_valid = get_resp.status in [200, 206]
                            cl = int(get_resp.headers.get("Content-Length", 0))
                            return SingleCheckResult(
                                url=url,
                                status_code=get_resp.status,
                                latency_ms=round(get_latency, 2),
                                content_length=cl,
                                is_valid=is_valid
                            )

                    return SingleCheckResult(
                        url=url,
                        status_code=resp.status,
                        latency_ms=round(latency, 2),
                        content_length=0,
                        is_valid=False,
                        error=f"HTTP {resp.status}"
                    )

            except Exception as e:
                latency = (time.perf_counter() - start_t) * 1000.0
                return SingleCheckResult(
                    url=url,
                    status_code=0,
                    latency_ms=round(latency, 2),
                    content_length=0,
                    is_valid=False,
                    error=str(e)
                )

    async def check_batch(self, urls: List[str]) -> BatchCheckResult:
        if not urls:
            return BatchCheckResult(
                total_urls=0,
                successful_count=0,
                failed_count=0,
                total_duration_sec=0.0,
                throughput_rps=0.0,
                avg_latency_ms=0.0,
                p50_latency_ms=0.0,
                p95_latency_ms=0.0,
                p99_latency_ms=0.0,
                engine="python_aiohttp",
                results=[]
            )

        connector = aiohttp.TCPConnector(
            limit=self.concurrency,
            limit_per_host=20,
            ttl_dns_cache=300,
            enable_cleanup_closed=True
        )
        semaphore = asyncio.Semaphore(self.concurrency)

        start_time = time.perf_counter()

        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) SenpaiDen/1.0"
        }

        async with aiohttp.ClientSession(connector=connector, headers=headers) as session:
            tasks = [self._check_single_url(session, semaphore, u) for u in urls]
            results = await asyncio.gather(*tasks)

        total_duration = time.perf_counter() - start_time
        success_count = sum(1 for r in results if r.is_valid)
        fail_count = len(results) - success_count

        latencies = sorted(r.latency_ms for r in results)
        n = len(latencies)
        avg_lat = sum(latencies) / n if n > 0 else 0.0
        p50 = latencies[int(n * 0.50)] if n > 0 else 0.0
        p95 = latencies[min(int(n * 0.95), n - 1)] if n > 0 else 0.0
        p99 = latencies[min(int(n * 0.99), n - 1)] if n > 0 else 0.0

        throughput = len(urls) / total_duration if total_duration > 0 else 0.0

        return BatchCheckResult(
            total_urls=len(urls),
            successful_count=success_count,
            failed_count=fail_count,
            total_duration_sec=round(total_duration, 3),
            throughput_rps=round(throughput, 1),
            avg_latency_ms=round(avg_lat, 2),
            p50_latency_ms=round(p50, 2),
            p95_latency_ms=round(p95, 2),
            p99_latency_ms=round(p99, 2),
            engine="python_aiohttp",
            results=results
        )
