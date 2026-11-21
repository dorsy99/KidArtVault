import logging
import os
import secrets
from pathlib import Path
from dataclasses import dataclass

logger = logging.getLogger("kidartvault")

INSECURE_SECRET_KEYS = {
    "",
    "dev-insecure-secret-change-in-production",
    "change-me-to-a-long-random-hex-string-at-least-32-chars",
}


def _resolve_secret_key(data_dir: Path, raw_secret: str) -> str:
    cleaned = raw_secret.strip()
    if cleaned not in INSECURE_SECRET_KEYS:
        return cleaned

    secret_file = data_dir / ".secret_key"
    try:
        if secret_file.is_file():
            persisted = secret_file.read_text(encoding="utf-8").strip()
            if len(persisted) >= 32:
                logger.warning(
                    "SECRET_KEY is unset or uses a placeholder; using persisted key from %s",
                    secret_file,
                )
                return persisted

        data_dir.mkdir(parents=True, exist_ok=True)
        generated = secrets.token_hex(32)
        secret_file.write_text(generated, encoding="utf-8")
        try:
            os.chmod(secret_file, 0o600)
        except OSError:
            pass
        logger.warning(
            "SECRET_KEY is unset or uses a placeholder; generated and persisted a new secret key at %s",
            secret_file,
        )
        return generated
    except OSError:
        return secrets.token_hex(32)


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
    forwarded_allow_ips: str = "127.0.0.1,::1"
    session_max_age_seconds: int = 60 * 60 * 24 * 30  # 30 days
    pending_2fa_max_age_seconds: int = 60 * 5  # 5 minutes


def load_settings() -> Settings:
    data_dir = Path(os.environ.get("DATA_DIR", "./data")).resolve()
    originals_dir = data_dir / "originals"
    thumbs_dir = data_dir / "thumbs"
    db_path = data_dir / "kidartvault.db"

    static_env = os.environ.get("STATIC_DIR", "")
    static_dir = Path(static_env).resolve() if static_env else None

    secret_key = _resolve_secret_key(data_dir, os.environ.get("SECRET_KEY", ""))
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
    forwarded_allow_ips = os.environ.get("FORWARDED_ALLOW_IPS", "127.0.0.1,::1").strip() or "127.0.0.1,::1"

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
        forwarded_allow_ips=forwarded_allow_ips,
    )
