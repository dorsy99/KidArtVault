import os
from pathlib import Path
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    data_dir: Path
    db_path: Path
    originals_dir: Path
    thumbs_dir: Path
    static_dir: Path | None
    secret_key: str
    cookie_secure: bool | None
    allowed_origins: tuple[str, ...]
    max_upload_bytes: int
    session_max_age_seconds: int = 60 * 60 * 24 * 30  # 30 days
    pending_2fa_max_age_seconds: int = 60 * 5  # 5 minutes


def load_settings() -> Settings:
    data_dir = Path(os.environ.get("DATA_DIR", "./data")).resolve()
    originals_dir = data_dir / "originals"
    thumbs_dir = data_dir / "thumbs"
    db_path = data_dir / "kidartvault.db"

    static_env = os.environ.get("STATIC_DIR", "")
    static_dir = Path(static_env).resolve() if static_env else None

    secret_key = os.environ.get("SECRET_KEY", "dev-insecure-secret-change-in-production")
    raw_cookie_secure = os.environ.get("COOKIE_SECURE", "auto").strip().lower()
    if raw_cookie_secure in ("1", "true", "yes"):
        cookie_secure: bool | None = True
    elif raw_cookie_secure in ("0", "false", "no"):
        cookie_secure = False
    else:
        cookie_secure = None

    raw_origins = os.environ.get("ALLOWED_ORIGINS", "")
    allowed_origins = tuple(o.strip().rstrip("/") for o in raw_origins.split(",") if o.strip())

    max_upload_mb = int(os.environ.get("MAX_UPLOAD_MB", "30"))

    return Settings(
        data_dir=data_dir,
        db_path=db_path,
        originals_dir=originals_dir,
        thumbs_dir=thumbs_dir,
        static_dir=static_dir,
        secret_key=secret_key,
        cookie_secure=cookie_secure,
        allowed_origins=allowed_origins,
        max_upload_bytes=max_upload_mb * 1024 * 1024,
    )
