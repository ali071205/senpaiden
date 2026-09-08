import os
from pathlib import Path
from dataclasses import dataclass
from typing import Optional
from dotenv import load_dotenv

# Search and load available .env files in priority order
ROOT_DIR = Path(__file__).resolve().parent.parent.parent
ENV_CANDIDATES = [
    ROOT_DIR / ".env",
    ROOT_DIR / "hf-worker" / ".env",
    ROOT_DIR / "frontend" / ".env",
]

for env_file in ENV_CANDIDATES:
    if env_file.exists():
        load_dotenv(env_file)

@dataclass(frozen=True)
class OrchestratorConfig:
    # Supabase Configuration
    supabase_url: str = os.getenv("SUPABASE_URL", "")
    supabase_service_key: str = os.getenv("SUPABASE_SERVICE_KEY", "")

    # Storage Architecture (Decision: Primary = Google Drive, Fallback = R2/B2)
    primary_storage: str = os.getenv("PRIMARY_STORAGE", "gdrive")
    fallback_storage: str = os.getenv("FALLBACK_STORAGE", "r2")

    # Google Drive credentials
    gdrive_client_id: str = os.getenv("GDRIVE_CLIENT_ID", "")
    gdrive_client_secret: str = os.getenv("GDRIVE_CLIENT_SECRET", "")
    gdrive_refresh_token: str = os.getenv("GDRIVE_REFRESH_TOKEN", "")
    gdrive_root_folder_id: str = os.getenv("GDRIVE_ROOT_FOLDER_ID", "")

    # Backblaze B2 / Cloudflare R2 credentials
    r2_endpoint: str = os.getenv("R2_ENDPOINT", "https://s3.us-east-005.backblazeb2.com")
    r2_bucket_name: str = os.getenv("R2_BUCKET_NAME", "senpaiden-mangas")
    r2_access_key_id: str = os.getenv("R2_ACCESS_KEY_ID", "")
    r2_secret_access_key: str = os.getenv("R2_SECRET_ACCESS_KEY", "")

    # Operational Timeouts & Limits
    worker_timeout_seconds: int = int(os.getenv("WORKER_TIMEOUT_SECONDS", "600"))  # 10 minutes
    max_chapter_retries: int = int(os.getenv("MAX_CHAPTER_RETRIES", "3"))
    fast_loop_interval_sec: float = float(os.getenv("FAST_LOOP_INTERVAL_SEC", "15.0"))
    normal_loop_interval_sec: float = float(os.getenv("NORMAL_LOOP_INTERVAL_SEC", "300.0"))
    deep_loop_interval_sec: float = float(os.getenv("DEEP_LOOP_INTERVAL_SEC", "3600.0"))

    # DLQ backoff base delay in milliseconds
    dlq_retry_base_delay_ms: int = int(os.getenv("DLQ_RETRY_BASE_DELAY_MS", "30000"))

    # Node supervisor config
    node_worker_cwd: Path = ROOT_DIR / "hf-worker"
    node_bridge_path: Path = ROOT_DIR / "autonomous" / "node" / "bridge.js"

    # Health & Circuit Breaker Thresholds
    failure_threshold_for_maintenance: int = int(os.getenv("FAILURE_THRESHOLD_MAINTENANCE", "5"))

CONFIG = OrchestratorConfig()
