import pytest
from unittest.mock import MagicMock, AsyncMock, patch
from autonomous.orchestrator.ingestion import IngestionCoordinator
from autonomous.orchestrator.state_machine import ChapterState

def test_filter_english_chapters():
    coord = IngestionCoordinator()
    raw = [
        {"chapterNumber": "1", "title": "Ch 1", "language": "en", "sourceUrl": "http://1"},
        {"chapterNumber": "2", "title": "Ch 2", "language": "es", "sourceUrl": "http://2"}, # Spanish -> should filter out
        {"chapterNumber": "3", "title": "Ch 3", "language": "fr", "sourceUrl": "http://3"}, # French -> should filter out
        {"chapterNumber": "4.5", "title": "Ch 4.5", "language": "EN-US", "sourceUrl": "http://4.5"},
        {"chapterNumber": "invalid", "title": "Ch NaN", "language": "en", "sourceUrl": "http://x"} # Invalid -> should filter out
    ]

    filtered = coord.filter_english_chapters(raw)
    assert len(filtered) == 2
    assert filtered[0]["chapterNumber"] == 1.0
    assert filtered[1]["chapterNumber"] == 4.5

def test_compute_differential():
    coord = IngestionCoordinator()
    upstream = [
        {"chapterNumber": 1.0, "title": "Ch 1", "sourceUrl": "http://1"},
        {"chapterNumber": 2.0, "title": "Ch 2", "sourceUrl": "http://2"},
        {"chapterNumber": 3.0, "title": "Ch 3 (Group A)", "sourceUrl": "http://3a"},
        {"chapterNumber": 3.0, "title": "Ch 3 (Group B)", "sourceUrl": "http://3b"}, # Duplicate release -> should dedupe
        {"chapterNumber": 4.0, "title": "Ch 4", "sourceUrl": "http://4"}
    ]
    existing_in_db = {1.0, 2.0}

    missing = coord.compute_differential(upstream, existing_in_db)
    assert len(missing) == 2
    assert missing[0]["chapterNumber"] == 3.0
    assert missing[1]["chapterNumber"] == 4.0

@pytest.mark.asyncio
async def test_verify_and_publish_blocks_corrupt_storage():
    # Setup mock Supabase client
    mock_supabase = MagicMock()
    coord = IngestionCoordinator(supabase_client=mock_supabase)

    # Mock storage_verifier returning invalid (0 pages / corrupt slice)
    with patch.object(coord.storage_verifier, "verify_page_slices", new_callable=AsyncMock) as mock_verify:
        from autonomous.orchestrator.storage_verifier import StorageVerificationResult
        mock_verify.return_value = StorageVerificationResult(
            valid=False,
            chapter_id="ch-test-1",
            total_pages=0,
            total_slices=0,
            verified_storage_provider="gdrive",
            error="Chapter has 0 pages in storage"
        )

        res = await coord.verify_and_publish_chapter("ch-test-1")
        assert res["published"] is False
        assert "0 pages" in res["error"]

        # Verify chapter was updated to FAILED, NOT READY
        update_calls = mock_supabase.from_().update.call_args_list
        last_update = update_calls[-1][0][0]
        assert last_update["job_status"] == ChapterState.FAILED.value

@pytest.mark.asyncio
async def test_verify_and_publish_approves_valid_storage():
    mock_supabase = MagicMock()
    coord = IngestionCoordinator(supabase_client=mock_supabase)

    with patch.object(coord.storage_verifier, "verify_page_slices", new_callable=AsyncMock) as mock_verify:
        from autonomous.orchestrator.storage_verifier import StorageVerificationResult
        mock_verify.return_value = StorageVerificationResult(
            valid=True,
            chapter_id="ch-test-2",
            total_pages=15,
            total_slices=45,
            verified_storage_provider="gdrive"
        )

        res = await coord.verify_and_publish_chapter("ch-test-2")
        assert res["published"] is True
        assert res["total_pages"] == 15
        assert res["total_slices"] == 45

        # Verify chapter was updated to READY
        update_calls = mock_supabase.from_().update.call_args_list
        last_update = update_calls[-1][0][0]
        assert last_update["job_status"] == ChapterState.READY.value
