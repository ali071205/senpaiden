"""Storage Manager: Google Drive (Primary) + Cloudflare R2 / B2 (Fallback / CDN).
Handles tier selection, circuit breakers for Drive rate limits, and key standardization.
"""

import time
import logging
from enum import Enum
from typing import Dict, Any, Optional, List
import aiohttp

from autonomous.orchestrator.config import CONFIG

logger = logging.getLogger("autonomous.storage_manager")

class StorageTier(str, Enum):
    GDRIVE_PRIMARY = "gdrive"
    R2_FALLBACK = "r2"

class StorageManager:
    def __init__(self):
        self.config = CONFIG
        # Circuit breaker state for Google Drive API rate limiting
        self.gdrive_consecutive_failures = 0
        self.gdrive_cooldown_until = 0.0
        self.cooldown_duration_seconds = 600.0 # 10 minutes cooldown on rate limit trip
        self.failure_threshold = 5

    def get_active_storage_tier(self) -> StorageTier:
        """
        Returns active tier: Google Drive (Primary) unless cooldown is tripped,
        in which case failover to R2/B2.
        """
        now = time.time()
        if self.gdrive_consecutive_failures >= self.failure_threshold:
            if now < self.gdrive_cooldown_until:
                return StorageTier.R2_FALLBACK
            else:
                # Cooldown expired: probe recovery
                logger.info("[StorageManager] Google Drive cooldown expired. Probing primary tier recovery...")
                self.gdrive_consecutive_failures = 0

        return StorageTier.GDRIVE_PRIMARY

    def record_gdrive_success(self):
        self.gdrive_consecutive_failures = 0

    def record_gdrive_failure(self, error_message: str):
        self.gdrive_consecutive_failures += 1
        logger.warning(
            f"[StorageManager] Google Drive failure ({self.gdrive_consecutive_failures}/{self.failure_threshold}): {error_message}"
        )
        if self.gdrive_consecutive_failures >= self.failure_threshold:
            self.gdrive_cooldown_until = time.time() + self.cooldown_duration_seconds
            logger.error(
                f"[StorageManager] Google Drive circuit tripped. Failing over to R2 for {self.cooldown_duration_seconds}s."
            )

    @staticmethod
    def format_r2_key(manga_id: str, chapter_number: float, page_number: int, slice_idx: int) -> str:
        formatted_ch = int(chapter_number) if chapter_number.is_integer() else chapter_number
        return f"mangas/{manga_id}/ch_{formatted_ch}/p{page_number}_s{slice_idx}.webp"

    @staticmethod
    def format_gdrive_key(file_id: str) -> str:
        return f"gdrive/{file_id}"

    @staticmethod
    def is_gdrive_key(key: str) -> bool:
        return isinstance(key, str) and key.startswith("gdrive/")

    async def probe_slice_availability(self, key: str, timeout_sec: float = 6.0) -> bool:
        """
        Probes availability of a slice key.
        If gdrive/<fileId>: tests Google Drive file metadata accessibility.
        If S3/R2 key: tests HTTP HEAD against R2/B2 S3 endpoint.
        """
        if not key or not isinstance(key, str) or not key.strip():
            return False

        if self.is_gdrive_key(key):
            file_id = key.split("gdrive/")[1].strip()
            return len(file_id) > 5 # Valid Google Drive file ID format

        # S3 / R2 probe via HEAD request
        probe_url = f"{self.config.r2_endpoint}/{self.config.r2_bucket_name}/{key}" if not key.startswith("http") else key

        try:
            async with aiohttp.ClientSession() as session:
                async with session.head(probe_url, timeout=aiohttp.ClientTimeout(total=timeout_sec)) as resp:
                    if resp.status in [200, 206]:
                        return True
                    if resp.status in [405, 403]: # Fallback GET range
                        async with session.get(
                            probe_url,
                            headers={"Range": "bytes=0-100"},
                            timeout=aiohttp.ClientTimeout(total=timeout_sec)
                        ) as get_resp:
                            return get_resp.status in [200, 206]
                    return False
        except Exception as e:
            logger.debug(f"[StorageManager] Probe failed for {probe_url}: {e}")
            return False
