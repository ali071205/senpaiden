import pytest
from unittest.mock import MagicMock, AsyncMock, patch
from autonomous.orchestrator.pipeline import AutonomousIngestionPipeline
from autonomous.orchestrator.state_machine import ChapterState

@pytest.mark.asyncio
async def test_pipeline_happy_path():
    mock_supabase = MagicMock()
    pipeline = AutonomousIngestionPipeline(supabase_client=mock_supabase)

    simulated_pages = [
        {"page_number": 1, "r2_keys": ["mangas/m1/ch1/p1_s0.webp"], "slice_dimensions": [{"width": 800, "height": 1200}]},
        {"page_number": 2, "r2_keys": ["mangas/m1/ch1/p2_s0.webp"], "slice_dimensions": [{"width": 800, "height": 1200}]}
    ]

    res = await pipeline.run_pipeline_for_chapter(
        chapter_id="ch-happy-1",
        manga_id="manga-1",
        chapter_number=1.0,
        source_url="http://provider.com/ch1",
        simulated_pages=simulated_pages
    )

    assert res["success"] is True
    assert res["pages_published"] == 2

    # Verify update to READY
    update_calls = mock_supabase.from_().update.call_args_list
    final_update = update_calls[-1][0][0]
    assert final_update["job_status"] == ChapterState.READY.value

@pytest.mark.asyncio
async def test_pipeline_blocks_unverified_storage():
    mock_supabase = MagicMock()
    pipeline = AutonomousIngestionPipeline(supabase_client=mock_supabase)

    # Empty r2_keys on page 2
    corrupt_pages = [
        {"page_number": 1, "r2_keys": ["mangas/m1/ch2/p1_s0.webp"]},
        {"page_number": 2, "r2_keys": []}  # Corrupted!
    ]

    res = await pipeline.run_pipeline_for_chapter(
        chapter_id="ch-corrupt-2",
        manga_id="manga-1",
        chapter_number=2.0,
        source_url="http://provider.com/ch2",
        simulated_pages=corrupt_pages
    )

    assert res["success"] is False
    assert "Pre-publish storage verification rejected" in res["error"]

    # Verify chapter was NOT moved to READY
    update_calls = mock_supabase.from_().update.call_args_list
    final_update = update_calls[-1][0][0]
    assert final_update["job_status"] != ChapterState.READY.value

@pytest.mark.asyncio
async def test_pipeline_zero_pages_failure():
    mock_supabase = MagicMock()
    pipeline = AutonomousIngestionPipeline(supabase_client=mock_supabase)

    res = await pipeline.run_pipeline_for_chapter(
        chapter_id="ch-empty-3",
        manga_id="manga-1",
        chapter_number=3.0,
        source_url="http://provider.com/ch3",
        simulated_pages=[] # 0 pages
    )

    assert res["success"] is False
    assert "0 images" in res["error"]
