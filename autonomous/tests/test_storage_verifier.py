import pytest
from autonomous.orchestrator.storage_verifier import StorageVerifier

@pytest.mark.asyncio
async def test_zero_pages_rejected():
    verifier = StorageVerifier(check_network_availability=False)
    res = await verifier.verify_page_slices("test-ch-1", [])
    assert res.valid is False
    assert "0 pages" in (res.error or "")

@pytest.mark.asyncio
async def test_missing_slice_keys_rejected():
    verifier = StorageVerifier(check_network_availability=False)
    pages = [
        {"page_number": 1, "r2_keys": ["manga/1/ch1/slice_0.bin"]},
        {"page_number": 2, "r2_keys": []}  # Missing slices!
    ]
    res = await verifier.verify_page_slices("test-ch-2", pages)
    assert res.valid is False
    assert "no slice keys" in (res.error or "")

@pytest.mark.asyncio
async def test_empty_string_slice_key_rejected():
    verifier = StorageVerifier(check_network_availability=False)
    pages = [
        {"page_number": 1, "r2_keys": ["   "]}
    ]
    res = await verifier.verify_page_slices("test-ch-3", pages)
    assert res.valid is False
    assert "empty or malformed" in (res.error or "")

@pytest.mark.asyncio
async def test_valid_pages_approved():
    verifier = StorageVerifier(check_network_availability=False)
    pages = [
        {"page_number": 1, "r2_keys": ["manga/1/ch1/p1_s0.bin", "manga/1/ch1/p1_s1.bin"]},
        {"page_number": 2, "r2_keys": ["manga/1/ch1/p2_s0.bin"]}
    ]
    res = await verifier.verify_page_slices("test-ch-4", pages)
    assert res.valid is True
    assert res.total_pages == 2
    assert res.total_slices == 3
    assert res.error is None
