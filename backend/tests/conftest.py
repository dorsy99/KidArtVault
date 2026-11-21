import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app
from app.security import (
    auth_rate_limiter,
    share_media_rate_limiter,
    share_miss_rate_limiter,
    share_rate_limiter,
)


def _clear_limiters() -> None:
    auth_rate_limiter._attempts.clear()
    share_rate_limiter._attempts.clear()
    share_media_rate_limiter._attempts.clear()
    share_miss_rate_limiter._attempts.clear()


@pytest.fixture()
def client(tmp_path):
    _clear_limiters()
    settings = Settings(
        data_dir=tmp_path,
        db_path=tmp_path / "test.db",
        originals_dir=tmp_path / "originals",
        thumbs_dir=tmp_path / "thumbs",
        static_dir=None,
        secret_key="test-secret-key-for-pytest-only",
        cookie_secure=False,
        allowed_origins=(),
        max_upload_bytes=10 * 1024 * 1024,
    )
    app = create_app(settings)
    with TestClient(app) as c:
        yield c
    _clear_limiters()
