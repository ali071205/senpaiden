import pytest
from autonomous.checker.py_checker import PythonAsyncChecker
from autonomous.checker.checker_service import FastCheckerService

@pytest.mark.asyncio
async def test_python_checker_empty():
    checker = PythonAsyncChecker()
    res = await checker.check_batch([])
    assert res.total_urls == 0
    assert res.throughput_rps == 0.0

@pytest.mark.asyncio
async def test_python_checker_sample_urls():
    checker = PythonAsyncChecker(concurrency=5, timeout_sec=6.0)
    urls = [
        "https://api.mangadex.org/manga?limit=1",
        "https://mangadex.org/favicon.ico"
    ]
    res = await checker.check_batch(urls)
    assert res.total_urls == 2
    assert res.successful_count >= 1
    assert res.throughput_rps > 0.0
    assert res.engine == "python_aiohttp"

@pytest.mark.asyncio
async def test_checker_service_fallback():
    # Force engine = "auto" or "python"
    service = FastCheckerService(preferred_engine="python")
    urls = ["https://mangadex.org/favicon.ico"]
    res = await service.check_urls(urls)
    assert res.total_urls == 1
    assert res.successful_count == 1
