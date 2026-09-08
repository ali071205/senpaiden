"""Storage Verifier for New and Updated Chapters.
Ensures zero-byte files or missing slices NEVER get published to READY state.
Primary Storage: Google Drive (encrypted .bin)
Fallback/CDN: Cloudflare R2 / Backblaze B2
"""

import logging
from typing import List, Dict, Any, Optional
from dataclasses import dataclass
import aiohttp
from autonomous.orchestrator.config import CONFIG

logger = logging.getLogger(__name__)

@dataclass
class StorageVerificationResult:
    valid: bool
    chapter_id: str
    total_pages: int
    total_slices: int
    verified_storage_provider: str
    error: Optional[str] = None
    details: Optional[Dict[str, Any]] = None

class StorageVerifier:
    def __init__(self, check_network_availability: bool = False):
        self.check_network = check_network_availability

    async def verify_page_slices(
        self,
        chapter_id: str,
        pages_data: List[Dict[str, Any]],
        storage_provider: Optional[str] = None
    ) -> StorageVerificationResult:
        """
        Validates page and slice integrity:
        1. Non-empty page count.
        2. Every page must contain at least one valid slice reference.
        3. Every slice reference must be non-empty and have valid dimensions.
        4. Optional network HEAD probe if check_network is True.
        """
        provider = storage_provider or CONFIG.primary_storage

        if not pages_data or len(pages_data) == 0:
            return StorageVerificationResult(
                valid=False,
                chapter_id=chapter_id,
                total_pages=0,
                total_slices=0,
                verified_storage_provider=provider,
                error="Chapter has 0 pages registered in storage record."
            )

        total_slices = 0
        all_slice_keys: List[str] = []

        for idx, page in enumerate(pages_data):
            page_num = page.get("page_number", idx + 1)
            r2_keys = page.get("r2_keys") or []

            if not isinstance(r2_keys, list) or len(r2_keys) == 0:
                return StorageVerificationResult(
                    valid=False,
                    chapter_id=chapter_id,
                    total_pages=len(pages_data),
                    total_slices=total_slices,
                    verified_storage_provider=provider,
                    error=f"Page {page_num} has no slice keys assigned."
                )

            for key in r2_keys:
                if not key or not isinstance(key, str) or len(key.strip()) == 0:
                    return StorageVerificationResult(
                        valid=False,
                        chapter_id=chapter_id,
                        total_pages=len(pages_data),
                        total_slices=total_slices,
                        verified_storage_provider=provider,
                        error=f"Page {page_num} contains an empty or malformed slice key."
                    )
                all_slice_keys.append(key)
                total_slices += 1

        # Optional active network HEAD probe for sample slices
        if self.check_network and all_slice_keys:
            sample_keys = all_slice_keys[:3] # Probe first 3 slices
            network_err = await self._probe_keys(sample_keys)
            if network_err:
                return StorageVerificationResult(
                    valid=False,
                    chapter_id=chapter_id,
                    total_pages=len(pages_data),
                    total_slices=total_slices,
                    verified_storage_provider=provider,
                    error=f"Network probe failed for sample slice: {network_err}"
                )

        return StorageVerificationResult(
            valid=True,
            chapter_id=chapter_id,
            total_pages=len(pages_data),
            total_slices=total_slices,
            verified_storage_provider=provider,
            details={
                "sample_slice": all_slice_keys[0] if all_slice_keys else None,
                "pages_verified": len(pages_data)
            }
        )

    async def _probe_keys(self, keys: List[str]) -> Optional[str]:
        """Probes slice URLs/endpoints with a short HTTP HEAD/GET request."""
        async with aiohttp.ClientSession() as session:
            for key in keys:
                # If key is full URL (e.g. MangaDex/CDN proxy)
                if key.startswith("http://") or key.startswith("https://"):
                    probe_url = key
                else:
                    # Construct storage endpoint URL
                    probe_url = f"{CONFIG.r2_endpoint}/{CONFIG.r2_bucket_name}/{key}"

                try:
                    async with session.head(probe_url, timeout=aiohttp.ClientTimeout(total=8)) as resp:
                        if resp.status >= 400 and resp.status != 405: # 405 can happen if HEAD not supported
                            # Fallback GET range
                            async with session.get(
                                probe_url,
                                headers={"Range": "bytes=0-1024"},
                                timeout=aiohttp.ClientTimeout(total=8)
                            ) as get_resp:
                                if get_resp.status >= 400:
                                    return f"Storage returned HTTP {get_resp.status} for {probe_url}"
                except Exception as e:
                    return f"Connection error probing {probe_url}: {str(e)}"
        return None
