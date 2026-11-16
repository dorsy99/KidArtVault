import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app


@pytest.fixture()
def client(tmp_path):
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
