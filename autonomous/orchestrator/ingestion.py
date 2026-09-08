"""Ingestion Control Plane: Differential Sync, English-only filtering, and Pre-publish Storage Gate.
Coordinates upstream providers with the Supabase catalogue and enforces storage verification.
"""

import logging
from typing import Dict, Any, List, Optional, Set
from datetime import datetime, timezone

from autonomous.orchestrator.config import CONFIG
from autonomous.orchestrator.state_machine import ChapterStateMachine, ChapterState, CorrelationContext
from autonomous.orchestrator.storage_verifier import StorageVerifier
from autonomous.orchestrator.supervisor import NodeBridgeSupervisor

logger = logging.getLogger("autonomous.ingestion")

class IngestionCoordinator:
    def __init__(self, supabase_client=None):
        self.config = CONFIG
        self.supabase = supabase_client
        self.state_machine = ChapterStateMachine(max_retries=self.config.max_chapter_retries)
        self.storage_verifier = StorageVerifier(check_network_availability=True)
        self.supervisor = NodeBridgeSupervisor(timeout_seconds=self.config.worker_timeout_seconds)

    def filter_english_chapters(self, raw_chapters: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Enforces English-only chapter ingestion.
        Rejects non-English chapter entries (e.g. MangaDex language flags).
        """
        valid_english = []
        for ch in raw_chapters:
            lang = ch.get("language") or ch.get("translatedLanguage")
            # If language is explicitly provided, verify it is English
            if lang and lang.lower() not in ["en", "en-us", "en-gb", "english"]:
                continue

            # Ensure valid chapter number
            try:
                num = float(ch.get("chapterNumber") if ch.get("chapterNumber") is not None else ch.get("chapter_number", 0))
            except (ValueError, TypeError):
                continue

            valid_english.append({
                "sourceId": ch.get("sourceId") or ch.get("source_id"),
                "chapterNumber": num,
                "title": ch.get("title") or f"Chapter {num}",
                "sourceUrl": ch.get("sourceUrl") or ch.get("source_url")
            })

        return valid_english

    def compute_differential(
        self,
        upstream_chapters: List[Dict[str, Any]],
        existing_chapter_numbers: Set[float]
    ) -> List[Dict[str, Any]]:
        """
        Calculates differential missing chapters.
        Only chapters whose chapterNumber is NOT in existing_chapter_numbers are returned.
        """
        missing = []
        seen_numbers: Set[float] = set()

        for ch in upstream_chapters:
            num = ch["chapterNumber"]
            if num not in existing_chapter_numbers and num not in seen_numbers:
                missing.append(ch)
                seen_numbers.add(num)

        return missing

    async def sync_manga_differential(self, manga_db_id: str, manga_source_id: str) -> Dict[str, Any]:
        """
        Performs differential chapter sync for a single manga:
        1. Fetches upstream chapters from Provider via Node Supervisor.
        2. Filters English-only chapters.
        3. Queries Supabase DB for existing chapter numbers.
        4. Inserts strictly missing chapters as QUEUED.
        """
        ctx = CorrelationContext()
        ctx.log_event("differential_sync_started", {"manga_id": manga_db_id, "source_id": manga_source_id})

        if not self.supabase:
            return {"success": False, "error": "Supabase client not configured"}

        try:
            # 1. Fetch upstream
            resp = await self.supervisor.fetch_chapter_list(manga_source_id)
            if not resp.get("success") or not resp.get("data"):
                error_msg = resp.get("error", "No chapters returned from provider")
                ctx.log_event("provider_fetch_failed", {"error": error_msg})
                return {"success": False, "error": error_msg}

            raw_upstream = resp["data"]
            # 2. English filter
            english_upstream = self.filter_english_chapters(raw_upstream)

            # 3. Query existing chapters
            db_res = self.supabase.from_("chapters")\
                .select("chapter_number")\
                .eq("manga_id", manga_db_id)\
                .execute()

            existing_nums: Set[float] = set()
            for row in (db_res.data or []):
                val = row.get("chapter_number")
                if val is not None:
                    existing_nums.add(float(val))

            # 4. Compute differential
            missing = self.compute_differential(english_upstream, existing_nums)

            # 5. Insert missing as QUEUED
            inserted_count = 0
            if missing:
                records_to_insert = [
                    {
                        "manga_id": manga_db_id,
                        "chapter_number": ch["chapterNumber"],
                        "title": ch["title"],
                        "source_url": ch["sourceUrl"],
                        "job_status": ChapterState.QUEUED.value,
                        "content_freshness": "fresh",
                    }
                    for ch in missing
                ]

                upsert_res = self.supabase.from_("chapters").upsert(
                    records_to_insert,
                    on_conflict="manga_id,chapter_number",
                    ignore_duplicates=True
                ).execute()

                inserted_count = len(upsert_res.data or records_to_insert)

            # Update manga timestamp
            self.supabase.from_("manga").update({
                "updated_at": datetime.now(timezone.utc).isoformat()
            }).eq("id", manga_db_id).execute()

            result = {
                "success": True,
                "manga_id": manga_db_id,
                "existing_chapters": len(existing_nums),
                "upstream_english_chapters": len(english_upstream),
                "newly_queued_chapters": inserted_count,
                "correlation_id": ctx.correlation_id
            }
            ctx.log_event("differential_sync_complete", result)
            return result

        except Exception as e:
            logger.error(f"[Ingestion] Error syncing manga {manga_db_id}: {str(e)}")
            return {"success": False, "error": str(e)}

    async def verify_and_publish_chapter(self, chapter_id: str) -> Dict[str, Any]:
        """
        Pre-Publish Storage Verification Gateway:
        Verifies all page slices exist and have valid dimensions BEFORE moving state to READY.
        """
        ctx = CorrelationContext()
        ctx.log_event("pre_publish_verification_started", {"chapter_id": chapter_id})

        if not self.supabase:
            return {"success": False, "error": "Supabase client not configured"}

        try:
            # 1. Transition chapter to STORAGE_VERIFYING
            self.supabase.from_("chapters").update({
                "job_status": ChapterState.STORAGE_VERIFYING.value,
                "updated_at": datetime.now(timezone.utc).isoformat()
            }).eq("id", chapter_id).execute()

            # 2. Fetch pages for this chapter
            pages_res = self.supabase.from_("pages")\
                .select("id, page_number, r2_keys, slice_dimensions")\
                .eq("chapter_id", chapter_id)\
                .order("page_number", desc=False)\
                .execute()

            pages = pages_res.data or []

            # 3. Storage Verification
            verification = await self.storage_verifier.verify_page_slices(chapter_id, pages)

            if not verification.valid:
                # Storage verification failed! Do NOT publish to READY.
                logger.error(f"[Ingestion] Storage verification FAILED for {chapter_id}: {verification.error}")

                self.supabase.from_("chapters").update({
                    "job_status": ChapterState.FAILED.value,
                    "updated_at": datetime.now(timezone.utc).isoformat()
                }).eq("id", chapter_id).execute()

                # Insert DLQ entry
                try:
                    self.supabase.from_("dead_letter_queue").insert({
                        "chapter_id": chapter_id,
                        "error_type": "STORAGE_VERIFICATION_FAILED",
                        "error_detail": verification.error,
                        "max_retries": self.config.max_chapter_retries,
                        "retry_count": 1,
                        "resolved": False
                    }).execute()
                except Exception:
                    pass

                return {
                    "success": False,
                    "published": False,
                    "error": verification.error,
                    "correlation_id": ctx.correlation_id
                }

            # 4. Storage verification PASSED! Move to READY
            self.supabase.from_("chapters").update({
                "job_status": ChapterState.READY.value,
                "content_freshness": "fresh",
                "updated_at": datetime.now(timezone.utc).isoformat()
            }).eq("id", chapter_id).execute()

            ctx.log_event("chapter_published_ready", {
                "total_pages": verification.total_pages,
                "total_slices": verification.total_slices,
                "storage_provider": verification.verified_storage_provider
            })

            return {
                "success": True,
                "published": True,
                "chapter_id": chapter_id,
                "total_pages": verification.total_pages,
                "total_slices": verification.total_slices,
                "storage_provider": verification.verified_storage_provider,
                "correlation_id": ctx.correlation_id
            }

        except Exception as e:
            logger.error(f"[Ingestion] Gateway error for {chapter_id}: {str(e)}")
            return {"success": False, "published": False, "error": str(e)}
